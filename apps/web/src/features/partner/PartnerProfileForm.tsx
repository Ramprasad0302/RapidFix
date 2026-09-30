import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LocateFixed } from 'lucide-react';
import { Alert, Button, cx } from '@fixora/ui';
import { geoApi } from '../../lib/endpoints';
import { requestCurrentPosition } from '../../store/location';
import { STATES } from '../customer/components/AddressForm';

const LANGUAGES = ['Telugu', 'English', 'Hindi', 'Tamil', 'Kannada', 'Odia', 'Urdu'];

export const partnerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.union([z.email('Enter a valid email'), z.literal('')]),
  experienceYears: z.number({ error: 'Enter years of experience' }).int().min(0).max(60),
  bio: z.string().trim().max(500),
  languages: z.array(z.string()).min(1, 'Choose at least one language'),
  serviceRadiusKm: z.number().int().min(1).max(50),
  addressLine: z.string().trim().max(255),
  villageTown: z.string().trim().min(1, 'Enter your village / town').max(120),
  district: z.string().trim().min(1, 'Enter your district').max(120),
  state: z.string().trim().min(1).max(80),
  pincode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit pincode'),
  baseLatitude: z.number().nullable(),
  baseLongitude: z.number().nullable(),
  skills: z.array(z.string()),
});
export type PartnerFormValues = z.infer<typeof partnerSchema>;

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-800">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-xs text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

const input = (err?: unknown) =>
  cx(
    'h-12 w-full rounded-xl border bg-white px-3.5 text-[15px] outline-none placeholder:text-slate-400 focus:border-fixora-blue focus:ring-3 focus:ring-fixora-blue/15',
    err ? 'border-danger' : 'border-slate-300',
  );

/**
 * Partner profile + service area. Used for "Become a partner" (with skills)
 * and for editing an existing technician profile (skills are admin-managed).
 */
export function PartnerProfileForm({
  defaults,
  categories,
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  defaults: PartnerFormValues;
  /** Present = show the skills picker (registration). */
  categories?: { id: string; name: string }[];
  submitLabel: string;
  pending: boolean;
  error?: string | null;
  onSubmit(v: PartnerFormValues): void;
}) {
  const schema = categories ? partnerSchema.extend({ skills: z.array(z.string()).min(1, 'Choose at least one service') }) : partnerSchema;
  const form = useForm<PartnerFormValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { register, handleSubmit, setValue, control, formState } = form;
  const e = formState.errors;
  const [languages, skills, radius, lat] = useWatch({ control, name: ['languages', 'skills', 'serviceRadiusKm', 'baseLatitude'] });
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const toggle = (name: 'languages' | 'skills', list: string[], value: string) =>
    setValue(name, list.includes(value) ? list.filter((x) => x !== value) : [...list, value], { shouldValidate: formState.isSubmitted });

  const detectLocation = async () => {
    setLocating(true);
    setLocError(null);
    try {
      const { latitude, longitude } = await requestCurrentPosition();
      setValue('baseLatitude', latitude);
      setValue('baseLongitude', longitude);
      const a = await geoApi.reverse(latitude, longitude).catch(() => null);
      if (a) {
        if (a.villageTown) setValue('villageTown', a.villageTown, { shouldValidate: true });
        if (a.district) setValue('district', a.district, { shouldValidate: true });
        if (a.state) setValue('state', a.state);
        if (a.pincode) setValue('pincode', a.pincode, { shouldValidate: true });
        const line = [a.street, a.area].filter(Boolean).join(', ');
        if (line) setValue('addressLine', line);
      }
    } catch (err) {
      setLocError((err as Error).message);
    } finally {
      setLocating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Field label="Full name" error={e.name?.message}>
        <input {...register('name')} autoComplete="name" className={input(e.name)} />
      </Field>
      <Field label="Email (optional)" error={e.email?.message}>
        <input {...register('email')} type="email" autoComplete="email" className={input(e.email)} />
      </Field>
      <Field label="Years of experience" error={e.experienceYears?.message}>
        <input {...register('experienceYears', { valueAsNumber: true })} type="number" inputMode="numeric" min={0} max={60} className={input(e.experienceYears)} />
      </Field>

      {categories && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-800">Services you offer</legend>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={skills.includes(c.id)}
                onClick={() => toggle('skills', skills, c.id)}
                className={cx(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition',
                  skills.includes(c.id) ? 'border-fixora-blue bg-fixora-blue-soft text-fixora-blue' : 'border-slate-200 text-slate-700',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
          {e.skills && <p className="mt-1 text-xs text-danger">{e.skills.message}</p>}
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-800">Languages you speak</legend>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={languages.includes(l)}
              onClick={() => toggle('languages', languages, l)}
              className={cx(
                'rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
                languages.includes(l) ? 'border-fixora-blue bg-fixora-blue-soft text-fixora-blue' : 'border-slate-200 text-slate-700',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        {e.languages && <p className="mt-1 text-xs text-danger">{e.languages.message}</p>}
      </fieldset>

      <Field label="About you (optional)" error={e.bio?.message}>
        <textarea {...register('bio')} rows={3} maxLength={500} placeholder="e.g. 8 years servicing split & window ACs. Honest pricing." className="w-full resize-none rounded-xl border border-slate-300 p-3 text-[15px] outline-none focus:border-fixora-blue" />
      </Field>

      <h3 className="mt-2 text-lg font-semibold text-slate-900">Service area</h3>
      <button
        type="button"
        onClick={() => void detectLocation()}
        disabled={locating}
        className="flex items-center gap-3 rounded-xl border border-fixora-blue/30 bg-fixora-blue-soft px-4 py-3 text-left text-[15px] font-semibold text-fixora-blue disabled:opacity-60"
      >
        <LocateFixed className={cx('size-5', locating && 'animate-pulse')} />
        <span className="flex-1">
          {locating ? 'Detecting…' : lat != null ? 'Base location set — update from GPS' : 'Use my current location as base'}
          <span className="block text-xs font-normal text-slate-600">Jobs are matched by distance from this point.</span>
        </span>
      </button>
      {locError && <Alert>{locError}</Alert>}

      <Field label={`Travel radius: ${radius} km`}>
        <input {...register('serviceRadiusKm', { valueAsNumber: true })} type="range" min={1} max={50} className="w-full accent-fixora-blue" />
      </Field>
      <Field label="Street / area (optional)" error={e.addressLine?.message}>
        <input {...register('addressLine')} className={input(e.addressLine)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Village / town" error={e.villageTown?.message}>
          <input {...register('villageTown')} className={input(e.villageTown)} />
        </Field>
        <Field label="District" error={e.district?.message}>
          <input {...register('district')} className={input(e.district)} />
        </Field>
        <Field label="State" error={e.state?.message}>
          <select {...register('state')} className={input(e.state)}>
            {STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Pincode" error={e.pincode?.message}>
          <input {...register('pincode')} inputMode="numeric" maxLength={6} className={input(e.pincode)} />
        </Field>
      </div>

      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" fullWidth loading={pending} className="mt-2">
        {submitLabel}
      </Button>
    </form>
  );
}

export function toPartnerPayload(v: PartnerFormValues) {
  return {
    ...v,
    email: v.email || undefined,
    bio: v.bio || null,
    addressLine: v.addressLine || undefined,
  };
}
