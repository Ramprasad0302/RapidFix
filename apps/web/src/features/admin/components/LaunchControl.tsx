import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Rocket } from 'lucide-react';
import { Button, cx } from '@fixora/ui';
import { Toggle } from '../../../components/Toggle';
import { adminModulesApi, type LaunchStateDto } from '../../../lib/endpoints';
import { toast } from '../../../store/toast';

/**
 * Super Admin: launch event mode. On → every visitor of the website and the apps sees the
 * "ready to launch" opening screen with an "Open now" button. Off → the site opens normally.
 */
export function LaunchControl() {
  const qc = useQueryClient();
  const state = useQuery({ queryKey: ['admin', 'launch'], queryFn: adminModulesApi.launch });
  const [draft, setDraft] = useState<{ headline: string; subline: string } | null>(null);
  const save = useMutation({
    mutationFn: (body: { enabled: boolean; headline?: string; subline?: string }) => adminModulesApi.setLaunch(body),
    onSuccess: (d: LaunchStateDto) => {
      qc.setQueryData(['admin', 'launch'], d);
      void qc.invalidateQueries({ queryKey: ['app-config'] });
      setDraft(null);
      toast(d.enabled ? 'Launch screen is ON — every visitor now sees the opening screen' : 'Launch screen is OFF — RapidFix opens normally for everyone');
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const s = state.data;
  if (!s) return null;
  const text = draft ?? { headline: s.headline, subline: s.subline };
  const changed = !!draft && (draft.headline !== s.headline || draft.subline !== s.subline);

  return (
    <section
      className={cx(
        'mt-6 overflow-hidden rounded-2xl border p-5 shadow-card',
        s.enabled ? 'border-fixora-cyan/40 bg-gradient-to-br from-fixora-navy via-[#12306a] to-fixora-blue text-white' : 'border-slate-200 bg-white',
      )}
    >
      <div className="flex flex-wrap items-center gap-4">
        <span className={cx('flex size-12 items-center justify-center rounded-2xl', s.enabled ? 'bg-white/15' : 'bg-fixora-blue-soft')}>
          <Rocket className={cx('size-6', s.enabled ? 'text-fixora-cyan' : 'text-fixora-blue')} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">Launch event</p>
          <p className={cx('text-sm', s.enabled ? 'text-white/75' : 'text-slate-500')}>
            {s.enabled
              ? 'ON — everyone opening the website or the app sees the launch screen. The chief guest taps “Open now” to open RapidFix.'
              : 'OFF — RapidFix opens normally. Switch on before the launch event to show the opening screen to everyone.'}
          </p>
        </div>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className={cx('flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium', s.enabled ? 'bg-white/10 hover:bg-white/20' : 'text-fixora-blue hover:bg-fixora-blue-soft')}
        >
          <Eye className="size-4" aria-hidden /> Preview
        </a>
        <span className="flex items-center gap-2 text-sm font-semibold">
          {s.enabled ? 'On' : 'Off'}
          <Toggle checked={s.enabled} disabled={save.isPending} label="Launch screen" onChange={(on) => save.mutate({ enabled: on, ...(draft ?? {}) })} />
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className={cx('mb-1 block font-medium', s.enabled ? 'text-white/80' : 'text-slate-700')}>Headline</span>
          <input
            value={text.headline}
            maxLength={80}
            onChange={(e) => setDraft({ ...text, headline: e.target.value })}
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] text-slate-900 outline-none focus:border-fixora-blue"
          />
        </label>
        <label className="text-sm">
          <span className={cx('mb-1 block font-medium', s.enabled ? 'text-white/80' : 'text-slate-700')}>Line below (e.g. “Inaugurated by Hon’ble MLA …”)</span>
          <input
            value={text.subline}
            maxLength={200}
            onChange={(e) => setDraft({ ...text, subline: e.target.value })}
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] text-slate-900 outline-none focus:border-fixora-blue"
          />
        </label>
      </div>
      {changed && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate({ enabled: s.enabled, ...draft! })}>
            Save text
          </Button>
        </div>
      )}
    </section>
  );
}
