import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Landmark, WalletCards } from 'lucide-react';
import type { WalletTxnDto } from '@fixora/shared-types';
import { formatINR } from '@fixora/shared-utils';
import { cx } from '@fixora/ui';
import { ErrorState, Skeleton } from '../../../components/States';
import { technicianApi } from '../../../lib/endpoints';
import { formatDate } from '../../../lib/format';

const TYPE_LABEL: Record<WalletTxnDto['type'], string> = {
  EARNING_CREDIT: 'Online payment earning',
  COMMISSION_DEBIT: 'RapidFix fee (cash / UPI job)',
  PAYOUT_DEBIT: 'Payout to you',
  ADJUSTMENT: 'Adjustment',
};

/**
 * RapidFix wallet: online payments credit your share; cash/UPI jobs debit RapidFix's
 * fee (you already hold the money). Positive balance = RapidFix pays you out.
 */
export function WalletSection() {
  const wallet = useQuery({ queryKey: ['tech', 'wallet'], queryFn: technicianApi.wallet });
  if (wallet.isPending) return <Skeleton className="h-40" />;
  if (wallet.isError && !wallet.data) return <ErrorState error={wallet.error} onRetry={() => void wallet.refetch()} />;
  const w = wallet.data;
  const owes = w.balance < 0;

  return (
    <section className="rounded-2xl border border-slate-100 p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <WalletCards className="size-4.5 text-fixora-blue" aria-hidden /> RapidFix Wallet
          </p>
          <p className={cx('mt-1 text-[28px] font-bold', owes ? 'text-danger' : 'text-slate-900')}>{formatINR(Math.abs(w.balance))}</p>
          <p className="text-xs text-slate-500">{owes ? 'Fee due to RapidFix — settled from your next online earnings or payout.' : w.balance > 0 ? 'Available for your next payout.' : 'All settled.'}</p>
        </div>
        <Link to="/technician/payout-details" className="flex items-center gap-1 rounded-lg bg-fixora-blue-soft px-2.5 py-1.5 text-xs font-semibold text-fixora-blue">
          <Landmark className="size-3.5" /> Bank / UPI
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5 text-sm">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Total earned</p>
          <p className="font-semibold text-slate-900">{formatINR(w.totalEarned)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Paid out</p>
          <p className="font-semibold text-slate-900">{formatINR(w.totalPaidOut)}</p>
        </div>
      </div>
      {w.transactions.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {w.transactions.slice(0, 8).map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-full', t.amount >= 0 ? 'bg-success-soft text-success' : 'bg-slate-100 text-slate-600')}>
                {t.amount >= 0 ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{TYPE_LABEL[t.type]}</p>
                <p className="truncate text-xs text-slate-500">
                  {t.description} · {formatDate(t.createdAt)}
                </p>
              </div>
              <p className={cx('text-sm font-semibold', t.amount >= 0 ? 'text-success' : 'text-slate-900')}>
                {t.amount >= 0 ? '+' : '−'}
                {formatINR(Math.abs(t.amount))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
