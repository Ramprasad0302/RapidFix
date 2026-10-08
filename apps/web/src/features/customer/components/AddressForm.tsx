import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { addressSchema, type AddressInput } from '@fixora/shared-utils';
import { cx } from '@fixora/ui';
import { usePincodeFill } from '../../../lib/usePincodeFill';

type FormIn = z.input<typeof addressSchema>;

export const STATES = [
  'Andhra Pradesh', 'Telangana', 'Karnataka', 'Tamil Nadu', 'Kerala', 'Odisha', 'Maharashtra', 'Chhattisgarh',
  'Madhya Pradesh', 'Uttar Pradesh', 'Bihar', 'Jharkhand', 'West Bengal', 'Gujarat', 'Rajasthan', 'Punjab',
  'Haryana', 'Himachal Pradesh', 'Uttarakhand', 'Goa', 'Assam', 'Arunachal Pradesh', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Sikkim', 'Tripura', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh',
  'Andaman and Nicobar Islands', 'Dadra and Nagar Haveli and Daman and Diu', 'Lakshadweep',
];
const LABELS = [
  { value: 'HOME', label: 'Home' },
  { value: 'WORK', label: 'Work' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const EMPTY_ADDRESS: FormIn = {
  label: 'HOME',
  houseNo: '',
  street: '',
  area: '',
  villageTown: '',
  district: '',
  state: 'Andhra Pradesh',
  pincode: '',
  landmark: '',
  latitude: null,
  longitude: null,
  isDefault: false,
};

function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-800">
        {label} {required && <span className="text-danger">*</span>}
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
 * House, street/area, village/town, district, state, pincode, landmark and a
 * Home/Work/Other label. Validated with the same schema the API uses.
 */
export function AddressForm({
  id,
  defaultValues,
  coords,
  onSubmit,
  footer,
}: {
  id: string;
  defaultValues?: Partial<FormIn>;
  /** GPS position captured by "Current Location". */
  coords?: { latitude: number; longitude: number } | null;
  onSubmit(value: AddressInput): void;
  footer?: React.ReactNode;
}) {
  const form = useForm<FormIn, unknown, AddressInput>({
    resolver: zodResolver(addressSchema),
    defaultValues: { ...EMPTY_ADDRESS, ...defaultValues },
  });
  const e = form.formState.errors;
  const label = useWatch({ control: form.control, name: 'label' });
  const pincode = useWatch({ control: form.control, name: 'pincode' });
  // District and state come from the pincode — no need to type them.
  const pin = usePincodeFill(pincode, (info, changed) => {
    const opts = { shouldValidate: form.formState.isSubmitted };
    if (info.district && (changed || !form.getValues('district'))) form.setValue('district', info.district, opts);
    if (STATES.includes(info.state) && (changed || !form.getValues('state'))) form.setValue('state', info.state, opts);
    if (info.block && !form.getValues('villageTown')) form.setValue('villageTown', info.block, opts);
  });

  return (
    <form
      id={id}
      noValidate
      onSubmit={form.handleSubmit((v) => onSubmit(coords ? { ...v, latitude: coords.latitude, longitude: coords.longitude } : v))}
      className="flex flex-col gap-4"
    >
      <Field label="Door / House / Flat No." required error={e.houseNo?.message} hint="Exactly as on your door or gate, so the technician reaches the right home.">
        <input className={input(e.houseNo)} placeholder="e.g. 4-12/A, Flat 203, 2nd floor" autoComplete="address-line1" {...form.register('houseNo')} />
      </Field>
      <Field label="Street / Road / Area" required error={e.area?.message}>
        <input className={input(e.area)} placeholder="e.g. Main Street, Sajjapuram" autoComplete="address-line2" {...form.register('area')} />
      </Field>
      <Field label="Village / Town" required error={e.villageTown?.message}>
        <input className={input(e.villageTown)} placeholder="e.g. Tanuku" autoComplete="address-level2" {...form.register('villageTown')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pincode" required error={e.pincode?.message ?? (pin.notFound ? 'Pincode not found — please check it' : undefined)}>
          <input className={input(e.pincode)} placeholder="e.g. 534211" inputMode="numeric" maxLength={6} autoComplete="postal-code" {...form.register('pincode')} />
        </Field>
        <Field label="District" required error={e.district?.message} hint={pin.looking ? 'Finding district…' : 'Filled from your pincode'}>
          <input className={input(e.district)} placeholder="Auto-filled" {...form.register('district')} />
        </Field>
      </div>
      <Field label="State" required error={e.state?.message}>
        <select className={input(e.state)} autoComplete="address-level1" {...form.register('state')}>
          {STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field label="Landmark (Optional)" error={e.landmark?.message}>
        <input className={input(e.landmark)} placeholder="e.g. Near Bus Stand" {...form.register('landmark')} />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-800">Save as</legend>
        <div className="flex gap-2">
          {LABELS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => form.setValue('label', l.value)}
              aria-pressed={label === l.value}
              className={cx(
                'h-10 flex-1 rounded-xl border text-sm font-medium',
                label === l.value ? 'border-fixora-blue bg-fixora-blue-soft text-fixora-blue' : 'border-slate-300 text-slate-700',
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </fieldset>
      {footer}
    </form>
  );
}
