import { Link } from 'react-router';
import { Bell } from 'lucide-react';
import { Logo } from '@fixora/ui';
import { useUnreadCount } from '../../customer/queries';

export function TechHeader() {
  const unread = useUnreadCount().data ?? 0;
  return (
    <header className="flex items-center justify-between lg:hidden px-4 pt-[max(0.9rem,env(safe-area-inset-top))] pb-3">
      <Logo size="sm" />
      <Link to="/technician/notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative flex size-10 items-center justify-center rounded-full hover:bg-slate-100">
        <Bell className="size-6" strokeWidth={1.8} />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4.5 font-bold text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>
    </header>
  );
}
