import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CircleCheck, MapPinned, Rocket } from 'lucide-react';
import { indianPhoneSchema } from '@fixora/shared-utils';
import { Alert, Button } from '@fixora/ui';
import { serviceAreaApi, type ServiceAreaCheckDto } from '../lib/endpoints';
import { useAuth } from '../store/auth';
import { Dialog } from './Dialog';

/**
 * Shown when someone picks a location (or books) outside the area we serve:
 * "We're not here yet — but very soon", with an "I'm interested" button that
 * tells the team where to expand next.
 */
export function NotServedSheet({
  open,
  onClose,
  place,
  point,
  check,
}: {
  open: boolean;
  onClose(): void;
  /** Area / town name the customer picked, e.g. "Bhimavaram". */
  place?: string | null;
  point?: { lat: number; lng: number } | null;
  check?: ServiceAreaCheckDto | null;
}) {
  const authed = useAuth((s) => s.status === 'authenticated');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const served = check?.areas?.length ? check.areas.map((a) => `${a.name} (within ${a.radiusKm} km)`).join(', ') : 'Tanuku (within 10 km)';

  const interest = useMutation({
    mutationFn: () =>
      serviceAreaApi.interest({
        ...(name.trim() && { name: name.trim() }),
        ...(phone.trim() && { phone: phone.trim() }),
        label: place ?? undefined,
        ...(point && { lat: point.lat, lng: point.lng }),
      }),
  });

  const submit = () => {
    if (!authed) {
      const parsed = indianPhoneSchema.safeParse(phone);
      if (!parsed.success) return setPhoneError('Enter your 10-digit mobile number so we can tell you');
    }
    setPhoneError(null);
    interest.mutate();
  };

  return (
    <Dialog open={open} onClose={onClose} title={interest.isSuccess ? 'Thank you!' : "We're not here yet"}>
      {interest.isSuccess ? (
        <div className="flex flex-col items-center text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
            <CircleCheck className="size-8" aria-hidden />
          </span>
          <p className="mt-4 text-[15px] text-slate-600">
            We've noted your interest{place ? ` in ${place}` : ''}. You'll be among the first to know when RapidFix arrives in your area.
          </p>
          <Button size="lg" fullWidth className="mt-5" onClick={onClose}>
            Okay
          </Button>
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="flex flex-col items-center text-center">
            <span className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-fixora-blue-soft to-sky-100 text-fixora-blue">
              <MapPinned className="size-9" aria-hidden />
              <span className="absolute -top-1 -right-1 flex size-8 items-center justify-center rounded-full bg-fixora-blue text-white shadow-raised">
                <Rocket className="size-4" aria-hidden />
              </span>
            </span>
            <p className="mt-4 text-lg font-bold text-slate-900">Not yet in {place || 'your area'} — but very soon!</p>
            <p className="mt-1.5 text-[15px] text-slate-600">
              We're expanding our wings. Right now RapidFix serves <b>{served}</b>. Tap below and we'll bring RapidFix to you next.
            </p>
            {check?.distanceKm != null && check.town && (
              <p className="mt-2 text-xs text-slate-500">
                You're about {check.distanceKm} km from {check.town}.
              </p>
            )}
          </div>

          {!authed && (
            <div className="mt-5 grid gap-3">
              <input className="field" placeholder="Your name (optional)" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              <div>
                <input
                  className="field"
                  type="tel"
                  inputMode="numeric"
                  placeholder="Mobile number"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-invalid={phoneError ? true : undefined}
                />
                {phoneError && <p className="mt-1 text-xs text-danger">{phoneError}</p>}
              </div>
            </div>
          )}
          {interest.isError && <Alert className="mt-3">{interest.error.message}</Alert>}
          <Button size="lg" fullWidth className="mt-5" loading={interest.isPending} onClick={submit}>
            I'm interested
          </Button>
          <button onClick={onClose} className="mt-3 text-sm font-medium text-slate-500 hover:text-slate-700">
            Choose another location
          </button>
        </div>
      )}
    </Dialog>
  );
}
