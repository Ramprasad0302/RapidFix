import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { CalendarDays, House, TicketPercent, UserRound } from 'lucide-react';
import { BottomNav } from '../../components/BottomNav';

const TABS = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/offers', label: 'Offers', icon: TicketPercent },
  { to: '/account', label: 'Profile', icon: UserRound },
];

/** Mobile app column with the Home / Bookings / Offers / Profile tab bar. */
export function CustomerTabsLayout() {
  return (
    <MobileShell>
      <div className="pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)]">
        <Outlet />
      </div>
      <BottomNav items={TABS} />
    </MobileShell>
  );
}

/** Phone-width column; on tablets/desktops it sits centred like an app window. */
export function MobileShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto min-h-dvh w-full max-w-[480px] bg-white shadow-[0_0_40px_rgb(11_31_58/0.06)]">{children}</div>;
}
