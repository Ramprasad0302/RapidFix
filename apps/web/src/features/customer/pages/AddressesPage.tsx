import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, House, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import type { AddressDto } from '@fixora/shared-types';
import { PageHeader } from '../../../components/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '../../../components/States';
import { customerApi } from '../../../lib/endpoints';
import { addressLines } from '../../../lib/format';
import { toast } from '../../../store/toast';
import { MobileShell } from '../CustomerTabsLayout';

const LABEL_ICON = { HOME: House, WORK: Briefcase, OTHER: MapPin } as const;
const LABEL_TEXT = { HOME: 'Home', WORK: 'Work', OTHER: 'Other' } as const;

export function AddressesPage() {
  const qc = useQueryClient();
  const addresses = useQuery({ queryKey: ['customer', 'addresses'], queryFn: customerApi.addresses });
  const remove = useMutation({
    mutationFn: (id: string) => customerApi.deleteAddress(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customer', 'addresses'] });
      toast('Address removed');
    },
    onError: (e) => toast(e.message, 'error'),
  });

  return (
    <MobileShell>
      <PageHeader title="Saved Addresses" backTo="/account" />
      <main className="flex flex-col gap-3 px-4 pb-10">
        {addresses.isPending && Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-28" />)}
        {addresses.isError && <ErrorState error={addresses.error} onRetry={() => void addresses.refetch()} />}
        {addresses.isSuccess && addresses.data.length === 0 && (
          <EmptyState art={<MapPin className="size-10 text-slate-300" />} title="No saved addresses" body="Save your home or work address for faster booking." />
        )}
        {addresses.data?.map((a) => (
          <AddressCard key={a.id} address={a} onDelete={() => remove.mutate(a.id)} deleting={remove.isPending && remove.variables === a.id} />
        ))}
        <Link to="/account/addresses/new" className="mt-2 flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-fixora-blue/40 font-semibold text-fixora-blue">
          <Plus className="size-5" /> Add New Address
        </Link>
      </main>
    </MobileShell>
  );
}

function AddressCard({ address: a, onDelete, deleting }: { address: AddressDto; onDelete(): void; deleting: boolean }) {
  const Icon = LABEL_ICON[a.label];
  return (
    <article className="flex gap-3 rounded-2xl border border-slate-100 p-4 shadow-card">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fixora-blue-soft text-fixora-blue">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold text-slate-900">
          {LABEL_TEXT[a.label]}
          {a.isDefault && <span className="rounded bg-success-soft px-1.5 py-0.5 text-[11px] font-medium text-success">Default</span>}
        </p>
        {addressLines(a).map((l) => (
          <p key={l} className="text-sm text-slate-600">
            {l}
          </p>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <Link to={`/account/addresses/${a.id}`} aria-label="Edit address" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
          <Pencil className="size-4.5" />
        </Link>
        <button onClick={onDelete} disabled={deleting} aria-label="Delete address" className="rounded-lg p-2 text-danger hover:bg-danger-soft disabled:opacity-50">
          <Trash2 className="size-4.5" />
        </button>
      </div>
    </article>
  );
}
