import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { RotateCcw, SendHorizontal, Sparkles } from 'lucide-react';
import { cx } from '@fixora/ui';
import { PageHeader } from '../../components/PageHeader';
import { assistantApi, type AssistantMessage } from '../../lib/endpoints';
import { haptic } from '../../lib/haptics';
import { useAuth } from '../../store/auth';
import { MobileShell } from '../customer/CustomerTabsLayout';

const STORE_KEY = 'rapidfix.assistant';
const MAX_SENT = 20; // the server accepts 24; older turns are dropped from what's sent

const SUGGESTIONS_GUEST = ['My AC is not cooling', 'What are your prices?', 'How does payment work?', 'Which areas do you serve?'];
const SUGGESTIONS_CUSTOMER = ['Where is my technician?', 'My AC is not cooling', 'Any offers today?', 'How do I cancel a booking?'];

function load(): AssistantMessage[] {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as AssistantMessage[]) : [];
  } catch {
    return [];
  }
}

/**
 * RapidFix Assistant: AI chat that answers questions about services, prices,
 * booking, payments and offers — and, for signed-in customers, their bookings.
 * The conversation lasts for this visit (sessionStorage).
 */
export function AssistantPage() {
  const signedIn = useAuth((s) => s.user?.role === 'CUSTOMER');
  const firstName = useAuth((s) => s.user?.name?.split(' ')[0]);
  const [messages, setMessages] = useState<AssistantMessage[]>(load);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* storage unavailable */
    }
  }, [messages]);

  const ask = useMutation({
    mutationFn: (history: AssistantMessage[]) => assistantApi.chat(history.slice(-MAX_SENT)),
    onSuccess: ({ reply }) => {
      haptic('light');
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    },
    onError: () => haptic('error'),
  });

  useLayoutEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, ask.isPending, ask.isError]);

  const send = (content: string) => {
    const body = content.trim().slice(0, 2000);
    if (!body || ask.isPending) return;
    haptic('selection');
    const next = [...messages, { role: 'user' as const, content: body }];
    setMessages(next);
    setText('');
    ask.mutate(next);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
  };

  const restart = () => {
    haptic('light');
    ask.reset();
    setMessages([]);
    input.current?.focus();
  };

  return (
    <MobileShell>
      <div className="flex h-dvh flex-col lg:h-[calc(100dvh-9.5rem)]">
        <PageHeader
          backTo="/"
          className="border-b border-slate-100"
          title="RapidFix Assistant"
          right={
            messages.length ? (
              <button onClick={restart} aria-label="New conversation" className="flex size-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
                <RotateCcw className="size-5" />
              </button>
            ) : undefined
          }
        />

        <ol className="flex flex-1 flex-col gap-3 overflow-y-auto bg-slate-50/60 px-3 py-4" aria-live="polite">
          <Bubble role="assistant">
            <p>
              Hi{firstName ? ` ${firstName}` : ''}! 👋 I’m the RapidFix Assistant. Ask me about our services, prices, booking, payments or offers
              {signedIn ? ' — or how your booking is going' : ''}. I can reply in English, తెలుగు or हिंदी.
            </p>
          </Bubble>

          {!messages.length && (
            <li className="flex flex-wrap gap-2 pl-10">
              {(signedIn ? SUGGESTIONS_CUSTOMER : SUGGESTIONS_GUEST).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-fixora-blue/25 bg-white px-3.5 py-2 text-sm font-medium text-fixora-blue shadow-sm active:scale-[0.97]"
                >
                  {s}
                </button>
              ))}
            </li>
          )}

          {messages.map((m, i) => (
            <Bubble key={i} role={m.role}>
              {m.role === 'assistant' ? <RichText text={m.content} /> : <p className="break-words whitespace-pre-wrap">{m.content}</p>}
            </Bubble>
          ))}

          {ask.isPending && (
            <Bubble role="assistant">
              <span className="flex h-5 items-center gap-1" aria-label="Assistant is typing">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="size-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d * 150}ms` }} />
                ))}
              </span>
            </Bubble>
          )}

          {ask.isError && (
            <li className="mx-auto flex flex-col items-center gap-2 text-center text-sm text-slate-500">
              {ask.error.message}
              <button onClick={() => ask.mutate(messages)} className="rounded-full bg-white px-4 py-1.5 font-semibold text-fixora-blue shadow-sm">
                Try again
              </button>
            </li>
          )}
          <div ref={end} />
        </ol>

        <form onSubmit={submit} className="flex items-end gap-2 border-t border-slate-100 bg-white px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <textarea
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(text);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Ask anything about RapidFix…"
            aria-label="Message"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-base leading-snug outline-none focus:border-fixora-blue focus:bg-white"
          />
          <button
            type="submit"
            disabled={!text.trim() || ask.isPending}
            aria-label="Send"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-fixora-blue text-white transition active:scale-95 disabled:opacity-40"
          >
            <SendHorizontal className="size-5" />
          </button>
        </form>
        <p className="bg-white pb-2 text-center text-[11px] text-slate-400">AI can make mistakes — confirm prices on the booking screen.</p>
      </div>
    </MobileShell>
  );
}

function Bubble({ role, children }: { role: AssistantMessage['role']; children: ReactNode }) {
  const mine = role === 'user';
  return (
    <li className={cx('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
      {!mine && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fixora-blue to-sky-500 text-white shadow-sm" aria-hidden>
          <Sparkles className="size-4" />
        </span>
      )}
      <div
        className={cx(
          'max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed shadow-sm',
          mine ? 'rounded-br-md bg-fixora-blue text-white' : 'rounded-bl-md bg-white text-slate-800',
        )}
      >
        {children}
      </div>
    </li>
  );
}

/** The assistant's light markdown: paragraphs, "-" bullets, **bold** and [label](/app-path) links. */
function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`l${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">
        {list.map((li, i) => (
          <li key={i}>{inline(li)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const line of text.split('\n')) {
    const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]!);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={`p${blocks.length}`} className="my-1 first:mt-0 last:mb-0">{inline(line.replace(/^#+\s*/, ''))}</p>);
  }
  flush();
  return <div className="break-words">{blocks}</div>;
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<strong key={m.index}>{m[1]}</strong>);
    else out.push(<AppLink key={m.index} label={m[2]!} href={m[3]!} />);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out.map((n, i) => <Fragment key={i}>{n}</Fragment>);
}

/** Only app pages become links (in-app navigation); anything else is shown as plain text. */
function AppLink({ label, href }: { label: string; href: string }) {
  const path = href.replace(/^https?:\/\/(www\.)?rapidfix\.in/, '');
  if (!path.startsWith('/') || path.startsWith('//')) return <>{label}</>;
  return (
    <Link to={path} onClick={() => haptic('selection')} className="font-semibold text-fixora-blue underline decoration-fixora-blue/30 underline-offset-2">
      {label}
    </Link>
  );
}
