import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search, ShieldAlert, UserCog } from 'lucide-react';
import { hasPermission, isAdminRole, Permission, Role, type AdminUserRowDto } from '@fixora/shared-types';
import { formatIndianPhone } from '@fixora/shared-utils';
import { Alert, Button, cx } from '@fixora/ui';
import { Avatar } from '../../../components/Avatar';
import { Dialog } from '../../../components/Dialog';
import { EmptyState, ErrorState, Skeleton } from '../../../components/States';
import { Pill } from '../../../components/StatusBadge';
import { adminApi } from '../../../lib/endpoints';
import { formatDate, timeAgo } from '../../../lib/format';
import { useAuth } from '../../../store/auth';
import { toast } from '../../../store/toast';
import { ROLE_LABEL } from '../AdminLayout';
import { Card } from '../components/Card';

const ALL_ROLES: Role[] = [Role.CUSTOMER, Role.TECHNICIAN, Role.SUPER_ADMIN, Role.ADMIN, Role.OPERATIONS, Role.SUPPORT, Role.FINANCE];
const ROLE_TONE: Record<Role, 'blue' | 'green' | 'purple' | 'amber' | 'gray'> = {
  CUSTOMER: 'gray',
  TECHNICIAN: 'green',
  SUPER_ADMIN: 'purple',
  ADMIN: 'purple',
  OPERATIONS: 'blue',
  SUPPORT: 'blue',
  FINANCE: 'amber',
};
const ROLE_HELP: Record<Role, string> = {
  CUSTOMER: 'Books services in the customer app.',
  TECHNICIAN: 'Uses the partner app. A new technician starts as “Pending verification”.',
  SUPER_ADMIN: 'Everything, including managing other admins.',
  ADMIN: 'General administration; can switch customers ↔ technicians.',
  OPERATIONS: 'Bookings and technicians.',
  SUPPORT: 'Customers and complaints.',
  FINANCE: 'Payments and payouts.',
};

const PAGE_SIZE = 15;

export function UsersRolesPage() {
  const me = useAuth((s) => s.user);
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const roleFilter = (params.get('role') as Role | null) ?? undefined;
  const page = Number(params.get('page') ?? 1);
  const [text, setText] = useState(q);
  const [pending, setPending] = useState<{ user: AdminUserRowDto; role: Role } | null>(null);

  const users = useQuery({
    queryKey: ['admin', 'users', q, roleFilter, page],
    queryFn: () => adminApi.users({ q: q || undefined, role: roleFilter, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const canManageStaff = !!me && hasPermission(me.role, Permission.ADMINS_MANAGE);
  const setParam = (k: string, v: string | undefined) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };

  /** Mirrors the server rules so admins only see choices that will succeed. */
  const choicesFor = (u: AdminUserRowDto): Role[] => {
    if (u.id === me?.id) return [];
    if (isAdminRole(u.role) && !canManageStaff) return [];
    return canManageStaff ? ALL_ROLES : [Role.CUSTOMER, Role.TECHNICIAN];
  };

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-[30px] font-bold tracking-tight text-slate-900">
            <UserCog className="size-7 text-fixora-blue" aria-hidden /> Users &amp; Roles
          </h1>
          <p className="text-[15px] text-slate-500">Everyone signs in on the same login page — their role decides which app they see.</p>
        </div>
      </div>

      <Card className="mt-6">
        <div className="flex flex-wrap gap-3">
          <form
            role="search"
            className="flex h-11 min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3"
            onSubmit={(e) => {
              e.preventDefault();
              setParam('q', text.trim() || undefined);
            }}
          >
            <Search className="size-4.5 text-slate-500" aria-hidden />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by name, phone or email" aria-label="Search users" className="h-full flex-1 bg-transparent text-sm outline-none" />
          </form>
          <select
            value={roleFilter ?? ''}
            onChange={(e) => setParam('role', e.target.value || undefined)}
            aria-label="Filter by role"
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none"
          >
            <option value="">All roles</option>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>

        {users.isError && !users.data && <ErrorState error={users.error} onRetry={() => void users.refetch()} />}
        {users.isPending && <Skeleton className="mt-4 h-72" />}
        {users.data && users.data.items.length === 0 && <EmptyState title="No users found" body="Try a different name, number or role." />}

        {users.data && users.data.items.length > 0 && (
          <div className="-mx-5 mt-4 overflow-x-auto">
            <table className={cx('w-full min-w-[880px] text-left text-sm', users.isFetching && 'opacity-70')}>
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/70 text-[13px] text-slate-500">
                  {['User', 'Phone', 'Email', 'Role', 'Status', 'Joined', 'Last login'].map((h) => (
                    <th key={h} scope="col" className="px-5 py-2.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.data.items.map((u) => {
                  const choices = choicesFor(u);
                  return (
                    <tr key={u.id} className="text-slate-700">
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={u.name ?? u.phone} size={32} />
                          <span className="font-medium text-slate-900">{u.name ?? '—'}</span>
                          {u.id === me?.id && <span className="text-xs text-slate-400">(you)</span>}
                        </span>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">{u.phone ? formatIndianPhone(u.phone) : '—'}</td>
                      <td className="max-w-[200px] truncate px-5 py-3">{u.email ?? '—'}</td>
                      <td className="px-5 py-3">
                        {choices.length ? (
                          <select
                            value={u.role}
                            aria-label={`Role for ${u.name ?? u.phone}`}
                            onChange={(e) => setPending({ user: u, role: e.target.value as Role })}
                            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-medium outline-none focus:border-fixora-blue"
                          >
                            {!choices.includes(u.role) && <option value={u.role}>{ROLE_LABEL[u.role]}</option>}
                            {choices.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Pill tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Pill>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {u.status !== 'ACTIVE' ? (
                          <Pill tone="red">{u.status[0] + u.status.slice(1).toLowerCase()}</Pill>
                        ) : u.technicianStatus && u.role === 'TECHNICIAN' && u.technicianStatus !== 'VERIFIED' ? (
                          <Pill tone="amber">{u.technicianStatus[0] + u.technicianStatus.slice(1).toLowerCase()}</Pill>
                        ) : (
                          <Pill tone="green">Active</Pill>
                        )}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">{formatDate(u.createdAt)}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-slate-500">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {users.data && users.data.meta.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
            <span>
              {users.data.meta.total} users · page {page} of {users.data.meta.totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))} leftIcon={<ChevronLeft className="size-4" />}>
                Prev
              </Button>
              <Button variant="outline" size="sm" disabled={page >= users.data.meta.totalPages} onClick={() => setParam('page', String(page + 1))}>
                Next <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <ConfirmRoleChange pending={pending} onClose={() => setPending(null)} />
    </div>
  );
}

function ConfirmRoleChange({ pending, onClose }: { pending: { user: AdminUserRowDto; role: Role } | null; onClose(): void }) {
  const qc = useQueryClient();
  const change = useMutation({
    mutationFn: () => adminApi.changeRole(pending!.user.id, pending!.role),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast(`${pending!.user.name ?? 'User'} is now ${ROLE_LABEL[pending!.role]}`);
      onClose();
    },
  });
  const u = pending?.user;
  return (
    <Dialog
      variant="center"
      open={!!pending}
      onClose={() => {
        change.reset();
        onClose();
      }}
      title="Change role?"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={change.isPending} onClick={() => change.mutate()}>
            Change role
          </Button>
        </div>
      }
    >
      {u && pending && (
        <div className="text-[15px] text-slate-700">
          <p>
            <b className="text-slate-900">{u.name ?? u.phone}</b>: {ROLE_LABEL[u.role]} → <b className="text-slate-900">{ROLE_LABEL[pending.role]}</b>
          </p>
          <p className="mt-2 text-sm text-slate-500">{ROLE_HELP[pending.role]}</p>
          <p className="mt-3 flex gap-2 rounded-xl bg-warning-soft p-3 text-sm text-slate-700">
            <ShieldAlert className="size-5 shrink-0 text-warning" aria-hidden />
            They’ll be signed out everywhere and land in their new area the next time they log in. This change is recorded in the audit log.
          </p>
          {change.isError && <Alert className="mt-3">{change.error.message}</Alert>}
        </div>
      )}
    </Dialog>
  );
}
