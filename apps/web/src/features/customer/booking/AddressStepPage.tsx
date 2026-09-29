import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Crosshair, Map, SquarePen } from 'lucide-react';
import { Button, cx } from '@fixora/ui';
import { customerApi } from '../../../lib/endpoints';
import { addressLines } from '../../../lib/format';
import { useAuth } from '../../../store/auth';
import { useBookingDraft } from '../../../store/bookingDraft';
import { confirmLocationPath, useLocationStore } from '../../../store/location';
import { AddressForm } from '../components/AddressForm';
import { BookingShell, StepTitle } from './BookingShell';

/**
 * Step 3 — Service Address. "Current Location" and "Choose on Map" open the
 * pin screen, which auto-fills street / area / town / district / state /
 * pincode and brings the customer back here.
 */
export function AddressStepPage() {
  const navigate = useNavigate();
  const authed = useAuth((s) => s.status === 'authenticated');
  const { address, addressId, update } = useBookingDraft();
  const selected = useLocationStore((s) => s.selected);
  const saved = useQuery({ queryKey: ['customer', 'addresses'], queryFn: customerApi.addresses, enabled: authed });
  const usingSaved = !!addressId && saved.data?.some((a) => a.id === addressId);
  // Prefill: what's already in the draft, else the address confirmed on the Home location screen.
  const prefill = address ?? (selected?.address && !selected.addressId ? selected.address : undefined);
  const coords =
    prefill?.latitude != null && prefill.longitude != null ? { latitude: prefill.latitude, longitude: prefill.longitude } : null;

  return (
    <BookingShell
      step={3}
      backTo="/book/details"
      action={
        usingSaved ? (
          <Button size="lg" fullWidth onClick={() => navigate('/book/schedule')}>
            Continue <ArrowRight className="size-4.5" aria-hidden />
          </Button>
        ) : (
          <Button type="submit" form="booking-address" size="lg" fullWidth>
            Continue <ArrowRight className="size-4.5" aria-hidden />
          </Button>
        )
      }
    >
      <StepTitle title="Service Address" subtitle="Where should we provide the service?" />

      <div className="grid grid-cols-3 gap-2.5">
        <ModeTile onClick={() => navigate(confirmLocationPath({ from: '/book/address', gps: true }))} icon={<Crosshair className="size-6" />} label="Current Location" />
        <ModeTile
          onClick={() =>
            navigate(confirmLocationPath({ from: '/book/address', ...(selected?.latitude ? { lat: selected.latitude, lng: selected.longitude } : {}) }))
          }
          icon={<Map className="size-6" />}
          label="Choose on Map"
        />
        <ModeTile active={!usingSaved} onClick={() => update({ addressId: null })} icon={<SquarePen className="size-6" />} label="Enter Manually" />
      </div>

      {!!saved.data?.length && (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Saved addresses</h2>
          <ul className="flex flex-col gap-2">
            {saved.data.map((a) => {
              const active = addressId === a.id;
              return (
                <li key={a.id}>
                  <button
                    onClick={() => update({ addressId: active ? null : a.id, address: null })}
                    aria-pressed={active}
                    className={cx('flex w-full items-start gap-3 rounded-xl border p-3 text-left', active ? 'border-fixora-blue bg-fixora-blue-soft' : 'border-slate-200')}
                  >
                    <span className={cx('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2', active ? 'border-fixora-blue bg-fixora-blue text-white' : 'border-slate-300')}>
                      {active && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="text-sm">
                      <span className="block font-semibold text-slate-900">{a.label[0] + a.label.slice(1).toLowerCase()}</span>
                      <span className="block text-slate-600">{addressLines(a).slice(0, 2).join(', ')}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!usingSaved && (
        <div className="mt-5">
          {coords && (
            <p className="mb-4 flex items-center gap-2 rounded-xl bg-success-soft px-3.5 py-2.5 text-sm text-success">
              <Check className="size-4" /> Location pinned on the map. Check your house number below.
            </p>
          )}
          <AddressForm
            key={JSON.stringify(prefill ?? {})}
            id="booking-address"
            defaultValues={prefill ?? undefined}
            coords={coords}
            onSubmit={(value) => {
              update({ address: value, addressId: null, saveAddress: true });
              navigate('/book/schedule');
            }}
          />
        </div>
      )}
    </BookingShell>
  );
}

function ModeTile({ active, onClick, icon, label }: { active?: boolean; onClick(): void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1 text-[12px] font-medium transition-colors',
        active ? 'border-fixora-blue bg-fixora-blue-soft text-fixora-blue' : 'border-slate-200 bg-[#F5F8FC] text-slate-700 hover:border-fixora-blue/40',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
