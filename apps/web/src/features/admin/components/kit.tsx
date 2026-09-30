import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Search, type LucideIcon } from 'lucide-react';
import { Alert, Button, cx } from '@fixora/ui';
import { Dialog } from '../../../components/Dialog';
import { EmptyState, ErrorState, Skeleton } from '../../../components/States';

/** Shared building blocks for the admin modules (same look as Dashboard / Users & Roles). */

export function PageTitle({ icon: Icon, title, subtitle, actions }: { icon: LucideIcon; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-[28px] font-bold tracking-tight text-slate-900 sm:text-[30px]">
          <Icon className="size-7 text-fixora-blue" aria-hidden /> {title}
        </h1>
        {subtitle && <p className="text-[15px] text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** URL-backed filters, so a filtered view can be bookmarked or shared. */
export function useUrlParams() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? undefined;
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  return { get, set, page: Number(params.get('page') ?? 1) };
}

export function SearchBox({ value, onSearch, placeholder, className }: { value?: string; onSearch(q: string | undefined): void; placeholder: string; className?: string }) {
  const [text, setText] = useState(value ?? '');
  return (
    <form
      role="search"
      className={cx('flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3', className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(text.trim() || undefined);
      }}
    >
      <Search className="size-4.5 text-slate-500" aria-hidden />
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
    </form>
  );
}

export function FilterSelect<T extends string>({ value, onChange, options, label }: { value?: T; onChange(v: T | undefined): void; options: { value: T; label: string }[]; label: string }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
      aria-label={label}
      className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-fixora-blue"
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export interface Column<T> {
  header: string;
  cell(row: T): ReactNode;
  className?: string;
}

/** Scrollable table with loading / empty / error states and optional row click. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  fetching,
  error,
  onRetry,
  empty = 'Nothing to show',
  minWidth = 880,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey(row: T): string;
  onRowClick?(row: T): void;
  loading?: boolean;
  fetching?: boolean;
  error?: unknown;
  onRetry?(): void;
  empty?: string;
  minWidth?: number;
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading || !rows) return <Skeleton className="mt-4 h-72" />;
  if (!rows.length) return <EmptyState title={empty} className="py-10" />;
  return (
    <div className="-mx-5 mt-4 overflow-x-auto">
      <table className={cx('w-full text-left text-sm', fetching && 'opacity-70')} style={{ minWidth }}>
        <thead>
          <tr className="border-y border-slate-100 bg-slate-50/70 text-[13px] text-slate-500">
            {columns.map((c) => (
              <th key={c.header} scope="col" className={cx('px-5 py-2.5 font-medium whitespace-nowrap', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={cx('text-slate-700', onRowClick && 'cursor-pointer outline-none hover:bg-slate-50 focus-visible:bg-fixora-blue-soft')}
            >
              {columns.map((c) => (
                <td key={c.header} className={cx('px-5 py-3', c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, total, pageSize, onPage, noun = 'results' }: { page: number; total: number; pageSize: number; onPage(p: number): void; noun?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <span>
        {total} {noun}
        {pages > 1 && ` · page ${page} of ${pages}`}
      </span>
      {pages > 1 && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} leftIcon={<ChevronLeft className="size-4" />}>
            Prev
          </Button>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'success' | 'warning' }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card">
      <p className="text-[13px] font-medium text-slate-500">{label}</p>
      <p className={cx('mt-1 text-2xl font-bold', tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-slate-900')}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
          <dt className="text-slate-500">{k}</dt>
          <dd className="text-right font-medium text-slate-900">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export const inputCls = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-fixora-blue focus:ring-3 focus:ring-fixora-blue/15';

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

/** Confirmation with a required note/reason — every sensitive action is audited with it. */
export function ReasonDialog({
  open,
  title,
  body,
  label = 'Reason',
  confirmLabel,
  danger,
  pending,
  error,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  label?: string;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  error?: string | null;
  onConfirm(reason: string): void;
  onClose(): void;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  const close = () => {
    setReason('');
    onClose();
  };
  return (
    <Dialog
      variant="center"
      open={open}
      onClose={close}
      title={title}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={reason.trim().length < 3} loading={pending} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {body && <div className="mb-3 text-[15px] text-slate-700">{body}</div>}
      {children}
      <Field label={label}>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className={cx(inputCls, 'h-auto py-2')} />
      </Field>
      {error && <Alert className="mt-3">{error}</Alert>}
    </Dialog>
  );
}

/** Title-case an ENUM_VALUE for display. */
export const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

/** YYYY-MM-DD in IST for date inputs. */
export const isoDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
