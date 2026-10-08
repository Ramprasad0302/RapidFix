import { BookingStatus as B, type BookingStatus, type OfferDto, type ServiceSummaryDto } from '@fixora/shared-types';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import { listCustomerBookings } from './booking.service';
import { listCategories, listLocations, listOffers, listServices } from './catalog.service';
import { bookingAdvance } from './payment.service';
import { getSetting } from './settings.service';

/**
 * RapidFix Assistant: a chat that answers customers' questions — services and
 * prices, how booking and payment work, offers, the service area — and, when
 * signed in, where their own bookings stand. It only informs and links to the
 * right app screen; every action (book, pay, cancel) stays in the app.
 *
 * Who answers:
 *  1. Google Gemini (GEMINI_API_KEY — free tier from Google AI Studio), or
 *  2. Claude (ANTHROPIC_API_KEY, paid), if that's the key that is set;
 *  3. the built-in helper — free, always on: answers from RapidFix's own data
 *     with keyword matching. Used with no AI key, and whenever the AI is
 *     unreachable or its free daily quota is used up, so the chat never fails.
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Asker {
  userId?: string;
  signedIn: boolean;
}

const MAX_TOOL_ROUNDS = 3;

/** The built-in helper is always available, so the assistant always is. */
export const assistantEnabled = () => true;
export const assistantProvider = (): 'gemini' | 'claude' | 'builtin' =>
  env.GEMINI_API_KEY ? 'gemini' : env.ANTHROPIC_API_KEY ? 'claude' : 'builtin';

const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

const CUSTOMER_STATUS: Record<BookingStatus, string> = {
  [B.PENDING]: 'Awaiting payment (advance not paid yet)',
  [B.SEARCHING]: 'Finding the nearest technician',
  [B.TECHNICIAN_ASSIGNED]: 'Technician assigned',
  [B.TECHNICIAN_ACCEPTED]: 'Technician confirmed',
  [B.TECHNICIAN_EN_ROUTE]: 'Technician on the way',
  [B.TECHNICIAN_ARRIVED]: 'Technician has arrived',
  [B.SERVICE_STARTED]: 'Work in progress',
  [B.ADDITIONAL_CHARGE_REQUESTED]: 'Waiting for you to approve an extra charge',
  [B.ADDITIONAL_CHARGE_APPROVED]: 'Work in progress',
  [B.SERVICE_COMPLETED]: 'Work done, payment pending',
  [B.PAYMENT_PENDING]: 'Work done, payment pending',
  [B.PAYMENT_COMPLETED]: 'Completed and paid',
  [B.CUSTOMER_CANCELLED]: 'Cancelled by you',
  [B.TECHNICIAN_CANCELLED]: 'Cancelled by the technician',
  [B.ADMIN_CANCELLED]: 'Cancelled by RapidFix',
  [B.NO_SHOW]: 'Marked as no-show',
  [B.DISPUTED]: 'Under review by RapidFix support',
  [B.REFUNDED]: 'Refunded',
};

// ─── What RapidFix knows about itself (rebuilt every 10 minutes: prices change in Admin) ───

interface Facts {
  services: ServiceSummaryDto[];
  offers: OfferDto[];
  area: string;
  phone: string;
  email: string;
  payment: string;
  cancel: string;
  booking: string;
  promptText: string;
}

const CANCEL_TEXT =
  'Open the booking in My Bookings (/bookings) and tap Cancel or Reschedule, any time before the technician starts travelling. Online payments for cancelled bookings are refunded automatically to the same account (usually 5–7 working days).';
const BOOKING_TEXT =
  'Pick a service → describe the problem (photos optional) → address (pin your door on the map) → time (now or a slot) → review & confirm. The nearest verified technician gets your job first, and you can track them live.';

let cached: { facts: Facts; at: number } | null = null;
async function facts(): Promise<Facts> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.facts;
  const [categories, services, locations, offers, advance, phone, email] = await Promise.all([
    listCategories(),
    listServices({ limit: 500 }),
    listLocations(),
    listOffers().catch(() => [] as OfferDto[]),
    bookingAdvance(),
    getSetting('support.phone', '+91 94919 63366'),
    getSetting('support.email', 'support@rapidfix.in'),
  ]);
  const area = locations.map((l) => `${l.name} (${l.district}, ${l.state})`).join('; ') || 'Tanuku, West Godavari, Andhra Pradesh';
  const payment =
    advance > 0
      ? `A ${rupees(advance)} advance is paid online when you book — it confirms the booking and is adjusted in the final bill (you can also pay the full amount online). The rest is paid after the work: UPI (PhonePe, Google Pay, Paytm), debit/credit card, or cash to the technician.`
      : 'You pay after the work: UPI (PhonePe, Google Pay, Paytm), debit/credit card, or cash to the technician.';
  const byCategory = categories.map((c) => {
    const lines = services
      .filter((s) => s.category.id === c.id)
      .map((s) => {
        const time = s.durationMaxMinutes ? ` · ${s.durationMinMinutes}–${s.durationMaxMinutes} min` : '';
        const visit = s.visitCharge ? ` + ${rupees(s.visitCharge)} visit` : '';
        return `  - ${s.name}: from ${rupees(s.basePrice)}${visit}${time} → /book/s/${s.slug}`;
      });
    return `* ${c.name} (/book/c/${c.slug})\n${lines.join('\n')}`;
  });
  const promptText = [
    `Service area: ${area}.`,
    `Support: phone ${phone}, email ${email}, every day 8 AM – 9 PM. Help page: /help`,
    `Booking: ${BOOKING_TEXT}`,
    `Payment: ${payment}`,
    `The price shown before booking is an estimate. Extra work or parts are charged only if the technician requests it in the app and the customer approves.`,
    `Cancel or reschedule: ${CANCEL_TEXT}`,
    `Every technician is ID-verified and approved by RapidFix; customers can chat with their technician from the booking.`,
    `Other screens: Home /, Search /search, All services /book, Offers /offers, My bookings /bookings, Profile /account, Saved addresses /account/addresses, Become a partner /partner.`,
    `\nServices and starting prices (final price depends on the work; parts extra):\n${byCategory.join('\n')}`,
    offers.length ? `\nCurrent offers:\n${offers.map(offerLine).join('\n')}` : '',
  ].join('\n');
  const f = { services, offers, area, phone, email, payment, cancel: CANCEL_TEXT, booking: BOOKING_TEXT, promptText };
  cached = { facts: f, at: Date.now() };
  return f;
}

const offerLine = (o: OfferDto) =>
  `  - Code ${o.code}: ${o.badge} — ${o.title}${o.minOrderAmount ? `, on orders above ${rupees(o.minOrderAmount)}` : ''}${o.endsAt ? `, valid till ${o.endsAt.slice(0, 10)}` : ''} → /offers/${o.code}`;

function systemPrompt(f: Facts, signedIn: boolean) {
  return `You are the RapidFix Assistant inside the RapidFix app and website (rapidfix.in) — a home-services company that sends verified technicians for AC, electrical, plumbing, carpentry, painting, appliance repair, cleaning, CCTV and RO water purifier work.

How to answer:
- Be warm, brief and practical: usually 1–4 short sentences or a few bullet points. Use **bold** sparingly.
- Reply in the customer's language (English, Telugu or Hindi — match how they write, including romanised Telugu/Hindi).
- Only state facts from the RapidFix information below. Never invent prices, offers, timings or policies; if something isn't covered, say so and offer support (phone/help page).
- When suggesting a screen, link it with markdown using ONLY the app paths given below, e.g. [Book AC service](/book/s/ac-service). Never link outside rapidfix.in.
- You cannot book, cancel, reschedule, pay or change anything yourself — guide the customer to the right screen.
- For simple home fixes you may give basic, safe tips, but for anything electrical, gas or risky, recommend booking a technician. In an emergency (fire, gas leak, electric shock) tell them to call 112 first.
- ${signedIn ? 'The customer is signed in: use the my_bookings tool for questions about their bookings, technician or payments.' : 'The customer is not signed in: for questions about their own bookings, ask them to sign in (/login) or open My Bookings.'}
- Stay on RapidFix topics; politely decline unrelated requests.

RapidFix information:
${f.promptText}`;
}

const MY_BOOKINGS = {
  name: 'my_bookings',
  description: "The signed-in customer's most recent bookings (newest first): code, service, status, schedule, technician, amount and the app link to open each.",
};

async function bookingsOf(userId: string) {
  const customer = await prisma.customer.findUnique({ where: { userId }, select: { id: true } });
  if (!customer) return [];
  return (await listCustomerBookings(customer.id, 'all', 1, 6)).items;
}

async function myBookings(userId: string): Promise<string> {
  const items = await bookingsOf(userId);
  if (!items.length) return 'The customer has no bookings yet.';
  return items
    .map(
      (b) =>
        `${b.code}: ${b.service.name} — ${CUSTOMER_STATUS[b.status]}; ${b.scheduleType === 'NOW' ? 'booked for now' : `scheduled ${b.scheduledFor.slice(0, 10)} ${b.timeSlot}`}; technician ${b.technicianName ?? 'not assigned yet'}; total ${rupees(b.totalAmount)}; open: /bookings/${b.id}`,
    )
    .join('\n');
}

const runTool = async (name: string, who: Asker) => (name === MY_BOOKINGS.name && who.userId ? myBookings(who.userId) : 'Unknown tool.');

class AiUnavailable extends Error {}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    throw new AiUnavailable(`unreachable: ${(err as Error).message}`);
  }
  if (!res.ok) throw new AiUnavailable(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  return res.json() as Promise<unknown>;
}

// ─── Google Gemini (free tier) ───────────────────────────────────────────

interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: Record<string, unknown> };
}
interface GeminiContent {
  role: 'user' | 'model';
  parts: (GeminiPart | { functionResponse: { name: string; response: { result: string } } })[];
}

async function askGemini(messages: ChatMessage[], who: Asker, f: Facts): Promise<string> {
  const contents: GeminiContent[] = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const url = `${env.GEMINI_API_URL.replace(/\/$/, '')}/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`;
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const out = (await post(url, { 'x-goog-api-key': env.GEMINI_API_KEY }, {
      systemInstruction: { parts: [{ text: systemPrompt(f, who.signedIn) }] },
      contents,
      ...(who.signedIn && round < MAX_TOOL_ROUNDS && { tools: [{ functionDeclarations: [MY_BOOKINGS] }] }),
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    })) as { candidates?: { content?: { role: 'model'; parts?: GeminiPart[] } }[] };
    const content = out.candidates?.[0]?.content;
    const parts = content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) {
      const reply = parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join('')
        .trim();
      if (!reply) throw new AiUnavailable('empty Gemini reply');
      return reply;
    }
    // The model's turn goes back verbatim (it carries Gemini's thought signatures).
    contents.push({ role: 'model', parts });
    contents.push({
      role: 'user',
      parts: await Promise.all(calls.map(async (p) => ({ functionResponse: { name: p.functionCall!.name, response: { result: await runTool(p.functionCall!.name, who) } } }))),
    });
  }
  throw new AiUnavailable('too many tool rounds');
}

// ─── Claude (paid) ───────────────────────────────────────────────────────

type ClaudeBlock = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

async function askClaude(messages: ChatMessage[], who: Asker, f: Facts): Promise<string> {
  const system = [{ type: 'text', text: systemPrompt(f, who.signedIn), cache_control: { type: 'ephemeral' } }];
  const history: { role: 'user' | 'assistant'; content: string | unknown[] }[] = messages.map((m) => ({ role: m.role, content: m.content }));
  const tool = { ...MY_BOOKINGS, input_schema: { type: 'object', properties: {}, additionalProperties: false } };
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const out = (await post(env.ASSISTANT_API_URL, { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, {
      model: env.ASSISTANT_MODEL,
      max_tokens: 800,
      system,
      messages: history,
      ...(who.signedIn && round < MAX_TOOL_ROUNDS && { tools: [tool] }),
    })) as { content: ClaudeBlock[]; stop_reason: string };
    const uses = out.content.filter((b): b is Extract<ClaudeBlock, { type: 'tool_use' }> => b.type === 'tool_use');
    if (out.stop_reason !== 'tool_use' || !uses.length) {
      const reply = out.content
        .filter((b): b is Extract<ClaudeBlock, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (!reply) throw new AiUnavailable('empty Claude reply');
      return reply;
    }
    history.push({ role: 'assistant', content: out.content });
    history.push({ role: 'user', content: await Promise.all(uses.map(async (u) => ({ type: 'tool_result', tool_use_id: u.id, content: await runTool(u.name, who) }))) });
  }
  throw new AiUnavailable('too many tool rounds');
}

// ─── Built-in helper (free, no AI) ───────────────────────────────────────

/** Everyday words → what the catalogue calls it. */
const SYNONYMS: [RegExp, string][] = [
  [/\b(a\.?c|aircon|air ?condition\w*|cooling)\b/, 'AC'],
  [/\b(fridge|refrigerator)\b/, 'refrigerator'],
  [/\b(washing ?machine|washer)\b/, 'washing machine'],
  [/\b(geyser|water ?heater)\b/, 'geyser'],
  [/\b(tap|leak\w*|pipe|drain|toilet|plumb\w*|bathroom)\b/, 'plumb'],
  [/\b(wiring|switch\w*|socket|electric\w*|power|light|mcb)\b/, 'electric'],
  [/\b(fan)\b/, 'fan'],
  [/\b(paint\w*|wall)\b/, 'paint'],
  [/\b(carpent\w*|door|furniture|wood\w*|bed|cupboard)\b/, 'carpent'],
  [/\b(clean\w*|sofa|kitchen)\b/, 'clean'],
  [/\b(cctv|camera)\b/, 'CCTV'],
  [/\b(ro|purifier|water filter)\b/, 'RO'],
  [/\b(tv|television)\b/, 'TV'],
  [/\b(microwave|oven)\b/, 'microwave'],
];

const has = (t: string, re: RegExp) => re.test(t);

function matchServices(text: string, all: ServiceSummaryDto[]): ServiceSummaryDto[] {
  const terms = SYNONYMS.filter(([re]) => re.test(text)).map(([, term]) => term.toLowerCase());
  const words = text.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  const word = (w: string) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  const termRes = terms.map(word);
  const wordRes = words.map(word);
  const score = (s: ServiceSummaryDto) => {
    const hay = `${s.name} ${s.tagline} ${s.category.name}`;
    return termRes.reduce((n, re) => n + (re.test(hay) ? 3 : 0), 0) + wordRes.reduce((n, re) => n + (re.test(hay) ? 1 : 0), 0);
  };
  return all
    .map((s) => ({ s, n: score(s) }))
    // Named an appliance or trade ("washing machine", "tap")? Only its services, not every "repair".
    .filter((x) => (termRes.length ? x.n >= 3 : x.n > 0))
    .sort((a, b) => b.n - a.n || Number(b.s.isPopular) - Number(a.s.isPopular))
    .slice(0, 4)
    .map((x) => x.s);
}

const serviceLine = (s: ServiceSummaryDto) => `- **${s.name}** — from ${rupees(s.basePrice)}${s.visitCharge ? ` + ${rupees(s.visitCharge)} visit` : ''} · [Book](/book/s/${s.slug})`;

async function builtinReply(messages: ChatMessage[], who: Asker, f: Facts): Promise<string> {
  const t = (messages.at(-1)?.content ?? '').toLowerCase();

  if (has(t, /\b(fire|gas leak|smell of gas|shock|sparks?|burning)\b/)) {
    return `⚠️ If anyone is in danger, **call 112 now** and switch off the main power or gas if it's safe.\n\nOnce everyone is safe, an electrician can check it: [Book an electrician](/book).`;
  }
  if (has(t, /\b(partner|become a technician|join (as|rapidfix)|work with you)\b/)) return `Skilled technicians can join RapidFix as partners: [Become a partner](/partner).`;
  if (has(t, /\b(cancel\w*|reschedul\w*|change (the )?(time|date)|postpone)\b/)) return `${f.cancel}\n\n[Go to My Bookings](/bookings)`;
  if (has(t, /\b(refund\w*)\b/)) return `Refunds for online payments go back automatically to the same account or UPI, usually within 5–7 working days after a cancellation. Need help with one? Call **${f.phone}**.`;
  if (has(t, /\b(my booking|booking status|where is|technician|track|status|when will|eta|arriv\w*|coming|order)\b/)) {
    if (!who.signedIn || !who.userId) return `Please [sign in](/login) and open [My Bookings](/bookings) — you'll see your technician, their live location and the status of each booking.`;
    const items = await bookingsOf(who.userId);
    if (!items.length) return `You don't have any bookings yet. [Book a service](/book) — the nearest verified technician gets your job first.`;
    const lines = items
      .slice(0, 3)
      .map((b) => `- **${b.service.name}** (${b.code}) — ${CUSTOMER_STATUS[b.status]}${b.technicianName ? `, technician ${b.technicianName}` : ''} · [Open](/bookings/${b.id})`);
    return `Here are your latest bookings:\n${lines.join('\n')}\n\nOpen a booking to track the technician live or chat with them.`;
  }
  if (has(t, /\b(pay\w*|advance|upi|cash|card|gpay|phonepe|paytm|razorpay)\b/)) return f.payment;
  if (has(t, /\b(offer\w*|discount\w*|coupon\w*|promo\w*|deal\w*)\b/)) {
    if (!f.offers.length) return `There are no offers running right now — check [Offers](/offers) again soon.`;
    return `Current offers:\n${f.offers.slice(0, 4).map((o) => `- **${o.code}** — ${o.badge}: ${o.title} · [View](/offers/${o.code})`).join('\n')}`;
  }
  if (has(t, /\b(area|areas|city|town|serve|service area|available in|location|where do you)\b/)) return `We currently serve **${f.area}**. Pin your address on the map when booking and we'll confirm it.`;
  if (has(t, /\b(contact|support|customer care|phone number|call you|email|human|agent|complain\w*)\b/)) {
    return `You can reach RapidFix support every day, 8 AM – 9 PM:\n- 📞 **${f.phone}**\n- ✉️ ${f.email}\n\nOr see [Help & Support](/help).`;
  }
  if (has(t, /\b(how (do|to|can) i book|book(ing)? (a )?service|how does it work|process)\b/)) return `${f.booking}\n\n[Book a service](/book)`;

  const found = matchServices(t, f.services);
  if (found.length) {
    return `Here's what we offer for that:\n${found.map(serviceLine).join('\n')}\n\nFinal price depends on the work; parts are extra. The nearest verified technician gets your job first.`;
  }
  if (has(t, /\b(price\w*|cost\w*|charge\w*|rate\w*|how much|fees?)\b/)) {
    const popular = f.services.filter((s) => s.isPopular).slice(0, 5);
    return `Our most booked services:\n${(popular.length ? popular : f.services.slice(0, 5)).map(serviceLine).join('\n')}\n\nSee everything in [All services](/book).`;
  }
  if (has(t, /^(hi|hello|hey|namaste|namaskaram|good (morning|afternoon|evening))\b/)) {
    return `Hello! 👋 Tell me what needs fixing — e.g. "AC not cooling" or "tap leaking" — and I'll show you the right service and price.`;
  }
  return `I can help with services and prices, booking, payments, offers and your bookings. Try asking "AC service price" or "where is my technician?".\n\nFor anything else, call **${f.phone}** or see [Help & Support](/help).`;
}

// ─── Entry point ─────────────────────────────────────────────────────────

/** One assistant reply to the conversation so far. Never fails: falls back to the built-in helper. */
export async function chat(input: { messages: ChatMessage[]; userId?: string; role?: string }): Promise<{ reply: string }> {
  const who: Asker = { userId: input.userId, signedIn: !!input.userId && input.role === 'CUSTOMER' };
  const f = await facts();
  const provider = assistantProvider();
  if (provider !== 'builtin') {
    try {
      return { reply: provider === 'gemini' ? await askGemini(input.messages, who, f) : await askClaude(input.messages, who, f) };
    } catch (err) {
      // Quota used up, outage or slow network: answer with the built-in helper instead.
      logger.warn({ provider, err: (err as Error).message }, 'Assistant AI unavailable; using the built-in helper');
    }
  }
  return { reply: await builtinReply(input.messages, who, f) };
}

/** For tests: forget the cached business information. */
export const resetAssistantKnowledge = () => {
  cached = null;
};
