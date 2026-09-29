import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import type { z } from 'zod';
import { adminLoginSchema } from '@fixora/shared-utils';
import { Alert, Button, FullScreenLoader, Logo, TextField } from '@fixora/ui';
import { adminLogin } from '../services/auth.service';
import { authActions, useAuth } from '../store/authStore';

type FormIn = z.input<typeof adminLoginSchema>;
type FormOut = z.output<typeof adminLoginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const status = useAuth((s) => s.status);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (status === 'unknown') return <FullScreenLoader />;
  if (status === 'authenticated') return <Navigate to="/" replace />;

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      const session = await adminLogin(email, password);
      if (authActions.setSession(session)) navigate('/', { replace: true });
      else setError('This account does not have admin access.');
    } catch (e) {
      setError((e as Error).message);
      form.resetField('password');
    }
  });

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-fixora-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo tone="light" size="lg" withTagline />
        <div>
          <p className="max-w-md font-display text-3xl leading-tight font-bold">
            Run every booking, partner and payout from one place.
          </p>
          <p className="mt-4 max-w-md text-white/60">FIXORA Admin · Operations console</p>
        </div>
        <p className="text-xs text-white/40">Developed by Nirmaan Digital</p>
        <div aria-hidden className="absolute -right-24 -bottom-24 size-96 rounded-full border-[40px] border-fixora-cyan/10" />
      </aside>

      <main className="flex items-center justify-center bg-slate-50 px-5 py-12">
        <div className="w-full max-w-sm">
          <Logo className="mb-8 lg:hidden" />
          <div className="rounded-card bg-white p-7 shadow-card">
            <div className="mb-6 flex size-11 items-center justify-center rounded-xl bg-fixora-blue-soft text-fixora-blue">
              <LockKeyhole className="size-5" aria-hidden />
            </div>
            <h1 className="font-display text-2xl font-bold text-fixora-navy">Admin sign in</h1>
            <p className="mt-1 text-sm text-slate-600">Authorised FIXORA staff only.</p>

            <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
              <TextField
                label="Work email"
                type="email"
                autoComplete="username"
                autoFocus
                error={form.formState.errors.email?.message}
                {...form.register('email')}
              />
              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                error={form.formState.errors.password?.message}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                }
                {...form.register('password')}
              />
              {error && <Alert>{error}</Alert>}
              <Button type="submit" size="lg" fullWidth loading={form.formState.isSubmitting}>
                Sign in
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
