import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, CheckCircle2, Copy, FileText, Wrench } from 'lucide-react';
import { formatINR } from '@fixora/shared-utils';
import { Button } from '@fixora/ui';
import { Dialog } from '../../../components/Dialog';
import { PageHeader } from '../../../components/PageHeader';
import { ServiceArt } from '../../../components/ServiceArt';
import { CenteredSpinner, ErrorState } from '../../../components/States';
import { catalogApi } from '../../../lib/endpoints';
import { formatDate } from '../../../lib/format';
import { copyText } from '../../../store/toast';
import { MobileShell } from '../CustomerTabsLayout';
import { useBookWithOffer } from '../components/OfferCard';

export function OfferDetailsPage() {
  const { code = '' } = useParams();
  const offer = useQuery({ queryKey: ['offer', code], queryFn: () => catalogApi.offer(code) });
  const book = useBookWithOffer();
  const [termsOpen, setTermsOpen] = useState(false);
  const o = offer.data;
  const appliesTo = o?.service?.name ?? (o?.category ? `${o.category.name} services` : 'All services');
  const discountLine = o ? (o.discountType === 'PERCENTAGE' ? `Flat ${o.discountValue}% OFF` : `Flat ${formatINR(o.discountValue)} OFF`) : '';

  return (
    <MobileShell>
      <PageHeader title="Offer Details" backTo="/offers" />
      {offer.isPending && <CenteredSpinner />}
      {offer.isError && !offer.data && <ErrorState error={offer.error} onRetry={() => void offer.refetch()} />}
      {o && (
        <main className="flex flex-col gap-5 px-4 pb-8">
          <section className="relative overflow-hidden rounded-[22px]">
            <ServiceArt iconKey={o.category?.iconKey ?? 'more'} alt="" className="h-56 w-full" artClassName="absolute right-6 top-6 w-2/5" />
            <div className="absolute inset-0 bg-gradient-to-t from-fixora-navy via-fixora-navy/50 to-transparent" />
            <span className="absolute top-4 right-4 rotate-6 rounded-xl bg-danger px-3 py-2 text-center text-lg leading-none font-black text-white shadow-raised">
              {o.badge.replace('FLAT ', 'FLAT\n').split('\n').map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))}
            </span>
            <div className="absolute bottom-4 left-5 right-5 text-white">
              <h2 className="text-[26px] font-bold">{o.title}</h2>
              <p className="text-sm text-white/85">{o.description}</p>
            </div>
          </section>

          <section className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[24px] leading-tight font-bold text-slate-900">{discountLine}</p>
              <p className="text-lg text-slate-800">on {appliesTo}</p>
              {o.maxDiscountAmount != null && <p className="mt-1 text-sm text-slate-500">Up to {formatINR(o.maxDiscountAmount)} off{o.minOrderAmount ? ` · min order ${formatINR(o.minOrderAmount)}` : ''}</p>}
            </div>
            <button onClick={() => void copyText(o.code, 'Code copied')} className="shrink-0 rounded-xl border border-dashed border-fixora-blue/50 bg-fixora-blue-soft px-4 py-2.5 text-center" aria-label={`Copy code ${o.code}`}>
              <span className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                Use Code <Copy className="size-3.5" aria-hidden />
              </span>
              <span className="text-xl font-bold text-fixora-blue">{o.code}</span>
            </button>
          </section>

          <section className="grid grid-cols-3 gap-2.5">
            <InfoTile icon={<CalendarDays className="size-6" />} label="Valid till" value={formatDate(o.endsAt)} />
            <InfoTile icon={<Wrench className="size-6" />} label="Applicable on" value={appliesTo} />
            <button onClick={() => setTermsOpen(true)} className="text-left">
              <InfoTile icon={<FileText className="size-6" />} label="T&C" value="Apply" />
            </button>
          </section>

          {o.highlights.length > 0 && (
            <section>
              <h3 className="text-lg font-bold text-slate-900">Offer Highlights</h3>
              <ul className="mt-3 flex flex-col gap-3 rounded-2xl bg-fixora-blue-soft p-4">
                {o.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2.5 text-[15px] text-slate-800">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 fill-fixora-blue text-white" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="text-lg font-bold text-slate-900">How to Use</h3>
            <ol className="mt-3 flex flex-col gap-3">
              {[`Choose ${appliesTo}`, <>Enter the coupon code <b className="text-fixora-blue">{o.code}</b> while booking</>, `Get ${discountLine.replace('Flat ', '').toLowerCase()} on your service charge`, 'Confirm your booking and enjoy the service'].map((step, i) => (
                <li key={i} className="flex items-center gap-3 text-[15px] text-slate-800">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-fixora-blue text-sm font-bold text-fixora-blue">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <Button size="lg" fullWidth onClick={() => book(o)} className="mt-2 h-14 text-[16px]">
            Book {o.service?.name ?? o.category?.name ?? 'a Service'} Now <ArrowRight className="size-5" aria-hidden />
          </Button>

          <Dialog open={termsOpen} onClose={() => setTermsOpen(false)} title="Terms & Conditions">
            <ul className="list-disc space-y-2 pl-5 text-[15px] text-slate-700">
              {o.isFirstBookingOnly && <li>Valid only on your first RapidFix booking.</li>}
              {o.minOrderAmount > 0 && <li>Minimum order value {formatINR(o.minOrderAmount)}.</li>}
              {o.maxDiscountAmount != null && <li>Maximum discount {formatINR(o.maxDiscountAmount)}.</li>}
              {o.terms.map((t) => (
                <li key={t}>{t}</li>
              ))}
              <li>Valid till {formatDate(o.endsAt)}.</li>
            </ul>
          </Dialog>
        </main>
      )}
    </MobileShell>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex h-full flex-col gap-1.5 rounded-2xl bg-slate-50 p-3">
      <span className="text-fixora-blue">{icon}</span>
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-[13px] leading-tight font-semibold text-slate-900">{value}</span>
    </div>
  );
}
