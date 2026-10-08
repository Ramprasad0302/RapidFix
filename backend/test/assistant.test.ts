import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env';
import { prisma } from '../src/config/prisma';
import { resetAssistantKnowledge } from '../src/services/assistant.service';
import { API, bearer, otpLogin, request, resetDb, seedCatalog } from './helpers';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ask = (content: string, token?: string) => {
  const r = request().post(`${API}/assistant/chat`);
  if (token) r.set(bearer(token));
  return r.send({ messages: [{ role: 'user', content }] });
};

describe('RapidFix Assistant', () => {
  beforeEach(async () => {
    await resetDb();
    await seedCatalog();
    resetAssistantKnowledge();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    env.GEMINI_API_KEY = '';
    env.ANTHROPIC_API_KEY = '';
  });

  describe('built-in helper (no AI key — free)', () => {
    it('is always on and answers prices from the live catalogue', async () => {
      const fetch = vi.spyOn(globalThis, 'fetch');
      expect((await request().get(`${API}/app-config`).expect(200)).body.data.assistant).toBe(true);
      const res = await ask('my AC is not cooling, how much?').expect(200);
      expect(res.body.data.reply).toContain('**AC Repair** — from ₹299 + ₹100 visit');
      expect(res.body.data.reply).toContain('[Book](/book/s/ac-repair)');
      expect(fetch).not.toHaveBeenCalled();
      // A named appliance shows only its services, not everything called "repair".
      const { category } = (await prisma.service.findFirstOrThrow({ include: { category: true } }));
      await prisma.service.create({
        data: { categoryId: category.id, name: 'Washing Machine Repair', slug: 'washing-machine-repair', description: 'x', basePrice: 34_900, durationMinMinutes: 30, durationMaxMinutes: 60, inclusions: [], exclusions: [] },
      });
      resetAssistantKnowledge();
      const wm = (await ask('washing machine repair price')).body.data.reply;
      expect(wm).toContain('**Washing Machine Repair** — from ₹349');
      expect(wm).not.toContain('AC Repair');
    });

    it('covers payments, cancellations, emergencies and contact', async () => {
      expect((await ask('can I pay by UPI?')).body.data.reply).toMatch(/UPI \(PhonePe, Google Pay, Paytm\)/);
      expect((await ask('how do I cancel my booking')).body.data.reply).toContain('Cancel or Reschedule');
      expect((await ask('there are sparks from the switch')).body.data.reply).toContain('call 112');
      expect((await ask('customer care number please')).body.data.reply).toContain('+91 94919 63366');
    });

    it("tells a signed-in customer about their bookings, and asks guests to sign in", async () => {
      expect((await ask('where is my technician?')).body.data.reply).toContain('[sign in](/login)');
      const { token } = await otpLogin('9876500001');
      expect((await ask('where is my technician?', token)).body.data.reply).toContain("You don't have any bookings yet");
    });
  });

  describe('Gemini (free tier)', () => {
    it('answers with Gemini and looks up bookings through a function call', async () => {
      env.GEMINI_API_KEY = 'g-key';
      const { token } = await otpLogin('9876500002');
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(json({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'my_bookings', args: {} } }] } }] }))
        .mockResolvedValueOnce(json({ candidates: [{ content: { role: 'model', parts: [{ text: 'thinking…', thought: true }, { text: 'You have no bookings yet.' }] } }] }));

      const res = await ask('Where is my technician?', token).expect(200);
      expect(res.body.data.reply).toBe('You have no bookings yet.');

      const [url, init] = fetch.mock.calls[0]!;
      expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent');
      expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('g-key');
      const first = JSON.parse(String(init!.body));
      expect(first.systemInstruction.parts[0].text).toContain('AC Repair: from ₹299 + ₹100 visit');
      expect(first.tools[0].functionDeclarations[0].name).toBe('my_bookings');
      expect(first.contents).toEqual([{ role: 'user', parts: [{ text: 'Where is my technician?' }] }]);
      const second = JSON.parse(String(fetch.mock.calls[1]![1]!.body));
      expect(second.contents.at(-1)).toEqual({
        role: 'user',
        parts: [{ functionResponse: { name: 'my_bookings', response: { result: 'The customer has no bookings yet.' } } }],
      });
    });

    it('falls back to the built-in helper when the free quota is used up', async () => {
      env.GEMINI_API_KEY = 'g-key';
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }, 429));
      const res = await ask('AC repair price').expect(200);
      expect(res.body.data.reply).toContain('**AC Repair**');
    });
  });

  describe('Claude (paid, optional)', () => {
    it('is used when only an Anthropic key is set', async () => {
      env.ANTHROPIC_API_KEY = 'c-key';
      const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'We fix ACs! [Book now](/book)' }] }));
      const res = await ask('Do you repair ACs?').expect(200);
      expect(res.body.data.reply).toBe('We fix ACs! [Book now](/book)');
      const [url, init] = fetch.mock.calls[0]!;
      expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
      const body = JSON.parse(String(init!.body));
      expect(body.tools).toBeUndefined(); // guest: no booking lookups
      expect(body.system[0].text).toContain('RapidFix information');
    });
  });

  it('rejects conversations that do not end with the customer', async () => {
    await request()
      .post(`${API}/assistant/chat`)
      .send({ messages: [{ role: 'assistant', content: 'Hello' }] })
      .expect(400);
  });
});
