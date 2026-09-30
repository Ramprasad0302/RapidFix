import { useState } from 'react';
import { Link } from 'react-router';
import { Bell, ChevronDown, MapPin } from 'lucide-react';
import { Logo } from '@fixora/ui';
import { useLocationStore } from '../../../store/location';
import { useUnreadCount } from '../queries';
import { LocationPicker } from './LocationPicker';

/** Logo · "Your Location" selector · notifications bell — top of Home and Offers. */
export function AppHeader() {
  const selected = useLocationStore((s) => s.selected);
  const [picking, setPicking] = useState(false);
  const unread = useUnreadCount().data ?? 0;

  return (
    <>
      <header className="flex items-center justify-between lg:hidden gap-2 px-4 pt-[max(0.9rem,env(safe-area-inset-top))] pb-3">
        <Link to="/" aria-label="RapidFix home">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-3">
          <button onClick={() => setPicking(true)} className="flex min-w-0 items-center gap-1.5 rounded-lg py-1 text-left" aria-label="Change location">
            <MapPin className="size-6 shrink-0 fill-fixora-blue text-white" strokeWidth={1.6} aria-hidden />
            <span className="min-w-0">
              <span className="block text-[11px] leading-tight text-slate-500">Your Location</span>
              <span className="flex items-center gap-0.5 text-[15px] leading-tight font-semibold text-slate-900">
                <span className="max-w-[118px] truncate">{selected?.label ?? 'Select Location'}</span>
                <ChevronDown className="size-4 shrink-0" aria-hidden />
              </span>
            </span>
          </button>
          <Link to="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative flex size-10 items-center justify-center rounded-full hover:bg-slate-100">
            <Bell className="size-6 text-slate-800" strokeWidth={1.8} />
            {unread > 0 && (
              <span className="absolute top-0.5 right-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4.5 font-bold text-white ring-2 ring-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
        </div>
      </header>
      <LocationPicker open={picking} onClose={() => setPicking(false)} />
    </>
  );
}
