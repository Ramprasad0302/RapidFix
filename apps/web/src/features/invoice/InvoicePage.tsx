import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import type { InvoiceDto } from '@fixora/shared-types';
import { formatINR, formatIndianPhone } from '@fixora/shared-utils';
import { Logo, cx } from '@fixora/ui';
import { PageHeader } from '../../components/PageHeader';
import { CenteredSpinner, ErrorState } from '../../components/States';
import { bookingApi } from '../../lib/endpoints';
import { isNativeApp, nativePrint } from '../../lib/nativeApp';
import { formatDate, formatTime } from '../../lib/format';

const METHOD: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', RAZORPAY: 'Online (Razorpay)' };

/** Tax invoice / bill — print-friendly (Save as PDF from the print dialog). */
export function InvoicePage({ backTo }: { backTo: (id: string) => string }) {
  const { id = '' } = useParams();
  const inv = useQuery({ queryKey: ['invoice', id], queryFn: () => bookingApi.invoice(id) });

  return (
    <div className="min-h-dvh bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-[720px] print:hidden">
        <PageHeader
          title="Invoice"
          backTo={backTo(id)}
          className="bg-slate-100/95"
          right={
            inv.data && (
              <button onClick={() => (isNativeApp() ? nativePrint(`RapidFix invoice ${inv.data.invoiceNumber}`) : window.print())} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[15px] font-medium text-fixora-blue">
                <Printer className="size-5" /> Print
              </button>
            )
          }
        />
      </div>
      {inv.isPending && <CenteredSpinner />}
      {inv.isError && !inv.data && <ErrorState error={inv.error} onRetry={() => void inv.refetch()} />}
      {inv.data && <Invoice inv={inv.data} />}
    </div>
  );
}

function Invoice({ inv }: { inv: InvoiceDto }) {
  const statusTone = inv.status === 'PAID' ? 'bg-success-soft text-success' : inv.status === 'REFUNDED' ? 'bg-fixora-blue-soft text-fixora-blue' : 'bg-warning-soft text-warning';
  return (
    <article className="mx-auto mb-10 max-w-[720px] bg-white px-5 py-6 shadow-card sm:rounded-2xl sm:px-8 print:mb-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <Logo size="sm" withTagline />
          <p className="mt-2 text-xs text-slate-500">
            {inv.seller.supportPhone} · {inv.seller.supportEmail}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-slate-900">{inv.status === 'DUE' ? 'Bill' : 'Tax Invoice'}</p>
          <p className="text-sm text-slate-600">{inv.invoiceNumber}</p>
          <p className="text-sm text-slate-500">{formatDate(inv.issuedAt)}</p>
          <span className={cx('mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', statusTone)}>{inv.status}</span>
        </div>
      </header>

      <section className="grid gap-5 border-b border-slate-200 py-5 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Billed to</p>
          <p className="mt-1 font-semibold text-slate-900">{inv.customer.name}</p>
          {inv.customer.phone && <p className="text-slate-600">{formatIndianPhone(inv.customer.phone)}</p>}
          <p className="text-slate-600">{inv.customer.address}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Service</p>
          <p className="mt-1 font-semibold text-slate-900">{inv.service}</p>
          <p className="text-slate-600">Booking {inv.bookingCode}</p>
          <p className="text-slate-600">{formatDate(inv.serviceDate)}</p>
          {inv.technician && <p className="text-slate-600">Technician: {inv.technician.name}</p>}
        </div>
      </section>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-400 uppercase">
            <th className="py-2 font-semibold">Item</th>
            <th className="py-2 text-right font-semibold">Qty</th>
            <th className="py-2 text-right font-semibold">Rate</th>
            <th className="py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((i, n) => (
            <tr key={n} className="border-b border-slate-100">
              <td className="py-2.5 text-slate-900">{i.name}</td>
              <td className="py-2.5 text-right text-slate-600">{i.quantity}</td>
              <td className="py-2.5 text-right text-slate-600">{formatINR(i.unitPrice)}</td>
              <td className="py-2.5 text-right font-medium text-slate-900">{formatINR(i.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto mt-4 flex max-w-xs flex-col gap-1.5 text-sm">
        <Line label="Subtotal" value={formatINR(inv.subtotal)} />
        {inv.spareParts > 0 && <Line label="  incl. spare parts" value={formatINR(inv.spareParts)} />}
        {inv.discount > 0 && <Line label={`Discount${inv.couponCode ? ` (${inv.couponCode})` : ''}`} value={`− ${formatINR(inv.discount)}`} />}
        {inv.tax > 0 && <Line label={`GST (${inv.taxPercent}%)`} value={formatINR(inv.tax)} />}
        <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
          <dt>Total</dt>
          <dd>{formatINR(inv.total)}</dd>
        </div>
      </dl>

      <section className="mt-6 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {inv.paidAt ? (
          <>
            Paid via <b className="text-slate-900">{METHOD[inv.paymentMethod] ?? inv.paymentMethod}</b> on {formatDate(inv.paidAt)}, {formatTime(inv.paidAt)}.
          </>
        ) : (
          <>Payment pending — pay online from the booking page or to your technician in cash / UPI.</>
        )}
      </section>

      <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
        {inv.seller.name} — {inv.seller.tagline} This is a computer-generated invoice. Developed by {inv.seller.developer}.
      </footer>
    </article>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <dt>{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}

export const CustomerInvoicePage = () => <InvoicePage backTo={(id) => `/bookings/${id}`} />;
export const TechnicianInvoicePage = () => <InvoicePage backTo={(id) => `/technician/jobs/${id}`} />;
export const AdminInvoicePage = () => <InvoicePage backTo={(id) => `/admin/bookings?id=${id}`} />;
