import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPinned, MapPinPlus, Users } from 'lucide-react';
import { hasPermission, Permission } from '@fixora/shared-types';
import { formatIndianPhone } from '@fixora/shared-utils';
import { Button, cx } from '@fixora/ui';
import { ErrorState, Skeleton } from '../../../components/States';
import { Toggle } from '../../../components/Toggle';
import { adminModulesApi, franchiseApi, type AdminServiceAreaDto } from '../../../lib/endpoints';
import { useAuth } from '../../../store/auth';
import { AddLocalityDialog } from '../components/AddLocalityDialog';
import { formatDate, formatTime } from '../../../lib/format';
import { toast } from '../../../store/toast';
import { Card } from '../components/Card';
import { PageTitle } from '../components/kit';

/**
 * Where RapidFix takes bookings: switch towns on/off and set each town's radius.
 * Customers outside every active town see "We're not here yet — I'm interested";
 * those requests are listed below, so you know where to expand next.
 */
export function ServiceAreaPage() {
  const data = useQuery({ queryKey: ['admin', 'service-area'], queryFn: adminModulesApi.serviceArea });
  const role = useAuth((s) => s.user?.role);
  const canFranchise = !!role && hasPermission(role, Permission.FRANCHISES_MANAGE);
  const franchises = useQuery({ queryKey: ['admin', 'franchises'], queryFn: franchiseApi.list, enabled: canFranchise });
  const [adding, setAdding] = useState(false);
  return (
    <div className="mx-auto max-w-[1000px]">
      <PageTitle
        icon={MapPinned}
        title="Service Area"
        subtitle="Bookings are accepted only inside active towns' radius. Everyone else can tap “I'm interested”."
        actions={
          <Button leftIcon={<MapPinPlus className="size-4.5" />} onClick={() => setAdding(true)}>
            Add locality
          </Button>
        }
      />
      <AddLocalityDialog open={adding} onClose={() => setAdding(false)} />
      {data.isPending && <Skeleton className="mt-6 h-96" />}
      {data.isError && !data.data && <ErrorState error={data.error} onRetry={() => void data.refetch()} />}
      {data.data && (
        <>
          <Card title="Towns" className="mt-5">
            <ul className="divide-y divide-slate-100">
              {data.data.locations.map((l) => (
                <TownRow key={`${l.id}:${l.isActive}:${l.radiusKm}`} l={l} franchises={canFranchise ? (franchises.data ?? []) : null} />
              ))}
            </ul>
          </Card>
          <Card title={`“I'm interested” requests (${data.data.interest.length})`} className="mt-5">
            {data.data.interest.length === 0 ? (
              <p className="flex items-center gap-2 py-6 text-sm text-slate-500">
                <Users className="size-4" aria-hidden /> No requests yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="py-2 pr-4">When</th>
                      <th className="py-2 pr-4">Place</th>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Phone</th>
                      <th className="py-2">Map</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.data.interest.map((i) => (
                      <tr key={i.id}>
                        <td className="py-2 pr-4 whitespace-nowrap text-slate-600">
                          {formatDate(i.createdAt)}, {formatTime(i.createdAt)}
                        </td>
                        <td className="py-2 pr-4 font-medium text-slate-900">{i.label || '—'}</td>
                        <td className="py-2 pr-4">{i.name || '—'}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{i.phone ? <a href={`tel:${i.phone}`} className="text-fixora-blue">{formatIndianPhone(i.phone)}</a> : 'Signed-in customer'}</td>
                        <td className="py-2">
                          {i.latitude != null && i.longitude != null ? (
                            <a className="text-fixora-blue" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${i.latitude},${i.longitude}`}>
                              Open
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function TownRow({ l, franchises }: { l: AdminServiceAreaDto['locations'][number]; franchises: { id: string; name: string; status: string }[] | null }) {
  const qc = useQueryClient();
  const attach = useMutation({
    mutationFn: (franchiseId: string | null) => adminModulesApi.setLocalityFranchise(l.id, franchiseId),
    onSuccess: (_d, franchiseId) => {
      toast(franchiseId ? `${l.name} now belongs to ${franchises?.find((f) => f.id === franchiseId)?.name}` : `${l.name} is run by head office`);
      void qc.invalidateQueries({ queryKey: ['admin', 'service-area'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'franchises'] });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const [radius, setRadius] = useState(String(l.radiusKm));
  const save = useMutation({
    mutationFn: (body: { isActive?: boolean; radiusKm?: number }) => adminModulesApi.updateServiceArea(l.id, body),
    onSuccess: () => {
      toast('Service area updated');
      void qc.invalidateQueries({ queryKey: ['admin', 'service-area'] });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const r = Number(radius);
  const changed = r !== l.radiusKm && r >= 1 && r <= 100;
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-40 flex-1">
        <p className={cx('font-semibold', l.isActive ? 'text-slate-900' : 'text-slate-500')}>{l.name}</p>
        <p className="text-xs text-slate-500">
          {l.district}, {l.state}
        </p>
        {franchises ? (
          <select
            value={l.franchiseId ?? ''}
            disabled={attach.isPending}
            onChange={(e) => attach.mutate(e.target.value || null)}
            aria-label={`Franchise for ${l.name}`}
            className="mt-1 h-8 max-w-full rounded-lg border border-slate-300 bg-white px-2 text-xs"
          >
            <option value="">Head office (no franchise)</option>
            {franchises.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.status !== 'ACTIVE' ? ` (${f.status.toLowerCase()})` : ''}
              </option>
            ))}
          </select>
        ) : (
          l.franchise && <p className="text-xs font-medium text-fixora-blue">{l.franchise}</p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        Radius
        <input type="number" min={1} max={100} value={radius} onChange={(e) => setRadius(e.target.value)} className="h-9 w-20 rounded-lg border border-slate-300 px-2" />
        km
      </label>
      <Button size="sm" variant="outline" disabled={!changed} loading={save.isPending && save.variables?.radiusKm != null} onClick={() => save.mutate({ radiusKm: r })}>
        Save
      </Button>
      <span className="flex items-center gap-2 text-sm text-slate-600">
        {l.isActive ? 'Serving' : 'Off'}
        <Toggle label={`Serve ${l.name}`} checked={l.isActive} onChange={(v) => save.mutate({ isActive: v })} />
      </span>
    </li>
  );
}
