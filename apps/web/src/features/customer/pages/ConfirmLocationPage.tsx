import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, LocateFixed, MapPin, Search } from 'lucide-react';
import type { AddressInput } from '@fixora/shared-utils';
import { Alert, Button, cx, Spinner } from '@fixora/ui';
import { FixoraMap, type LatLng } from '../../../components/map/FixoraMap';
import { Skeleton } from '../../../components/States';
import { customerApi, geoApi, serviceAreaApi, type ServiceAreaCheckDto } from '../../../lib/endpoints';
import { NotServedSheet } from '../../../components/NotServedSheet';
import { useAuth } from '../../../store/auth';
import { useBookingDraft } from '../../../store/bookingDraft';
import { requestCurrentPosition, useLocationStore } from '../../../store/location';
import { toast } from '../../../store/toast';
import { AddressForm } from '../components/AddressForm';
import { LocationPicker } from '../components/LocationPicker';
import { NotificationAskDialog, shouldAskNotifications } from '../../../components/NotificationAskDialog';
import { MobileShell } from '../CustomerTabsLayout';
import { useLocations } from '../queries';

const safeFrom = (v: string | null) => (v && v.startsWith('/') && !v.startsWith('//') ? v : '/');
const round = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * Pin your exact location, then complete the address — street, area, town,
 * district, state and pincode are auto-filled from the pin.
 */
export function ConfirmLocationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const from = safeFrom(params.get('from'));
  const authedCustomer = useAuth((s) => s.status === 'authenticated' && s.user?.role === 'CUSTOMER');
  const { selected, select } = useLocationStore();
  const updateDraft = useBookingDraft((s) => s.update);
  const towns = useLocations();

  const { key: navKey } = useLocation();
  const paramPoint = (): LatLng | null => {
    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));
    return params.get('lat') && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  };
  const [center, setCenter] = useState<LatLng | null>(() => paramPoint() ?? (selected?.latitude ? { lat: selected.latitude, lng: selected.longitude } : null));
  const [pin, setPin] = useState<LatLng | null>(center);
  const [step, setStep] = useState<'pin' | 'details'>('pin');
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [askNotif, setAskNotif] = useState(false);
  // Door number is asked right at the pin (GPS can't know it) and carried into the address form.
  const [doorNo, setDoorNo] = useState('');
  const [doorError, setDoorError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [notServed, setNotServed] = useState<ServiceAreaCheckDto | null>(null);

  async function confirmPin() {
    if (!doorNo.trim()) {
      setDoorError('Enter your door / house / flat number');
      return;
    }
    setDoorError(null);
    const point = pin ?? effectiveCenter;
    if (!point) return;
    setChecking(true);
    try {
      const check = await serviceAreaApi.check(point.lat, point.lng);
      if (!check.served) return setNotServed(check);
      setStep('details');
    } catch {
      setStep('details'); // the booking itself is checked again on the server
    } finally {
      setChecking(false);
    }
  }

  async function locate() {
    setGpsError(null);
    setLocating(true);
    try {
      const p = await requestCurrentPosition();
      const c = { lat: p.latitude, lng: p.longitude };
      setCenter(c);
      setPin(c);
      setAccuracy(p.accuracy);
      // Location granted → now, separately, the notifications question.
      if (shouldAskNotifications()) setAskNotif(true);
    } catch (e) {
      setGpsError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }

  // A new arrival on this screen (e.g. a search result picked here) re-centres the map.
  const [seenKey, setSeenKey] = useState(navKey);
  if (seenKey !== navKey) {
    setSeenKey(navKey);
    setStep('pin');
    const p = paramPoint();
    if (p) {
      setCenter(p);
      setPin(p);
    }
  }

  // GPS is requested only because the user chose "Use current location".
  const wantsGps = !!params.get('gps');
  useEffect(() => {
    if (!wantsGps) return;
    const t = setTimeout(() => void locate(), 0);
    return () => clearTimeout(t);
  }, [navKey, wantsGps]);

  // No pin yet (and not locating): start on the nearest town we serve.
  const fallback = towns.data?.[0];
  const effectiveCenter = center ?? (fallback ? { lat: fallback.latitude, lng: fallback.longitude } : null);

  // Debounced reverse geocode of wherever the pin rests.
  const [lookup, setLookup] = useState<LatLng | null>(null);
  useEffect(() => {
    const target = pin ?? effectiveCenter;
    if (!target) return;
    const t = setTimeout(() => setLookup({ lat: round(target.lat), lng: round(target.lng) }), 500);
    return () => clearTimeout(t);
  }, [pin, effectiveCenter?.lat, effectiveCenter?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const geo = useQuery({
    queryKey: ['geo', 'reverse', lookup?.lat, lookup?.lng],
    queryFn: () => geoApi.reverse(lookup!.lat, lookup!.lng),
    enabled: !!lookup,
    staleTime: Infinity,
    retry: 1,
  });

  const save = useMutation({
    mutationFn: async (value: AddressInput) => {
      const point = pin ?? effectiveCenter!;
      const address: AddressInput = { ...value, latitude: point.lat, longitude: point.lng };
      const saved = authedCustomer ? await customerApi.createAddress(address) : null;
      return { address, saved };
    },
    onSuccess: ({ address, saved }) => {
      const label = [address.area.split(',').at(-1)?.trim() || address.area, address.villageTown].filter(Boolean).join(', ');
      select({
        label,
        latitude: address.latitude!,
        longitude: address.longitude!,
        source: params.get('gps') ? 'gps' : 'map',
        address,
        ...(saved && { addressId: saved.id }),
      });
      if (from.startsWith('/book')) updateDraft(saved ? { addressId: saved.id, address: null } : { address, addressId: null, saveAddress: true });
      if (saved) void qc.invalidateQueries({ queryKey: ['customer', 'addresses'] });
      toast('Location saved');
      navigate(from, { replace: true });
    },
  });

  const g = geo.data;
  const prefill = g
    ? {
        houseNo: doorNo.trim() || g.houseNo,
        street: g.street,
        area: [g.street, g.area].filter(Boolean).join(', ') || g.villageTown,
        villageTown: g.villageTown,
        district: g.district,
        state: g.state || 'Andhra Pradesh',
        pincode: g.pincode,
      }
    : undefined;

  return (
    <MobileShell>
      <div className="relative flex h-dvh flex-col lg:h-[calc(100dvh-9.5rem)]">
        {/* Map with a fixed centre pin */}
        <div className="relative flex-1">
          {effectiveCenter ? (
            <FixoraMap center={effectiveCenter} zoom={17} onMoveEnd={setPin} className="absolute inset-0" label="Map — drag to place the pin on your home" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-fixora-blue">
              <Spinner className="size-7" />
            </div>
          )}

          <div className="pointer-events-none absolute top-1/2 left-1/2 z-[500] flex -translate-x-1/2 -translate-y-full flex-col items-center">
            <span className="mb-1 rounded-lg bg-fixora-navy px-3 py-1.5 text-center text-xs leading-tight font-semibold text-white shadow-raised">
              Place the pin on your door
              <span className="block font-normal text-white/70">Zoom in &amp; move the map to adjust</span>
            </span>
            <MapPin className="size-10 fill-danger text-white drop-shadow-lg" strokeWidth={1.5} aria-hidden />
          </div>

          <div className="absolute inset-x-0 top-0 z-[500] flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(from, { replace: true }))}
              aria-label="Go back"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-raised"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button onClick={() => setSearching(true)} className="flex h-11 flex-1 items-center gap-2 rounded-full bg-white px-4 text-left text-[15px] text-slate-500 shadow-raised">
              <Search className="size-5 text-fixora-blue" aria-hidden /> Search for area, street name...
            </button>
          </div>

          {step === 'pin' && (
            <button
              onClick={() => void locate()}
              disabled={locating}
              className="absolute bottom-4 left-1/2 z-[500] flex -translate-x-1/2 items-center gap-2 rounded-full border border-fixora-blue/30 bg-white px-4 py-2 text-sm font-semibold whitespace-nowrap text-fixora-blue shadow-raised"
            >
              {locating ? <Spinner className="size-4" /> : <LocateFixed className="size-4" />} Use current location
            </button>
          )}
        </div>

        {/* Bottom card */}
        {step === 'pin' ? (
          <section className="z-[600] rounded-t-3xl bg-white px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(11_31_58/0.08)]">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Select service location</p>
            {gpsError && <Alert className="mt-3">{gpsError}</Alert>}
            {accuracy != null && (
              <p className={cx('mt-2 rounded-lg px-3 py-2 text-xs', accuracy <= 25 ? 'bg-success-soft text-success' : 'bg-warning-soft text-slate-700')}>
                GPS accuracy ±{accuracy} m.{' '}
                {accuracy <= 25 ? 'Check the pin is on your building.' : 'Zoom in and drag the map so the pin sits exactly on your gate or door — the technician navigates to this pin.'}
              </p>
            )}
            <div className="mt-3 flex min-h-14 items-start gap-3">
              <MapPin className="mt-0.5 size-6 shrink-0 fill-fixora-blue text-white" aria-hidden />
              {geo.isPending || !lookup ? (
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ) : geo.isError ? (
                <p className="text-sm text-slate-600">{geo.error.message}</p>
              ) : (
                <div className="min-w-0">
                  <p className="text-lg leading-tight font-bold text-slate-900">{g?.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{g?.formatted}</p>
                </div>
              )}
            </div>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-800">
                Door / House / Flat No. <span className="text-danger">*</span>
              </span>
              <input
                className="field"
                value={doorNo}
                onChange={(e) => {
                  setDoorNo(e.target.value);
                  if (doorError) setDoorError(null);
                }}
                placeholder={g?.houseNo ? `e.g. ${g.houseNo}` : 'e.g. 4-12/A, Flat 203'}
                autoComplete="address-line1"
                aria-invalid={doorError ? true : undefined}
              />
              {doorError ? <span role="alert" className="mt-1 block text-xs text-danger">{doorError}</span> : <span className="mt-1 block text-xs text-slate-500">As written on your door or gate — the technician comes to this pin and door.</span>}
            </label>
            <Button size="lg" fullWidth className="mt-4" disabled={!effectiveCenter || locating} loading={checking} onClick={() => void confirmPin()}>
              Confirm &amp; enter complete address
            </Button>
          </section>
        ) : (
          <section className={cx('z-[600] max-h-[72dvh] overflow-y-auto rounded-t-3xl bg-white px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(11_31_58/0.08)]')}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Enter complete address</h1>
                <p className="mt-0.5 text-sm text-slate-500">We’ve filled in what we could from your pin.</p>
              </div>
              <button onClick={() => setStep('pin')} className="shrink-0 text-sm font-semibold text-fixora-blue">
                Change pin
              </button>
            </div>
            <div className="mt-4">
              <AddressForm
                key={`${lookup?.lat},${lookup?.lng},${g ? 1 : 0},${step}`}
                id="confirm-address"
                defaultValues={prefill}
                onSubmit={(v) => save.mutate(v)}
                footer={
                  <>
                    {save.isError && <Alert>{save.error.message}</Alert>}
                    <Button type="submit" size="lg" fullWidth loading={save.isPending}>
                      Save address &amp; continue
                    </Button>
                  </>
                }
              />
            </div>
          </section>
        )}
      </div>

      <LocationPicker open={searching} onClose={() => setSearching(false)} from={from} />
      <NotificationAskDialog open={askNotif} onClose={() => setAskNotif(false)} />
      <NotServedSheet open={!!notServed} onClose={() => setNotServed(null)} check={notServed} place={g?.villageTown || g?.title} point={pin ?? effectiveCenter} />
    </MobileShell>
  );
}
