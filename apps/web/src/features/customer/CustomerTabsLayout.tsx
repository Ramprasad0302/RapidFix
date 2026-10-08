import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { CalendarDays, House, TicketPercent, UserRound } from 'lucide-react';
import { cx } from '@fixora/ui';
import { AssistantButton } from '../../components/AssistantButton';
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
    <div className="lg:bg-white">
      <MobileShell wide>
        <div className="pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)] lg:pb-0">
          <Outlet />
        </div>
        <AssistantButton />
        <BottomNav items={TABS} />
      </MobileShell>
    </div>
  );
}

/**
 * Page column. Phones: full-width app screen. Laptops (≥1024px): `wide` pages
 * (Home, Bookings, Offers…) use a 1152px layout; other pages sit in a centred
 * 768px card under the top navigation bar.
 */
export function MobileShell({ children, wide = false, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div
      className={cx(
        'mx-auto min-h-dvh w-full max-w-[480px] bg-white shadow-[0_0_40px_rgb(11_31_58/0.06)]',
        wide
          ? 'lg:max-w-7xl lg:shadow-none'
          : 'lg:my-8 lg:min-h-[calc(100dvh-9rem)] lg:max-w-5xl lg:overflow-clip lg:rounded-3xl lg:border lg:border-slate-200/70 lg:shadow-card',
        className,
      )}
    >
      {children}
    </div>
  );
}
