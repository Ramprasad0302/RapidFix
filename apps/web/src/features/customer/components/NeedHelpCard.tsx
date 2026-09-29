import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { SupportArt } from '../../../components/art/Scenes';

export function NeedHelpCard({ to = '/help' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-4 rounded-2xl bg-fixora-blue-soft p-4">
      <SupportArt className="size-14 shrink-0" />
      <span className="flex-1">
        <span className="block text-[17px] font-semibold text-slate-900">Need Help?</span>
        <span className="block text-sm text-slate-600">Facing an issue with your booking? Our support team is here to help.</span>
      </span>
      <ChevronRight className="size-5 text-fixora-blue" aria-hidden />
    </Link>
  );
}
