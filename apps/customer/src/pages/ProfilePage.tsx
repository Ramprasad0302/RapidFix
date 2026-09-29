import { useEffect } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { formatIndianPhone } from '@fixora/shared-utils';
import { Alert, Button, Spinner, TextField } from '@fixora/ui';
import { getProfile, updateProfile } from '../services/profile.service';
import { authActions } from '../store/authStore';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  email: z.union([z.email('Enter a valid email').trim(), z.literal('')]),
});
type FormValues = z.infer<typeof schema>;

export function ProfilePage() {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['customer', 'profile'], queryFn: getProfile });
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '' } });

  useEffect(() => {
    if (profile.data) form.reset({ name: profile.data.name ?? '', email: profile.data.email ?? '' });
  }, [profile.data, form]);

  const save = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updated) => {
      queryClient.setQueryData(['customer', 'profile'], updated);
      authActions.updateUser({ name: updated.name, email: updated.email });
    },
  });

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="flex items-center gap-2 bg-white px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 shadow-sm">
        <Link to="/" aria-label="Back" className="flex size-10 items-center justify-center rounded-full hover:bg-slate-100">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-display text-lg font-bold text-fixora-navy">My profile</h1>
      </header>

      <main className="mx-auto w-full max-w-md px-4 py-6">
        {profile.isPending && (
          <div className="flex justify-center py-16 text-fixora-blue">
            <Spinner className="size-7" />
          </div>
        )}
        {profile.isError && (
          <div className="flex flex-col gap-3">
            <Alert>{profile.error.message}</Alert>
            <Button variant="outline" onClick={() => void profile.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {profile.data && (
          <form
            noValidate
            onSubmit={form.handleSubmit((v) => save.mutate(v))}
            className="flex flex-col gap-5 rounded-card bg-white p-5 shadow-card"
          >
            <div>
              <p className="text-sm font-medium text-slate-700">Mobile number</p>
              <p className="mt-1 text-base font-semibold text-slate-900">{formatIndianPhone(profile.data.phone)}</p>
            </div>
            <TextField
              label="Full name"
              autoComplete="name"
              error={form.formState.errors.name?.message}
              {...form.register('name')}
            />
            <TextField
              label="Email (optional)"
              type="email"
              autoComplete="email"
              error={form.formState.errors.email?.message}
              {...form.register('email')}
            />
            {save.isError && <Alert>{save.error.message}</Alert>}
            {save.isSuccess && !form.formState.isDirty && <Alert tone="info">Profile saved.</Alert>}
            <Button type="submit" size="lg" fullWidth loading={save.isPending}>
              Save changes
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
