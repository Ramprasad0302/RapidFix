import { Link, Navigate, useParams } from 'react-router';
import { Construction } from 'lucide-react';
import { hasPermission } from '@fixora/shared-types';
import { useAuth } from '../../../store/auth';
import { Card } from '../components/Card';
import { ALL_NAV } from '../nav';

/** Admin modules scheduled for Phase 9 — states plainly what's coming instead of showing fake data. */
export function ComingSoonPage() {
  const { section = '' } = useParams();
  const role = useAuth((s) => s.user?.role);
  const item = ALL_NAV.find((n) => n.slug === section);
  if (!item) return <Navigate to="/admin" replace />;
  if (!role || !hasPermission(role, item.permission)) return <Navigate to="/admin" replace />;
  const Icon = item.icon;
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="flex items-center gap-2 text-[30px] font-bold tracking-tight text-slate-900">
        <Icon className="size-7 text-fixora-blue" aria-hidden /> {item.label}
      </h1>
      <Card className="mt-6 flex flex-col items-center py-12 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-fixora-blue-soft text-fixora-blue">
          <Construction className="size-8" aria-hidden />
        </span>
        <h2 className="mt-4 text-lg font-bold text-slate-900">This module is being built</h2>
        <p className="mt-1 max-w-md text-slate-600">{item.description}</p>
        <p className="mt-1 text-sm text-slate-500">Scheduled for the admin phase of the FIXORA roadmap.</p>
        <Link to="/admin" className="mt-6 rounded-xl bg-fixora-blue px-5 py-2.5 font-semibold text-white">
          Back to Dashboard
        </Link>
      </Card>
    </div>
  );
}
