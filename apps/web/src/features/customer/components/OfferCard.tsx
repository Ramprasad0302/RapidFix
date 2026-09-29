import { Link, useNavigate } from 'react-router';
import { ArrowRight, CalendarDays, Copy, FileClock } from 'lucide-react';
import type { OfferDto } from '@fixora/shared-types';
import { ServiceArt } from '../../../components/ServiceArt';
import { formatDate } from '../../../lib/format';
import { useBookingDraft } from '../../../store/bookingDraft';
import { copyText } from '../../../store/toast';

/** Starts booking with the offer's service (or category) and the code pre-applied. */
export function useBookWithOffer() {
  const navigate = useNavigate();
  const update = useBookingDraft((s) => s.update);
  return (o: OfferDto) => {
    update({ couponCode: o.code });
    if (o.service) navigate(`/book/s/${o.service.slug}?coupon=${o.code}`);
    else if (o.category) navigate(`/book/c/${o.category.slug}?coupon=${o.code}`);
    else navigate(`/book?coupon=${o.code}`);
  };
}

export function OfferCard({ offer: o }: { offer: OfferDto }) {
  const book = useBookWithOffer();
  return (
    <article className="flex gap-2.5 rounded-2xl border border-slate-100 bg-white p-3 shadow-card">
      <Link to={`/offers/${o.code}`} className="shrink-0" aria-label={`${o.title} details`}>
        <ServiceArt iconKey={o.category?.iconKey ?? 'more'} alt="" className="h-full min-h-24 w-[88px] rounded-xl" artClassName="w-3/5" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex gap-2">
          <Link to={`/offers/${o.code}`} className="min-w-0 flex-1">
            <span className="inline-block rounded-md bg-danger-soft px-2 py-0.5 text-[12px] font-bold text-danger">{o.badge}</span>
            <h3 className="mt-1.5 text-[15.5px] leading-snug font-bold text-slate-900">{o.title}</h3>
            <p className="mt-1 line-clamp-2 text-[13px] text-slate-600">{o.description}</p>
          </Link>
          <div className="flex w-[100px] shrink-0 flex-col gap-2">
            <button
              onClick={() => void copyText(o.code, 'Code copied')}
              className="rounded-xl border border-dashed border-fixora-blue/50 bg-fixora-blue-soft px-2 py-1.5 text-center"
              aria-label={`Copy code ${o.code}`}
            >
              <span className="flex items-center justify-center gap-1 text-[11px] text-slate-500">
                Use Code <Copy className="size-3" aria-hidden />
              </span>
              <span className="block truncate text-[13px] font-bold text-fixora-navy">{o.code}</span>
            </button>
            <button onClick={() => book(o)} className="flex h-10 items-center justify-center gap-1 rounded-xl bg-fixora-blue text-[13.5px] font-semibold text-white hover:bg-fixora-blue-dark">
              Book Now <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5" aria-hidden /> Valid till {formatDate(o.endsAt)}
          </span>
          <Link to={`/offers/${o.code}`} className="flex items-center gap-1 hover:text-fixora-blue">
            <FileClock className="size-3.5" aria-hidden /> T&amp;C Apply
          </Link>
        </p>
      </div>
    </article>
  );
}
