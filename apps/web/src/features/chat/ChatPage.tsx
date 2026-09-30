import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCheck, ImagePlus, Lock, MessageSquareText, Phone, SendHorizontal } from 'lucide-react';
import type { MessageDto } from '@fixora/shared-types';
import { Spinner, cx } from '@fixora/ui';
import { openChats } from '../../app/useRealtime';
import { Avatar } from '../../components/Avatar';
import { PageHeader } from '../../components/PageHeader';
import { CenteredSpinner, EmptyState, ErrorState } from '../../components/States';
import { mediaUrl } from '../../lib/api';
import { bookingApi, uploadApi } from '../../lib/endpoints';
import { dayKey, formatDayHeading, formatTime } from '../../lib/format';
import { useBookingRoom } from '../../lib/socket';
import { useAuth } from '../../store/auth';
import { toast } from '../../store/toast';
import { MobileShell } from '../customer/CustomerTabsLayout';

/**
 * Booking chat between the customer and the assigned technician
 * (read-only for staff). Messages arrive over Socket.IO; a slow poll covers
 * dropped connections.
 */
export function ChatPage({ backTo }: { backTo: (id: string) => string }) {
  const { id = '' } = useParams();
  const me = useAuth((s) => s.user?.id);
  const qc = useQueryClient();
  useBookingRoom(id);

  const info = useQuery({ queryKey: ['chat', id, 'info'], queryFn: () => bookingApi.chat(id) });
  const messages = useQuery({ queryKey: ['chat', id, 'messages'], queryFn: () => bookingApi.messages(id), refetchInterval: 30_000 });

  // Don't toast messages for the chat that's on screen.
  useEffect(() => {
    openChats.add(id);
    return () => {
      openChats.delete(id);
    };
  }, [id]);

  // Mark the other side's messages read whenever new ones are visible.
  const unreadFromOther = messages.data?.filter((m) => m.senderId !== me && !m.readAt).length ?? 0;
  useEffect(() => {
    if (!unreadFromOther || info.data?.canSend === false) return;
    void bookingApi
      .markRead(id)
      .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
      .catch(() => undefined);
  }, [id, unreadFromOther, info.data?.canSend, qc]);

  const c = info.data?.counterpart;
  return (
    <MobileShell>
      <div className="flex h-dvh flex-col lg:h-[calc(100dvh-7rem)]">
        <PageHeader
          backTo={backTo(id)}
          className="border-b border-slate-100"
          title={c ? c.name : 'Chat'}
          right={
            c?.phone ? (
              <a href={`tel:${c.phone}`} aria-label={`Call ${c.name}`} className="flex size-10 items-center justify-center rounded-full bg-fixora-blue-soft text-fixora-blue">
                <Phone className="size-4.5 fill-current" />
              </a>
            ) : undefined
          }
        />
        {info.data && (
          <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-center text-xs text-slate-500">
            {info.data.service} · {info.data.code}
          </p>
        )}
        {(info.isPending || messages.isPending) && <CenteredSpinner className="flex-1" />}
        {(info.isError || messages.isError) && (
          <ErrorState error={info.error ?? messages.error} onRetry={() => void Promise.all([info.refetch(), messages.refetch()])} />
        )}
        {info.data && messages.data && (
          <>
            <MessageList messages={messages.data} me={me} counterpartName={info.data.counterpart.name} counterpartAvatar={info.data.counterpart.avatarUrl} />
            {info.data.canSend ? (
              <Composer bookingId={id} />
            ) : (
              <p className="flex items-center justify-center gap-2 border-t border-slate-100 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm text-slate-500">
                <Lock className="size-4" aria-hidden /> Chat is closed for this booking.
              </p>
            )}
          </>
        )}
      </div>
    </MobileShell>
  );
}

function MessageList({ messages, me, counterpartName, counterpartAvatar }: { messages: MessageDto[]; me?: string; counterpartName: string; counterpartAvatar: string | null }) {
  const end = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (!messages.length) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          art={
            <span className="flex size-16 items-center justify-center rounded-full bg-fixora-blue-soft text-fixora-blue">
              <MessageSquareText className="size-8" />
            </span>
          }
          title={`Say hello to ${counterpartName.split(' ')[0]}`}
          body="Share directions, gate codes or photos of the problem. Please don't share OTPs or payment PINs."
        />
      </div>
    );
  }

  return (
    <ol className="flex flex-1 flex-col gap-1.5 overflow-y-auto bg-slate-50/60 px-3 py-4" aria-live="polite">
      {messages.map((m, i) => {
        const mine = m.senderId === me;
        const newDay = i === 0 || dayKey(messages[i - 1]!.createdAt) !== dayKey(m.createdAt);
        const firstOfRun = newDay || messages[i - 1]!.senderId !== m.senderId;
        return (
          <li key={m.id} className="flex flex-col">
            {newDay && <p className="mx-auto my-2 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm">{formatDayHeading(m.createdAt).split(',')[0]}</p>}
            <div className={cx('flex items-end gap-2', mine ? 'justify-end' : 'justify-start', firstOfRun && 'mt-1.5')}>
              {!mine && (firstOfRun ? <Avatar name={counterpartName} src={counterpartAvatar} size={28} /> : <span className="w-7 shrink-0" />)}
              <div
                className={cx(
                  'max-w-[78%] rounded-2xl px-3 py-2 text-[15px] leading-snug shadow-sm',
                  mine ? 'rounded-br-md bg-fixora-blue text-white' : 'rounded-bl-md bg-white text-slate-900',
                )}
              >
                {m.senderRole === 'STAFF' && <p className="mb-0.5 text-[11px] font-semibold opacity-80">RapidFix Support</p>}
                {m.imageUrl && (
                  <a href={mediaUrl(m.imageUrl)!} target="_blank" rel="noopener noreferrer">
                    <img src={mediaUrl(m.imageUrl)!} alt="Shared photo" loading="lazy" className="mb-1 max-h-56 w-full rounded-xl object-cover" />
                  </a>
                )}
                {m.body && <p className="break-words whitespace-pre-wrap">{m.body}</p>}
                <p className={cx('mt-0.5 flex items-center justify-end gap-1 text-[10px]', mine ? 'text-white/75' : 'text-slate-400')}>
                  {formatTime(m.createdAt)}
                  {mine && (m.readAt ? <CheckCheck className="size-3.5" aria-label="Read" /> : <Check className="size-3.5" aria-label="Sent" />)}
                </p>
              </div>
            </div>
          </li>
        );
      })}
      <div ref={end} />
    </ol>
  );
}

function Composer({ bookingId }: { bookingId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const append = (m: MessageDto) =>
    qc.setQueryData<MessageDto[]>(['chat', bookingId, 'messages'], (list) => (list?.some((x) => x.id === m.id) ? list : [...(list ?? []), m]));

  const send = useMutation({
    mutationFn: (body: { body?: string; imageUrl?: string }) => bookingApi.send(bookingId, body),
    onSuccess: append,
    onError: (e) => toast(e.message, 'error'),
  });
  const upload = useMutation({
    mutationFn: (f: File) => uploadApi.upload(f, 'image'),
    onSuccess: (r) => send.mutate({ imageUrl: r.path }),
    onError: (e) => toast(e.message, 'error'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    send.mutate({ body });
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-2 border-t border-slate-100 bg-white px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) upload.mutate(f);
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={upload.isPending}
        aria-label="Send a photo"
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
      >
        {upload.isPending ? <Spinner className="size-5" /> : <ImagePlus className="size-5.5" />}
      </button>
      <label className="sr-only" htmlFor="chat-input">
        Message
      </label>
      <textarea
        id="chat-input"
        rows={1}
        value={text}
        maxLength={1000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) submit(e);
        }}
        placeholder="Type a message…"
        className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[15px] outline-none focus:border-fixora-blue focus:bg-white"
      />
      <button
        type="submit"
        disabled={!text.trim() || send.isPending}
        aria-label="Send"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-fixora-blue text-white transition disabled:opacity-40"
      >
        <SendHorizontal className="size-5" />
      </button>
    </form>
  );
}

export const CustomerChatPage = () => <ChatPage backTo={(id) => `/bookings/${id}`} />;
export const TechnicianChatPage = () => <ChatPage backTo={(id) => `/technician/jobs/${id}`} />;
