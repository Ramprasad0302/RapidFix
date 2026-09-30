import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { CircleCheck, ShieldAlert, Trash2 } from 'lucide-react';
import { formatIndianPhone } from '@fixora/shared-utils';
import { Alert, Button, Logo } from '@fixora/ui';
import { PageHeader } from '../../components/PageHeader';
import { CenteredSpinner } from '../../components/States';
import { authApi } from '../../lib/endpoints';
import { homeFor, signOut, useAuth } from '../../store/auth';
import { MobileShell } from '../customer/CustomerTabsLayout';
import { useSupportContacts } from '../customer/queries';

const ERASED = [
  'Your name, mobile number, email, photo and date of birth',
  'Saved addresses and location',
  'Notifications and registered devices',
  'For partners: ID documents, bank / UPI details and profile',
];
const KEPT = ['Past booking, invoice and payment records — kept without your name or number, as tax law requires'];

/**
 * Public account-deletion page (also the "delete account" link given to Google Play).
 * Signed-in customers and partners delete their account here; others are asked to log in first.
 */
export function DeleteAccountPage() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const { phone, email } = useSupportContacts();
  const [confirm, setConfirm] = useState('');
  const remove = useMutation({
    mutationFn: () => authApi.deleteAccount(),
    onSuccess: () => void signOut(),
  });

  return (
    <MobileShell>
      <PageHeader title="Delete account" backTo={homeFor(user?.role)} />
      <main className="flex flex-col gap-5 px-5 pb-10 lg:px-10">
        <Logo size="sm" className="hidden lg:block" />
        <h1 className="text-2xl font-bold text-slate-900">Delete your RapidFix account</h1>

        {remove.isSuccess ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-success-soft p-6 text-center">
            <CircleCheck className="size-10 text-success" aria-hidden />
            <p className="text-lg font-semibold text-slate-900">Your account has been deleted</p>
            <p className="text-sm text-slate-600">Your personal details were erased. You can sign up again any time with the same number.</p>
            <Link to="/" className="font-semibold text-fixora-blue">
              Go to home
            </Link>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-900">What gets deleted</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-slate-600">
                {ERASED.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <h2 className="mt-4 font-semibold text-slate-900">What we keep</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-slate-600">
                {KEPT.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-slate-500">
                Deletion is immediate and can't be undone. Open bookings must be finished or cancelled first. Partners with unpaid earnings should contact support first.
              </p>
            </section>

            {status === 'unknown' ? (
              <CenteredSpinner />
            ) : status !== 'authenticated' ? (
              <>
                <p className="text-[15px] text-slate-600">Log in with the mobile number of the account you want to delete.</p>
                <Link
                  to="/login?redirect=/delete-account"
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-fixora-blue px-5 font-semibold text-white hover:bg-fixora-blue-dark"
                >
                  Log in to continue
                </Link>
              </>
            ) : user?.role !== 'CUSTOMER' && user?.role !== 'TECHNICIAN' ? (
              <Alert tone="info">Staff accounts are removed by a RapidFix super admin.</Alert>
            ) : (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (confirm.trim().toUpperCase() === 'DELETE') remove.mutate();
                }}
                className="flex flex-col gap-4 rounded-2xl border border-danger/30 bg-danger-soft/40 p-5"
              >
                <p className="flex items-start gap-2 text-[15px] text-slate-800">
                  <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
                  <span>
                    You're signed in as <b>{user.phone ? formatIndianPhone(user.phone) : user.name}</b>. Type <b>DELETE</b> to confirm.
                  </span>
                </p>
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-label="Type DELETE to confirm"
                  autoCapitalize="characters"
                  className="field"
                  placeholder="DELETE"
                />
                {remove.isError && <Alert>{remove.error.message}</Alert>}
                <Button type="submit" variant="danger" size="lg" fullWidth loading={remove.isPending} disabled={confirm.trim().toUpperCase() !== 'DELETE'}>
                  <Trash2 className="size-4.5" aria-hidden /> Delete my account
                </Button>
              </form>
            )}

            <p className="text-sm text-slate-500">
              Can't log in? Ask us to delete it: call <a href={`tel:${phone.replace(/\s/g, '')}`} className="font-medium text-fixora-blue">{phone}</a> or email{' '}
              <a href={`mailto:${email}?subject=Delete%20my%20RapidFix%20account`} className="font-medium text-fixora-blue">
                {email}
              </a>{' '}
              from your registered details. We complete requests within 7 days.
            </p>
          </>
        )}
      </main>
    </MobileShell>
  );
}
