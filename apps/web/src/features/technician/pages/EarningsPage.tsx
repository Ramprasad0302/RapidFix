import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUp, IndianRupee, Star } from 'lucide-react';
import { formatINR } from '@fixora/shared-utils';
import { EmptyState, ErrorState, Skeleton } from '../../../components/States';
import { technicianApi } from '../../../lib/endpoints';
import { formatDate, formatMonth } from '../../../lib/format';
import { TechHeader } from '../components/TechHeader';
import { EarningsCard, monthOptions } from '../components/EarningsCard';
import { WalletSection } from '../components/WalletSection';

export function EarningsPage() {
  const [month, setMonth] = useState(monthOptions()[0]!.value);
  const earnings = useQuery({ queryKey: ['tech', 'earnings', month], queryFn: () => technicianApi.earnings(month) });
  const e = earnings.data;

  return (
    <>
      <TechHeader />
      <main className="flex flex-col gap-5 px-4 lg:mx-auto lg:max-w-5xl lg:px-8 lg:py-10">
        <h1 className="text-[28px] font-bold text-slate-900">Earnings</h1>
        {earnings.isPending && <Skeleton className="h-40" />}
        {earnings.isError && !earnings.data && <ErrorState error={earnings.error} onRetry={() => void earnings.refetch()} />}
        {e && (
          <>
            <EarningsCard e={e} month={month} onMonth={setMonth} />
            <section className="grid grid-cols-3 gap-2.5">
              {[
                { label: 'Today', value: e.today },
                { label: 'Last 7 days', value: e.week },
                { label: 'All time', value: e.total },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{formatINR(s.value)}</p>
                </div>
              ))}
            </section>

            <WalletSection />

            <section>
              <h2 className="text-lg font-bold text-slate-900">Earnings ledger · {formatMonth(`${month}-15T12:00:00+05:30`)}</h2>
              {e.ledger.length === 0 ? (
                <EmptyState className="py-8" art={<IndianRupee className="size-9 text-slate-300" />} title="No paid jobs this month" />
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-100 shadow-card">
                  {e.ledger.map((r) => (
                    <li key={r.bookingId} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{r.service}</p>
                        <p className="text-xs text-slate-500">
                          {r.code} · {formatDate(r.date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-success">+{formatINR(r.net)}</p>
                        <p className="text-[11px] text-slate-500">
                          {formatINR(r.gross)} − {formatINR(r.commission)} fee
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <p className="flex items-center gap-1.5 pb-4 text-xs text-slate-500">
              <Star className="size-3.5 fill-amber-400 text-amber-400" /> Rating {e.ratingAvg.toFixed(1)} · <ArrowUp className="size-3" /> Higher ratings get more requests.
            </p>
          </>
        )}
      </main>
    </>
  );
}
