import { useRef, useState } from 'react';
import { useForm, useWatch, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, ArrowRight, Bike, Check, LocateFixed, Wrench } from 'lucide-react';
import { dateOfBirthSchema, toE164India } from '@fixora/shared-utils';
import { Alert, Button, cx } from '@fixora/ui';
import { geoApi } from '../../lib/endpoints';
import { requestCurrentPosition } from '../../store/location';
import { STATES } from '../customer/components/AddressForm';

const LANGUAGES = ['Telugu', 'English', 'Hindi', 'Tamil', 'Kannada', 'Odia', 'Urdu'];

const optionalPhone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|0)/, ''))
  .refine((v) => v === '' || /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit mobile number');

export const partnerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.union([z.email('Enter a valid email'), z.literal('')]),
  dateOfBirth: z.union([dateOfBirthSchema(18, 70), z.literal('')]),
  alternatePhone: optionalPhone,
  experienceYears: z.number({ error: 'Enter years of experience' }).int().min(0, 'Enter years of experience').max(60),
  bio: z.string().trim().max(500),
  languages: z.array(z.string()).min(1, 'Choose at least one language'),
  hasOwnTools: z.boolean(),
  hasVehicle: z.boolean(),
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
export type PartnerFormValues = z.input<typeof partnerSchema>;

/** New partners must give everything needed for verification. */
const registrationSchema = partnerSchema.extend({
  email: z.email('Enter a valid email'),
  dateOfBirth: dateOfBirthSchema(18, 70),
  addressLine: z.string().trim().min(3, 'Enter your house no. / street').max(255),
  skills: z.array(z.string()).min(1, 'Choose at least one type of work'),
});

type Field = FieldPath<PartnerFormValues>;
const STEPS: { title: string; hint: string; fields: Field[] }[] = [
  { title: 'Personal details', hint: 'Who you are and how we reach you', fields: ['name', 'email', 'dateOfBirth', 'alternatePhone'] },
  { title: 'Your work', hint: 'The services you do and your experience', fields: ['skills', 'experienceYears', 'languages', 'hasOwnTools', 'hasVehicle', 'bio'] },
  { title: 'Address & service area', hint: 'Where you live and how far you travel', fields: ['addressLine', 'villageTown', 'district', 'state', 'pincode', 'serviceRadiusKm'] },
];

function Labeled({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-800">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
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
 * Partner profile + service area.
 *  - Registration (`categories` given): a 3-step wizard — personal details,
 *    work (type of work, experience, tools), address & service area.
 *  - Editing an existing technician: one long form (skills are admin-managed).
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
  /** Present = registration wizard with the type-of-work picker. */
  categories?: { id: string; name: string }[];
  submitLabel: string;
  pending: boolean;
  error?: string | null;
  onSubmit(v: PartnerFormValues): void;
}) {
  const registering = !!categories;
  const form = useForm<PartnerFormValues>({ resolver: zodResolver(registering ? registrationSchema : partnerSchema), defaultValues: defaults, mode: 'onTouched' });
  const { register, handleSubmit, setValue, control, formState, trigger } = form;
  const e = formState.errors;
  const [languages, skills, radius, lat, hasOwnTools, hasVehicle] = useWatch({
    control,
    name: ['languages', 'skills', 'serviceRadiusKm', 'baseLatitude', 'hasOwnTools', 'hasVehicle'],
  });
  const [step, setStep] = useState(0);
  const top = useRef<HTMLFormElement>(null);
  const goTo = (i: number) => {
    setStep(i);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const show = (i: number) => !registering || step === i;
  const last = !registering || step === STEPS.length - 1;

  const toggle = (name: 'languages' | 'skills', list: string[], value: string) =>
    setValue(name, list.includes(value) ? list.filter((x) => x !== value) : [...list, value], { shouldValidate: formState.isSubmitted || step > 0 });

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
        const line = [a.houseNo, a.street, a.area].filter(Boolean).join(', ');
        if (line) setValue('addressLine', line, { shouldValidate: true });
      }
    } catch (err) {
      setLocError((err as Error).message);
    } finally {
      setLocating(false);
    }
  };

  const next = async () => {
    if (await trigger(STEPS[step]!.fields)) goTo(step + 1);
  };

  return (
    <form
      ref={top}
      onSubmit={(ev) => {
        if (!last) {
          ev.preventDefault();
          void next();
          return;
        }
        void handleSubmit(onSubmit)(ev);
      }}
      className="flex scroll-mt-20 flex-col gap-4"
      noValidate
    >
      {registering && <Stepper step={step} />}

      {show(0) && (
        <>
          {registering && <StepHeading i={0} />}
          <Labeled label="Full name (as on Aadhaar)" required error={e.name?.message}>
            <input {...register('name')} autoComplete="name" className={input(e.name)} />
          </Labeled>
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label="Email" required={registering} error={e.email?.message}>
              <input {...register('email')} type="email" autoComplete="email" placeholder="you@example.com" className={input(e.email)} />
            </Labeled>
            <Labeled label="Date of birth" required={registering} error={e.dateOfBirth?.message} hint="You must be 18 or older">
              <input {...register('dateOfBirth')} type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} className={input(e.dateOfBirth)} />
            </Labeled>
          </div>
          <Labeled label="Alternate / emergency contact number" error={e.alternatePhone?.message} hint="Optional — a family member or second number">
            <div className={cx(input(e.alternatePhone), 'flex items-center gap-2 px-0')}>
              <span className="border-r border-slate-200 px-3 text-slate-600">+91</span>
              <input {...register('alternatePhone')} type="tel" inputMode="numeric" maxLength={14} className="h-full min-w-0 flex-1 bg-transparent pr-3 outline-none" />
            </div>
          </Labeled>
        </>
      )}

      {show(1) && (
        <>
          {registering && <StepHeading i={1} />}
          {categories && (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-slate-800">
                Type of work you do <span className="text-danger">*</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={skills.includes(c.id)}
                    onClick={() => toggle('skills', skills, c.id)}
                    className={cx(
                      'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition',
                      skills.includes(c.id) ? 'border-fixora-blue bg-fixora-blue-soft text-fixora-blue' : 'border-slate-200 text-slate-700 hover:border-slate-300',
                    )}
                  >
                    {skills.includes(c.id) && <Check className="size-3.5" strokeWidth={3} />}
                    {c.name}
                  </button>
                ))}
              </div>
              {e.skills && <p className="mt-1 text-xs text-danger">{e.skills.message}</p>}
            </fieldset>
          )}
          <Labeled label="Years of experience in this work" required error={e.experienceYears?.message}>
            <input {...register('experienceYears', { valueAsNumber: true })} type="number" inputMode="numeric" min={0} max={60} className={input(e.experienceYears)} />
          </Labeled>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-800">
              Languages you speak <span className="text-danger">*</span>
            </legend>
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

          <div className="grid gap-3 sm:grid-cols-2">
            <YesNo icon={<Wrench className="size-5" />} label="I have my own tools" value={hasOwnTools} onChange={(v) => setValue('hasOwnTools', v)} />
            <YesNo icon={<Bike className="size-5" />} label="I have a two-wheeler / vehicle" value={hasVehicle} onChange={(v) => setValue('hasVehicle', v)} />
          </div>

          <Labeled label="About your work (optional)" error={e.bio?.message}>
            <textarea
              {...register('bio')}
              rows={3}
              maxLength={500}
              placeholder="e.g. 8 years servicing split & window ACs. Worked at Sri Sai Electricals. Honest pricing."
              className="w-full resize-none rounded-xl border border-slate-300 p-3 text-[15px] outline-none focus:border-fixora-blue"
            />
          </Labeled>
        </>
      )}

      {show(2) && (
        <>
          {registering ? <StepHeading i={2} /> : <h3 className="mt-2 text-lg font-semibold text-slate-900">Address &amp; service area</h3>}
          <button
            type="button"
            onClick={() => void detectLocation()}
            disabled={locating}
            className="flex items-center gap-3 rounded-xl border border-fixora-blue/30 bg-fixora-blue-soft px-4 py-3 text-left text-[15px] font-semibold text-fixora-blue disabled:opacity-60"
          >
            <LocateFixed className={cx('size-5', locating && 'animate-pulse')} />
            <span className="flex-1">
              {locating ? 'Detecting…' : lat != null ? 'Location set — update from GPS' : 'Use my current location'}
              <span className="block text-xs font-normal text-slate-600">Fills your address. Jobs are matched by distance from here.</span>
            </span>
          </button>
          {locError && <Alert>{locError}</Alert>}

          <Labeled label="House no. / street / area" required={registering} error={e.addressLine?.message}>
            <input {...register('addressLine')} autoComplete="street-address" className={input(e.addressLine)} />
          </Labeled>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Village / town" required error={e.villageTown?.message}>
              <input {...register('villageTown')} className={input(e.villageTown)} />
            </Labeled>
            <Labeled label="District" required error={e.district?.message}>
              <input {...register('district')} className={input(e.district)} />
            </Labeled>
            <Labeled label="State" required error={e.state?.message}>
              <select {...register('state')} className={input(e.state)}>
                {STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Pincode" required error={e.pincode?.message}>
              <input {...register('pincode')} inputMode="numeric" maxLength={6} className={input(e.pincode)} />
            </Labeled>
          </div>
          <Labeled label={`How far can you travel for jobs: ${radius} km`}>
            <input {...register('serviceRadiusKm', { valueAsNumber: true })} type="range" min={1} max={50} className="w-full accent-fixora-blue" />
          </Labeled>
        </>
      )}

      {error && <Alert>{error}</Alert>}
      <div className="mt-2 flex gap-3">
        {registering && step > 0 && (
          <Button type="button" variant="outline" size="lg" onClick={() => goTo(step - 1)}>
            <ArrowLeft className="size-4.5" aria-hidden /> Back
          </Button>
        )}
        <Button type="submit" size="lg" fullWidth loading={last && pending}>
          {last ? submitLabel : 'Continue'} {!last && <ArrowRight className="size-4.5" aria-hidden />}
        </Button>
      </div>
      {registering && last && <p className="text-center text-xs text-slate-500">Next: upload your Aadhaar, photo and certificates, then add bank / UPI details for payouts.</p>}
    </form>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = [...STEPS.map((s) => s.title), 'Documents'];
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Sign-up progress">
      {labels.map((l, i) => (
        <li key={l} aria-current={i === step ? 'step' : undefined}>
          <span className={cx('block h-1.5 rounded-full', i < step ? 'bg-success' : i === step ? 'bg-fixora-blue' : 'bg-slate-200')} />
          <span className={cx('mt-1.5 hidden text-xs font-medium sm:block', i === step ? 'text-fixora-blue' : 'text-slate-500')}>{l}</span>
        </li>
      ))}
    </ol>
  );
}

function StepHeading({ i }: { i: number }) {
  const s = STEPS[i]!;
  return (
    <div>
      <p className="text-xs font-semibold tracking-wider text-fixora-blue uppercase">
        Step {i + 1} of {STEPS.length + 1}
      </p>
      <h2 className="text-xl font-bold text-slate-900">{s.title}</h2>
      <p className="text-sm text-slate-500">{s.hint}</p>
    </div>
  );
}

function YesNo({ icon, label, value, onChange }: { icon: React.ReactNode; label: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cx(
        'flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition',
        value ? 'border-fixora-blue bg-fixora-blue-soft text-fixora-blue' : 'border-slate-200 text-slate-700',
      )}
    >
      {icon}
      <span className="flex-1">{label}</span>
      <span className={cx('flex size-5 items-center justify-center rounded-md border-2', value ? 'border-fixora-blue bg-fixora-blue text-white' : 'border-slate-300')}>
        {value && <Check className="size-3" strokeWidth={3} />}
      </span>
    </button>
  );
}

export function toPartnerPayload(v: PartnerFormValues) {
  const alt = (v.alternatePhone ?? '').replace(/[\s-]/g, '').replace(/^(\+91|0)/, '');
  return {
    ...v,
    email: v.email || undefined,
    dateOfBirth: v.dateOfBirth || undefined,
    alternatePhone: alt ? toE164India(alt) : null,
    bio: v.bio || null,
    addressLine: v.addressLine || undefined,
  };
}
