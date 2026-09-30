import { Outlet } from 'react-router';
import { CalendarDays, House, UserRound, WalletCards } from 'lucide-react';
import { BottomNav } from '../../components/BottomNav';
import { PermissionsSheet } from '../../components/PermissionsSheet';
import { MobileShell } from '../customer/CustomerTabsLayout';

const TABS = [
  { to: '/technician', label: 'Home', icon: House, end: true },
  { to: '/technician/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/technician/earnings', label: 'Earnings', icon: WalletCards },
  { to: '/technician/profile', label: 'Profile', icon: UserRound },
];

export function TechnicianLayout() {
  return (
    <MobileShell wide>
      <div className="pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)] lg:pb-12">
        <Outlet />
      </div>
      <BottomNav items={TABS} />
      <PermissionsSheet location="technician" />
    </MobileShell>
  );
}
