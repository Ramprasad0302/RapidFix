import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BadgeCheck, Camera, Gift, Languages, MapPin } from 'lucide-react';
import { z } from 'zod';
import { formatIndianPhone } from '@fixora/shared-utils';
import { Alert, Button, Spinner } from '@fixora/ui';
import { Avatar } from '../../../components/Avatar';
import { PageHeader } from '../../../components/PageHeader';
import { CenteredSpinner, ErrorState } from '../../../components/States';
import { Toggle } from '../../../components/Toggle';
import { customerApi, uploadApi } from '../../../lib/endpoints';
import { authActions } from '../../../store/auth';
import { toast } from '../../../store/toast';
import { MobileShell } from '../CustomerTabsLayout';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  email: z.union([z.email('Enter a valid email').trim(), z.literal('')]),
  city: z.string().trim().max(120),
  language: z.enum(['en', 'te', 'hi']),
  notificationsEnabled: z.boolean(),
  marketingOptIn: z.boolean(),
});
type Values = z.infer<typeof schema>;

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'te', label: 'తెలుగు (Telugu)' },
  { value: 'hi', label: 'हिन्दी (Hindi)' },
] as const;

export function EditProfilePage() {
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ['customer', 'profile'], queryFn: customerApi.profile });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', city: '', language: 'en', notificationsEnabled: true, marketingOptIn: true },
  });
  const [notificationsEnabled, marketingOptIn] = useWatch({ control: form.control, name: ['notificationsEnabled', 'marketingOptIn'] });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const p = profile.data;
    if (p) {
      form.reset({
        name: p.name ?? '',
        email: p.email ?? '',
        city: p.city ?? '',
        language: (['en', 'te', 'hi'] as const).find((l) => l === p.language) ?? 'en',
        notificationsEnabled: p.notificationsEnabled,
        marketingOptIn: p.marketingOptIn,
      });
    }
  }, [profile.data, form]);

  const save = useMutation({
    mutationFn: (v: Values & { avatarUrl?: string | null }) => customerApi.updateProfile(v),
    onSuccess: (p) => {
      qc.setQueryData(['customer', 'profile'], p);
      authActions.updateUser({ name: p.name, email: p.email, avatarUrl: p.avatarUrl });
    },
  });

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { path } = await uploadApi.upload(file, 'image');
      await save.mutateAsync({ ...form.getValues(), avatarUrl: path });
      toast('Profile photo updated');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  }

  const p = profile.data;
  return (
    <MobileShell>
      <PageHeader title="Edit Profile" backTo="/account" />
      {profile.isPending && <CenteredSpinner />}
      {profile.isError && <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />}
      {p && (
        <form
          noValidate
          onSubmit={form.handleSubmit((v) => save.mutate(v, { onSuccess: () => toast('Profile saved') }))}
          className="flex flex-col gap-5 px-4 pb-10"
        >
          <section className="flex items-center gap-5 rounded-3xl bg-fixora-blue-soft p-5">
            <button type="button" onClick={() => fileRef.current?.click()} className="relative" aria-label="Change profile photo">
              <Avatar name={p.name ?? p.phone} src={p.avatarUrl} size={104} />
              <span className="absolute right-0 bottom-0 flex size-9 items-center justify-center rounded-full border-2 border-white bg-fixora-blue text-white">
                {uploading ? <Spinner className="size-4" /> : <Camera className="size-4" />}
              </span>
            </button>
            <div>
              <p className="font-semibold text-slate-900">Change Profile Photo</p>
              <p className="text-sm text-slate-600">Supported formats: JPG, PNG, WebP (Max 5 MB)</p>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onPhoto(e.target.files?.[0])} />
          </section>

          <Labeled label="Full Name" error={form.formState.errors.name?.message}>
            <input className="field" autoComplete="name" {...form.register('name')} />
          </Labeled>
          <Labeled label="Mobile Number">
            <div className="field flex items-center justify-between bg-slate-50 text-slate-500">
              {formatIndianPhone(p.phone)}
              <span className="flex items-center gap-1 text-sm font-medium text-fixora-blue">
                <BadgeCheck className="size-4.5 fill-fixora-blue text-white" /> Verified
              </span>
            </div>
          </Labeled>
          <Labeled label="Email Address" error={form.formState.errors.email?.message}>
            <input className="field" type="email" autoComplete="email" placeholder="you@example.com" {...form.register('email')} />
          </Labeled>
          <Labeled label="Location">
            <div className="relative">
              <input className="field pr-11" placeholder="e.g. Tanuku, Andhra Pradesh" {...form.register('city')} />
              <MapPin className="absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-fixora-blue" aria-hidden />
            </div>
          </Labeled>

          <section>
            <h2 className="text-lg font-bold text-slate-900">Preferences</h2>
            <div className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-100 shadow-card">
              <label className="flex items-center gap-3 px-4 py-3.5">
                <Languages className="size-5 text-fixora-blue" aria-hidden />
                <span className="flex-1 text-[15px] font-medium text-slate-900">Language</span>
                <select className="bg-transparent text-[15px] text-slate-700 outline-none" {...form.register('language')}>
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Bell className="size-5 fill-fixora-blue text-fixora-blue" aria-hidden />
                <span className="flex-1 text-[15px] font-medium text-slate-900">Receive Notifications</span>
                <Toggle label="Receive notifications" checked={notificationsEnabled} onChange={(v) => form.setValue('notificationsEnabled', v, { shouldDirty: true })} />
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Gift className="size-5 text-fixora-blue" aria-hidden />
                <span className="flex-1 text-[15px] font-medium text-slate-900">Marketing Offers</span>
                <Toggle label="Marketing offers" checked={marketingOptIn} onChange={(v) => form.setValue('marketingOptIn', v, { shouldDirty: true })} />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">Telugu and Hindi app text is being translated; your preference is saved for when it launches.</p>
          </section>

          {save.isError && <Alert>{save.error.message}</Alert>}
          <Button type="submit" size="lg" fullWidth loading={save.isPending && !uploading}>
            Save Changes
          </Button>
        </form>
      )}
    </MobileShell>
  );
}

function Labeled({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[15px] font-semibold text-slate-900">{label}</span>
      {children}
      {error && (
        <span role="alert" className="mt-1 block text-sm text-danger">
          {error}
        </span>
      )}
    </label>
  );
}
