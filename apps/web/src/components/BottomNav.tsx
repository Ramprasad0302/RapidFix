import { NavLink } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { cx } from '@fixora/ui';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/** Fixed bottom tab bar, constrained to the mobile app column. */
export function BottomNav({ items }: { items: NavItem[] }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] border-t lg:hidden border-slate-100 bg-white/97 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgb(11_31_58/0.05)] backdrop-blur"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cx('flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-medium', isActive ? 'text-fixora-blue' : 'text-slate-500')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="size-6" strokeWidth={isActive ? 2.4 : 1.8} fill={isActive ? 'currentColor' : 'none'} fillOpacity={isActive ? 0.15 : 0} aria-hidden />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
