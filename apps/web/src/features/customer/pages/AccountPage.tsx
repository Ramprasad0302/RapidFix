import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CalendarDays,
  Camera,
  ChevronRight,
  CircleCheck,
  CircleX,
  CreditCard,
  FileText,
  Gift,
  Headset,
  Info,
  LogOut,
  MapPin,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { formatIndianPhone } from '@fixora/shared-utils';
import { cx, Logo } from '@fixora/ui';
import { GuestAvatar } from '../../../components/art/Scenes';
import { Avatar } from '../../../components/Avatar';
import { Skeleton } from '../../../components/States';
import { APP_VERSION } from '../../../lib/config';
import { customerApi } from '../../../lib/endpoints';
import { authActions, useAuth } from '../../../store/auth';
import { useUnreadCount } from '../queries';

interface MenuItem {
  to?: string;
  onClick?: () => void;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  danger?: boolean;
}

export function AccountPage() {
  const status = useAuth((s) => s.status);
  return (
    <main className="px-4">
      <header className="flex items-center justify-between pt-[max(0.9rem,env(safe-area-inset-top))] pb-2">
        <Logo size="sm" />
        <BellLink />
      </header>
      {status === 'authenticated' ? <SignedIn /> : <Guest />}
    </main>
  );
}

function BellLink() {
  const unread = useUnreadCount().data ?? 0;
  return (
    <Link to="/notifications" aria-label="Notifications" className="relative flex size-10 items-center justify-center rounded-full hover:bg-slate-100">
      <Bell className="size-6" strokeWidth={1.8} />
      {unread > 0 && <span className="absolute top-1.5 right-2 size-2.5 rounded-full bg-danger ring-2 ring-white" />}
    </Link>
  );
}

function Guest() {
  return (
    <>
      <h1 className="mt-3 text-[28px] font-bold text-slate-900">Account</h1>
      <p className="text-[15px] text-slate-500">Access your bookings, saved addresses and more</p>
      <section className="mt-5 flex flex-col items-center rounded-3xl bg-gradient-to-b from-[#EEF4FF] to-[#F6F9FF] px-6 pt-6 pb-6 text-center">
        <GuestAvatar className="size-28" />
        <h2 className="mt-3 text-xl font-bold text-slate-900">Welcome to FIXORA!</h2>
        <p className="mt-1 text-[15px] text-slate-600">Login or create an account to manage your bookings, addresses and more.</p>
        <Link to="/login?redirect=/account" className="mt-5 flex h-13 w-full items-center justify-center gap-1.5 rounded-full bg-fixora-blue text-[16px] font-semibold text-white hover:bg-fixora-blue-dark">
          Login / Sign Up <ChevronRight className="size-5" aria-hidden />
        </Link>
      </section>
      <Menu
        items={[
          { to: '/bookings', icon: CalendarDays, title: 'My Bookings', subtitle: 'View and manage your service bookings' },
          { to: '/account/addresses', icon: MapPin, title: 'Saved Addresses', subtitle: 'Manage your service locations' },
          { to: '/notifications', icon: Bell, title: 'Notifications', subtitle: 'Service updates and offers' },
        ]}
      />
      <Menu
        items={[
          { to: '/help', icon: Headset, title: 'Help & Support', subtitle: 'Get help, FAQs and support' },
          { to: '/terms', icon: FileText, title: 'Terms & Conditions' },
          { to: '/privacy', icon: ShieldCheck, title: 'Privacy Policy' },
          { to: '/about', icon: Info, title: 'About FIXORA', subtitle: `Version ${APP_VERSION}` },
        ]}
      />
    </>
  );
}

function SignedIn() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const stats = useQuery({ queryKey: ['customer', 'stats'], queryFn: customerApi.stats });

  const tiles = [
    { key: 'upcoming', label: 'Upcoming', icon: <CalendarDays className="size-6 text-fixora-blue" />, tab: 'upcoming' },
    { key: 'active', label: 'Active', icon: <CircleCheck className="size-6 fill-success text-white" />, tab: 'active' },
    { key: 'completed', label: 'Completed', icon: <CircleCheck className="size-6 fill-slate-400 text-white" />, tab: 'completed' },
    { key: 'cancelled', label: 'Cancelled', icon: <CircleX className="size-6 fill-danger text-white" />, tab: 'cancelled' },
  ] as const;

  return (
    <>
      <h1 className="mt-3 text-[28px] font-bold text-slate-900">My Account</h1>
      <p className="text-[15px] text-slate-500">Manage your profile and account settings</p>

      <Link to="/account/edit" className="mt-4 flex items-center gap-4 rounded-3xl bg-fixora-blue-soft p-4">
        <span className="relative">
          <Avatar name={user?.name ?? user?.phone} src={user?.avatarUrl} size={76} />
          <span className="absolute -right-0.5 -bottom-0.5 flex size-7 items-center justify-center rounded-full border-2 border-white bg-fixora-blue text-white">
            <Camera className="size-3.5" aria-hidden />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold text-slate-900">{user?.name ?? 'Add your name'}</span>
          <span className="block text-[15px] text-slate-700">{user?.phone && formatIndianPhone(user.phone)}</span>
          {user?.email && <span className="block truncate text-sm text-slate-600">{user.email}</span>}
        </span>
        <ChevronRight className="size-5 text-fixora-blue" aria-hidden />
      </Link>

      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">My Bookings</h2>
        <Link to="/bookings" className="text-[15px] font-medium text-fixora-blue">
          View All
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {tiles.map((t) => (
          <Link key={t.key} to="/bookings" className="flex flex-col items-center gap-1 rounded-2xl bg-slate-50 py-3">
            {t.icon}
            {stats.isPending ? <Skeleton className="h-6 w-6" /> : <span className="text-xl font-bold text-slate-900">{stats.data?.[t.key] ?? 0}</span>}
            <span className="text-xs text-slate-500">{t.label}</span>
          </Link>
        ))}
      </div>

      <Menu
        items={[
          { to: '/account/addresses', icon: MapPin, title: 'My Addresses', subtitle: 'Home, Office, Other locations' },
          { to: '/account/payments', icon: CreditCard, title: 'Payment Methods', subtitle: 'Cash, UPI, Cards, Wallets' },
        ]}
      />
      <Menu
        items={[
          { to: '/notifications', icon: Bell, title: 'Notifications', subtitle: 'Service updates and offers' },
          { to: '/account/refer', icon: Gift, title: 'Refer & Earn', subtitle: 'Invite friends to FIXORA' },
          { to: '/help', icon: Headset, title: 'Help & Support', subtitle: 'Get help, FAQs and support' },
          { to: '/account/edit', icon: Settings, title: 'Settings', subtitle: 'Language, app preferences' },
          {
            icon: LogOut,
            title: 'Logout',
            danger: true,
            // Customers stay in the app as guests after logging out.
            onClick: async () => {
              await authActions.logout();
              navigate('/', { replace: true });
            },
          },
        ]}
      />
      <p className="py-4 text-center text-xs text-slate-400">FIXORA v{APP_VERSION} · by Nirmaan Digital</p>
    </>
  );
}

function Menu({ items }: { items: MenuItem[] }) {
  return (
    <ul className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
      {items.map((item) => (
        <li key={item.title} className="border-b border-slate-100 last:border-0">
          <MenuRow item={item} />
        </li>
      ))}
    </ul>
  );
}

function MenuRow({ item }: { item: MenuItem }) {
  const Icon = item.icon;
  const body: ReactNode = (
    <>
      <Icon className={cx('size-6 shrink-0', item.danger ? 'text-danger' : 'text-fixora-blue')} aria-hidden />
      <span className="flex-1">
        <span className={cx('block text-[15px] font-semibold', item.danger ? 'text-danger' : 'text-slate-900')}>{item.title}</span>
        {item.subtitle && <span className="block text-[13px] text-slate-500">{item.subtitle}</span>}
      </span>
      <ChevronRight className={cx('size-5', item.danger ? 'text-danger' : 'text-slate-400')} aria-hidden />
    </>
  );
  const cls = cx('flex w-full items-center gap-4 px-4 py-3.5 text-left', item.danger ? 'bg-danger-soft/60 hover:bg-danger-soft' : 'hover:bg-slate-50');
  return item.to ? (
    <Link to={item.to} className={cls}>
      {body}
    </Link>
  ) : (
    <button onClick={item.onClick} className={cls}>
      {body}
    </button>
  );
}
