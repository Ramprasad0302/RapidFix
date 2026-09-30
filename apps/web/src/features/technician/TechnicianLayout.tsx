import { Outlet } from 'react-router';
import { CalendarDays, House, UserRound, WalletCards } from 'lucide-react';
import { BottomNav } from '../../components/BottomNav';
import { MobileShell } from '../customer/CustomerTabsLayout';
import { NewRequestSheet } from './components/NewRequestSheet';
import { useLocationSharing } from './useLocationSharing';

const TABS = [
  { to: '/technician', label: 'Home', icon: House, end: true },
  { to: '/technician/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/technician/earnings', label: 'Earnings', icon: WalletCards },
  { to: '/technician/profile', label: 'Profile', icon: UserRound },
];

export function TechnicianLayout() {
  useLocationSharing();
  return (
    <MobileShell>
      <div className="pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)]">
        <Outlet />
      </div>
      <BottomNav items={TABS} />
      <NewRequestSheet />
    </MobileShell>
  );
}
