import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { Bell, ChevronDown, MapPin } from 'lucide-react';
import { cx, Logo } from '@fixora/ui';
import { LocationPicker } from '../features/customer/components/LocationPicker';
import { useUnreadCount } from '../features/customer/queries';
import { useAuth } from '../store/auth';
import { useLocationStore } from '../store/location';
import { Avatar } from './Avatar';

const CUSTOMER_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/book', label: 'Services' },
  { to: '/bookings', label: 'My Bookings' },
  { to: '/offers', label: 'Offers' },
  { to: '/help', label: 'Help' },
];
const TECH_LINKS = [
  { to: '/technician', label: 'Home', end: true },
  { to: '/technician/bookings', label: 'Jobs' },
  { to: '/technician/earnings', label: 'Earnings' },
  { to: '/technician/profile', label: 'Profile' },
];

/**
 * Laptop/desktop navigation (≥1024px). Phones keep the bottom tab bar and the
 * in-page headers, which hide themselves at this width.
 */
export function DesktopTopBar({ area }: { area: 'customer' | 'technician' }) {
  const user = useAuth((s) => (s.status === 'authenticated' ? s.user : null));
  const unread = useUnreadCount().data ?? 0;
  const links = area === 'customer' ? CUSTOMER_LINKS : TECH_LINKS;
  const home = area === 'customer' ? '/' : '/technician';

  return (
    <header className="sticky top-0 z-40 hidden h-[72px] border-b border-slate-200/70 bg-white/90 backdrop-blur-md lg:block">
      <div className="mx-auto flex h-full max-w-7xl items-center gap-8 px-8">
        <Link to={home} aria-label="RapidFix home" className="shrink-0">
          <Logo size="sm" />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                cx(
                  'rounded-lg px-3.5 py-2 text-[15px] font-semibold transition-colors',
                  isActive ? 'bg-fixora-blue-soft text-fixora-blue' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {area === 'customer' && <LocationButton />}
          {user && (
            <Link
              to={area === 'customer' ? '/notifications' : '/technician/notifications'}
              aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
              className="relative flex size-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100"
            >
              <Bell className="size-5.5" strokeWidth={1.8} />
              {unread > 0 && (
                <span className="absolute top-0.5 right-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4.5 font-bold text-white ring-2 ring-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          )}
          {user ? (
            <Link
              to={area === 'customer' ? '/account' : '/technician/profile'}
              className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 hover:bg-slate-100"
            >
              <Avatar name={user.name ?? user.phone} src={user.avatarUrl} size={34} />
              <span className="max-w-[140px] truncate text-sm font-semibold text-slate-800">{user.name ?? 'My account'}</span>
            </Link>
          ) : (
            <Link to="/login" className="inline-flex h-10 items-center rounded-xl bg-fixora-blue px-4 text-sm font-semibold text-white shadow-sm hover:bg-fixora-blue-dark">
              Login / Sign up
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function LocationButton() {
  const selected = useLocationStore((s) => s.selected);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex max-w-[240px] items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-left hover:border-fixora-blue/40">
        <MapPin className="size-5 shrink-0 fill-fixora-blue text-white" strokeWidth={1.6} aria-hidden />
        <span className="min-w-0">
          <span className="block text-[11px] leading-tight text-slate-500">Service location</span>
          <span className="flex items-center gap-0.5 text-sm leading-tight font-semibold text-slate-900">
            <span className="truncate">{selected?.label ?? 'Select location'}</span>
            <ChevronDown className="size-4 shrink-0" aria-hidden />
          </span>
        </span>
      </button>
      <LocationPicker open={open} onClose={() => setOpen(false)} />
    </>
  );
}
