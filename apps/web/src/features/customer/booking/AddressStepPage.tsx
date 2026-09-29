import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Crosshair, Map, SquarePen } from 'lucide-react';
import { haversineKm } from '@fixora/shared-utils';
import { Alert, Button, cx, Spinner } from '@fixora/ui';
import { customerApi } from '../../../lib/endpoints';
import { addressLines } from '../../../lib/format';
import { GOOGLE_MAPS_KEY } from '../../../lib/config';
import { useAuth } from '../../../store/auth';
import { useBookingDraft } from '../../../store/bookingDraft';
import { requestCurrentPosition } from '../../../store/location';
import { toast } from '../../../store/toast';
import { AddressForm } from '../components/AddressForm';
import { MapPicker } from '../../../components/MapPicker';
import { useLocations } from '../queries';
import { BookingShell, StepTitle } from './BookingShell';

type Mode = 'gps' | 'map' | 'manual';

/** Step 3 — a saved address, current location, or manual entry. */
export function AddressStepPage() {
  const navigate = useNavigate();
  const authed = useAuth((s) => s.status === 'authenticated');
  const { address, addressId, update } = useBookingDraft();
  const saved = useQuery({ queryKey: ['customer', 'addresses'], queryFn: customerApi.addresses, enabled: authed });
  const locations = useLocations();
  const [mode, setMode] = useState<Mode>('manual');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(
    address?.latitude != null && address.longitude != null ? { latitude: address.latitude, longitude: address.longitude } : null,
  );
  const [prefill, setPrefill] = useState(address ?? undefined);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const usingSaved = !!addressId && saved.data?.some((a) => a.id === addressId);

  async function captureGps() {
    setMode('gps');
    setGpsError(null);
    setLocating(true);
    try {
      const pos = await requestCurrentPosition();
      setCoords(pos);
      // Snap to the nearest service town to pre-fill village / district / state.
      const nearest = (locations.data ?? [])
        .map((l) => ({ l, d: haversineKm(pos.latitude, pos.longitude, l.latitude, l.longitude) }))
        .sort((a, b) => a.d - b.d)[0];
      if (nearest && nearest.d < 25) {
        setPrefill((p) => ({ ...(p ?? {}), villageTown: nearest.l.name, district: nearest.l.district, state: nearest.l.state }) as typeof p);
      }
      toast('Location captured — please add your house details');
    } catch (e) {
      setGpsError((e as Error).message);
      setMode('manual');
    } finally {
      setLocating(false);
    }
  }

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

      {!!saved.data?.length && (
        <section className="mb-5">
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
          {!usingSaved && <p className="mt-3 text-center text-xs font-medium tracking-wide text-slate-400 uppercase">or add a new address</p>}
        </section>
      )}

      {!usingSaved && (
        <>
          <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Address method">
            <ModeTile active={mode === 'gps'} onClick={() => void captureGps()} icon={locating ? <Spinner className="size-6" /> : <Crosshair className="size-6" />} label="Current Location" />
            <ModeTile
              active={mode === 'map'}
              disabled={!GOOGLE_MAPS_KEY}
              onClick={() => setMode('map')}
              icon={<Map className="size-6" />}
              label="Choose on Map"
            />
            <ModeTile active={mode === 'manual'} onClick={() => setMode('manual')} icon={<SquarePen className="size-6" />} label="Enter Manually" />
          </div>
          {!GOOGLE_MAPS_KEY && <p className="mt-2 text-xs text-slate-400">Map picking turns on once a Google Maps key is configured.</p>}
          {gpsError && <Alert className="mt-3">{gpsError}</Alert>}
          {mode === 'map' && (
            <MapPicker
              className="mt-4"
              initial={coords ?? (locations.data?.[0] ? { latitude: locations.data[0].latitude, longitude: locations.data[0].longitude } : null)}
              onPick={(p) => {
                setCoords(p);
                toast('Location pinned — please add your house details');
              }}
            />
          )}
          {coords && (mode === 'gps' || mode === 'map') && (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-success-soft px-3.5 py-2.5 text-sm text-success">
              <Check className="size-4" /> Location pinned. Add your house number and street below.
            </p>
          )}

          <div className="mt-5">
            <AddressForm
              key={JSON.stringify(prefill ?? {})}
              id="booking-address"
              defaultValues={prefill}
              coords={coords}
              onSubmit={(value) => {
                update({ address: value, addressId: null, saveAddress: true });
                navigate('/book/schedule');
              }}
            />
          </div>
        </>
      )}
    </BookingShell>
  );
}

function ModeTile({ active, onClick, icon, label, disabled }: { active: boolean; onClick(): void; icon: React.ReactNode; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        active ? 'border-fixora-blue bg-fixora-blue-soft text-fixora-blue' : 'border-slate-200 bg-[#F5F8FC] text-slate-700',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
