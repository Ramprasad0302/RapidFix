import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  ChartLine,
  ChevronRight,
  FileCheck2,
  Headset,
  Landmark,
  LogOut,
  MapPinned,
  Star,
  ToggleRight,
  UserRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { cx } from '@fixora/ui';
import { Avatar } from '../../../components/Avatar';
import { ErrorState, Skeleton } from '../../../components/States';
import { technicianApi } from '../../../lib/endpoints';
import { signOut } from '../../../store/auth';
import { toast } from '../../../store/toast';
import { EarningsCard, monthOptions } from '../components/EarningsCard';
import { TechHeader } from '../components/TechHeader';

interface Item {
  icon: LucideIcon;
  label: string;
  to: string;
}

const ACCOUNT: Item[] = [
  { icon: WalletCards, label: 'My Earnings', to: '/technician/earnings' },
  { icon: Landmark, label: 'Bank & UPI Details', to: '/technician/payout-details' },
  { icon: ToggleRight, label: 'My Availability', to: '/technician' },
  { icon: MapPinned, label: 'Service Area', to: '/technician/profile/edit' },
  { icon: FileCheck2, label: 'My Documents', to: '/technician/documents' },
  { icon: Star, label: 'My Reviews', to: '/technician/reviews' },
  { icon: ChartLine, label: 'Performance', to: '/technician/performance' },
];

const SETTINGS: Item[] = [
  { icon: UserRound, label: 'Profile Details', to: '/technician/profile/edit' },
  { icon: Bell, label: 'Notifications', to: '/technician/notifications' },
  { icon: Headset, label: 'Help & Support', to: '/technician/help' },
];

export function ProfilePage() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(monthOptions()[0]!.value);
  const profile = useQuery({ queryKey: ['tech', 'profile'], queryFn: technicianApi.profile });
  const earnings = useQuery({ queryKey: ['tech', 'earnings', month], queryFn: () => technicianApi.earnings(month) });
  const p = profile.data;

  return (
    <>
      <TechHeader />
      <main className="flex flex-col gap-4 px-4 lg:mx-auto lg:max-w-5xl lg:px-8 lg:py-10">
        {profile.isPending && <Skeleton className="h-24" />}
        {profile.isError && <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />}
        {p && (
          <Link to="/technician/profile/edit" className="flex items-center gap-3.5 rounded-2xl bg-fixora-blue-soft/70 p-3.5">
            <Avatar name={p.name} src={p.avatarUrl} size={64} online={p.isOnline} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold text-slate-900">{p.name}</p>
              <p className="text-sm text-slate-600">{p.title}</p>
              <span className={cx('mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold', p.isOnline ? 'bg-success-soft text-success' : 'bg-slate-200 text-slate-600')}>
                <span className={cx('size-2 rounded-full', p.isOnline ? 'bg-success' : 'bg-slate-400')} /> {p.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <ChevronRight className="size-5 text-slate-400" aria-hidden />
          </Link>
        )}

        {earnings.isPending ? <Skeleton className="h-36" /> : earnings.data && <EarningsCard e={earnings.data} month={month} onMonth={setMonth} />}

        <Menu items={ACCOUNT} />

        {p && (
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">My Services</h2>
              <button onClick={() => toast('Skills are managed by RapidFix during verification.')} className="text-sm font-medium text-fixora-blue">
                Manage
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {p.skills.map((s) => (
                <span key={s.id} className="rounded-lg border border-fixora-blue/25 bg-fixora-blue-soft px-3 py-1.5 text-sm font-medium text-fixora-blue">
                  {s.name}
                </span>
              ))}
            </div>
          </section>
        )}

        <h2 className="mt-2 text-lg font-bold text-slate-900">Settings</h2>
        <Menu items={SETTINGS} />
        <button
          onClick={async () => {
            await signOut();
            navigate('/login', { replace: true });
          }}
          className="mb-4 flex items-center gap-3 rounded-2xl bg-danger-soft/70 px-4 py-3.5 text-left font-semibold text-danger"
        >
          <LogOut className="size-5" /> <span className="flex-1">Logout</span> <ChevronRight className="size-5" />
        </button>
      </main>
    </>
  );
}

function Menu({ items }: { items: Item[] }) {
  return (
    <ul className="overflow-hidden rounded-2xl border border-slate-100 shadow-card">
      {items.map(({ icon: Icon, label, to }) => {
        const body = (
          <>
            <Icon className="size-5 text-fixora-blue" aria-hidden />
            <span className="flex-1 text-[15px] font-medium text-slate-900">{label}</span>
            <ChevronRight className="size-5 text-slate-400" aria-hidden />
          </>
        );
        const cls = 'flex w-full items-center gap-3.5 px-4 py-3.5 text-left hover:bg-slate-50';
        return (
          <li key={label} className="border-b border-slate-100 last:border-0">
            <Link to={to} className={cls}>
              {body}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
