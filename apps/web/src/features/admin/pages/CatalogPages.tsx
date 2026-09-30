import { useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, ImagePlus, Plus, Shapes, Trash2, Wrench } from 'lucide-react';
import type { AdminCategoryDto, AdminCouponDto, AdminServiceDto } from '@fixora/shared-types';
import { formatINR, rupeesToPaise } from '@fixora/shared-utils';
import { Alert, Button, Spinner, cx } from '@fixora/ui';
import { Dialog } from '../../../components/Dialog';
import { ServiceArt } from '../../../components/ServiceArt';
import { Pill } from '../../../components/StatusBadge';
import { Toggle } from '../../../components/Toggle';
import { mediaUrl } from '../../../lib/api';
import { adminModulesApi, uploadApi, type CategoryInput, type CouponInput, type ServiceInput } from '../../../lib/endpoints';
import { formatDate } from '../../../lib/format';
import { toast } from '../../../store/toast';
import { Card } from '../components/Card';
import { DataTable, Field, FilterSelect, inputCls, isoDay, PageTitle, SearchBox, useUrlParams, type Column } from '../components/kit';

const ICON_KEYS = ['ac', 'electrical', 'plumbing', 'carpentry', 'painting', 'appliance', 'cleaning', 'cctv', 'ro', 'pest', 'more'];
const toRupees = (paise: number) => String(paise / 100);
const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

function useSave<T>(fn: (v: T) => Promise<unknown>, keys: string[], onDone: () => void, message: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const k of keys) void qc.invalidateQueries({ queryKey: ['admin', k] });
      void qc.invalidateQueries({ queryKey: ['categories'] });
      toast(message);
      onDone();
    },
  });
}

function ImageField({ value, onChange }: { value: string | null; onChange(v: string | null): void }) {
  const ref = useRef<HTMLInputElement>(null);
  const upload = useMutation({ mutationFn: (f: File) => uploadApi.upload(f, 'image'), onSuccess: (r) => onChange(r.path), onError: (e) => toast(e.message, 'error') });
  return (
    <Field label="Image" hint="JPG / PNG / WebP, optimised automatically. Without an image the category illustration is shown.">
      <div className="flex items-center gap-3">
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
          {upload.isPending ? <Spinner /> : value ? <img src={mediaUrl(value)!} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6 text-slate-400" />}
        </span>
        <input
          ref={ref}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) upload.mutate(f);
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()}>
          {value ? 'Replace' : 'Upload'}
        </Button>
        {value && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)} leftIcon={<Trash2 className="size-4" />}>
            Remove
          </Button>
        )}
      </div>
    </Field>
  );
}

type Commission = { type: 'PERCENTAGE' | 'FIXED'; value: number } | null;
function CommissionField({ value, onChange, inherited }: { value: Commission; onChange(v: Commission): void; inherited: string }) {
  return (
    <Field label="RapidFix commission" hint={value ? 'Overrides the broader rule for this item.' : `Uses ${inherited}.`}>
      <div className="flex gap-2">
        <select
          value={value?.type ?? ''}
          onChange={(e) => onChange(e.target.value ? { type: e.target.value as 'PERCENTAGE' | 'FIXED', value: e.target.value === 'PERCENTAGE' ? 15 : 10_000 } : null)}
          className={cx(inputCls, 'w-44')}
        >
          <option value="">Default</option>
          <option value="PERCENTAGE">Percentage</option>
          <option value="FIXED">Fixed ₹</option>
        </select>
        {value && (
          <input
            inputMode="decimal"
            value={value.type === 'PERCENTAGE' ? value.value : toRupees(value.value)}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^\d.]/g, '')) || 0;
              onChange({ ...value, value: value.type === 'PERCENTAGE' ? Math.min(50, n) : rupeesToPaise(n) });
            }}
            aria-label={value.type === 'PERCENTAGE' ? 'Commission percent' : 'Commission in rupees'}
            className={cx(inputCls, 'w-32')}
          />
        )}
      </div>
    </Field>
  );
}

function FormDialog({ open, title, onClose, children, onSubmit, pending, error }: { open: boolean; title: string; onClose(): void; children: ReactNode; onSubmit(): void; pending: boolean; error?: string | null }) {
  return (
    <Dialog
      variant="wide"
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex items-center justify-end gap-3">
          {error && <Alert className="mr-auto py-2">{error}</Alert>}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} onClick={onSubmit}>
            Save
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Dialog>
  );
}

const commissionLabel = (c: Commission) => (c ? (c.type === 'PERCENTAGE' ? `${c.value}%` : formatINR(c.value)) : 'Default');

// ─── Services ────────────────────────────────────────────────────────────

export function ServicesPage() {
  const { get, set } = useUrlParams();
  const categoryId = get('category');
  const q = get('q');
  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminModulesApi.categories });
  const services = useQuery({ queryKey: ['admin', 'services', { categoryId, q }], queryFn: () => adminModulesApi.services({ categoryId, q }) });
  const [editing, setEditing] = useState<AdminServiceDto | 'new' | null>(null);

  const columns: Column<AdminServiceDto>[] = [
    {
      header: 'Service',
      cell: (s) => (
        <span className="flex items-center gap-3">
          <ServiceArt imageUrl={s.imageUrl} iconKey={categories.data?.find((c) => c.id === s.categoryId)?.iconKey ?? 'more'} alt="" className="size-10 shrink-0 rounded-lg" artClassName="w-3/5" />
          <span>
            <span className="block font-medium text-slate-900">{s.name}</span>
            <span className="text-xs text-slate-500">{s.categoryName}</span>
          </span>
        </span>
      ),
    },
    { header: 'Price', className: 'text-right whitespace-nowrap', cell: (s) => formatINR(s.basePrice) },
    { header: 'Visit', className: 'text-right whitespace-nowrap', cell: (s) => formatINR(s.visitCharge) },
    { header: 'Duration', className: 'whitespace-nowrap', cell: (s) => `${s.durationMinMinutes}–${s.durationMaxMinutes} min` },
    { header: 'Commission', cell: (s) => commissionLabel(s.commission) },
    { header: 'Bookings', className: 'text-right', cell: (s) => s.bookings },
    {
      header: 'Status',
      cell: (s) => (
        <span className="flex gap-1">
          <Pill tone={s.isActive ? 'green' : 'gray'}>{s.isActive ? 'Active' : 'Hidden'}</Pill>
          {s.isPopular && <Pill tone="blue">Popular</Pill>}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageTitle
        icon={Wrench}
        title="Services"
        subtitle="Prices, visit charges, durations, inclusions and commission. Price changes are audited."
        actions={
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')} disabled={!categories.data?.length}>
            New service
          </Button>
        }
      />
      <Card className="mt-6">
        <div className="flex flex-wrap gap-3">
          <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="Search services" />
          <FilterSelect label="All categories" value={categoryId} options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => set({ category: v })} />
        </div>
        <DataTable columns={columns} rows={services.data} rowKey={(s) => s.id} onRowClick={(s) => setEditing(s)} loading={services.isPending} error={services.error} onRetry={() => void services.refetch()} empty="No services" />
      </Card>
      {editing && categories.data && <ServiceForm key={editing === 'new' ? 'new' : editing.id} service={editing === 'new' ? null : editing} categories={categories.data} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ServiceForm({ service, categories, onClose }: { service: AdminServiceDto | null; categories: AdminCategoryDto[]; onClose(): void }) {
  const [v, setV] = useState({
    categoryId: service?.categoryId ?? categories[0]!.id,
    name: service?.name ?? '',
    tagline: service?.tagline ?? '',
    description: service?.description ?? '',
    imageUrl: service?.imageUrl ?? null,
    basePrice: service ? toRupees(service.basePrice) : '',
    visitCharge: service ? toRupees(service.visitCharge) : '0',
    durationMinMinutes: String(service?.durationMinMinutes ?? 30),
    durationMaxMinutes: String(service?.durationMaxMinutes ?? 60),
    inclusions: service?.inclusions.join('\n') ?? '',
    exclusions: service?.exclusions.join('\n') ?? '',
    warrantyDays: String(service?.warrantyDays ?? 30),
    isPopular: service?.isPopular ?? false,
    isActive: service?.isActive ?? true,
    sortOrder: String(service?.sortOrder ?? 0),
    commission: (service?.commission ?? null) as Commission,
  });
  const up = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  const save = useSave(
    (body: ServiceInput) => adminModulesApi.saveService(service?.id ?? null, body),
    ['services'],
    onClose,
    service ? 'Service updated' : 'Service created',
  );
  const submit = () =>
    save.mutate({
      categoryId: v.categoryId,
      name: v.name.trim(),
      tagline: v.tagline.trim(),
      description: v.description.trim(),
      imageUrl: v.imageUrl,
      basePrice: rupeesToPaise(Number(v.basePrice) || 0),
      visitCharge: rupeesToPaise(Number(v.visitCharge) || 0),
      durationMinMinutes: Number(v.durationMinMinutes) || 30,
      durationMaxMinutes: Number(v.durationMaxMinutes) || 60,
      inclusions: lines(v.inclusions),
      exclusions: lines(v.exclusions),
      warrantyDays: Number(v.warrantyDays) || 0,
      isPopular: v.isPopular,
      isActive: v.isActive,
      sortOrder: Number(v.sortOrder) || 0,
      commission: v.commission,
    });
  const num = (k: 'basePrice' | 'visitCharge' | 'durationMinMinutes' | 'durationMaxMinutes' | 'warrantyDays' | 'sortOrder') => ({
    value: v[k],
    inputMode: 'decimal' as const,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => up(k, e.target.value.replace(/[^\d.]/g, '')),
    className: inputCls,
  });

  return (
    <FormDialog open title={service ? `Edit ${service.name}` : 'New service'} onClose={onClose} onSubmit={submit} pending={save.isPending} error={save.error?.message}>
      <Field label="Name">
        <input value={v.name} onChange={(e) => up('name', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Category">
        <select value={v.categoryId} onChange={(e) => up('categoryId', e.target.value)} className={inputCls}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tagline" className="sm:col-span-2">
        <input value={v.tagline} onChange={(e) => up('tagline', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <textarea value={v.description} onChange={(e) => up('description', e.target.value)} rows={3} className={cx(inputCls, 'h-auto py-2')} />
      </Field>
      <Field label="Base price (₹)">
        <input {...num('basePrice')} />
      </Field>
      <Field label="Visit charge (₹)">
        <input {...num('visitCharge')} />
      </Field>
      <Field label="Min duration (minutes)">
        <input {...num('durationMinMinutes')} />
      </Field>
      <Field label="Max duration (minutes)">
        <input {...num('durationMaxMinutes')} />
      </Field>
      <Field label="Included (one per line)">
        <textarea value={v.inclusions} onChange={(e) => up('inclusions', e.target.value)} rows={4} className={cx(inputCls, 'h-auto py-2')} />
      </Field>
      <Field label="Not included (one per line)">
        <textarea value={v.exclusions} onChange={(e) => up('exclusions', e.target.value)} rows={4} className={cx(inputCls, 'h-auto py-2')} />
      </Field>
      <Field label="Warranty (days)">
        <input {...num('warrantyDays')} />
      </Field>
      <Field label="Sort order">
        <input {...num('sortOrder')} />
      </Field>
      <CommissionField value={v.commission} onChange={(c) => up('commission', c)} inherited="the category / global rate" />
      <div className="flex flex-col justify-end gap-3">
        <label className="flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
          Visible to customers <Toggle checked={v.isActive} onChange={(x) => up('isActive', x)} label="Active" />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
          Show in “Popular” <Toggle checked={v.isPopular} onChange={(x) => up('isPopular', x)} label="Popular" />
        </label>
      </div>
      <div className="sm:col-span-2">
        <ImageField value={v.imageUrl} onChange={(x) => up('imageUrl', x)} />
      </div>
    </FormDialog>
  );
}

// ─── Categories ──────────────────────────────────────────────────────────

export function CategoriesPage() {
  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminModulesApi.categories });
  const [editing, setEditing] = useState<AdminCategoryDto | 'new' | null>(null);
  const nameOf = (id: string | null) => categories.data?.find((c) => c.id === id)?.name;
  const columns: Column<AdminCategoryDto>[] = [
    {
      header: 'Category',
      cell: (c) => (
        <span className="flex items-center gap-3">
          <ServiceArt imageUrl={c.imageUrl} iconKey={c.iconKey} alt="" className="size-10 shrink-0 rounded-lg" artClassName="w-3/5" />
          <span>
            <span className="block font-medium text-slate-900">{c.name}</span>
            <span className="text-xs text-slate-500">{c.parentId ? `in ${nameOf(c.parentId)}` : c.tagline}</span>
          </span>
        </span>
      ),
    },
    { header: 'Professional', cell: (c) => c.professionalTitle },
    { header: 'Services', className: 'text-right', cell: (c) => c.services },
    { header: 'Commission', cell: (c) => commissionLabel(c.commission) },
    { header: 'Order', className: 'text-right', cell: (c) => c.sortOrder },
    { header: 'Status', cell: (c) => <Pill tone={c.isActive ? 'green' : 'gray'}>{c.isActive ? 'Active' : 'Hidden'}</Pill> },
  ];
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageTitle
        icon={Shapes}
        title="Categories"
        subtitle="Categories and subcategories shown in the customer app."
        actions={
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            New category
          </Button>
        }
      />
      <Card className="mt-6">
        <DataTable columns={columns} rows={categories.data} rowKey={(c) => c.id} onRowClick={(c) => setEditing(c)} loading={categories.isPending} error={categories.error} onRetry={() => void categories.refetch()} minWidth={760} />
      </Card>
      {editing && categories.data && <CategoryForm key={editing === 'new' ? 'new' : editing.id} category={editing === 'new' ? null : editing} all={categories.data} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CategoryForm({ category, all, onClose }: { category: AdminCategoryDto | null; all: AdminCategoryDto[]; onClose(): void }) {
  const [v, setV] = useState<CategoryInput>({
    name: category?.name ?? '',
    parentId: category?.parentId ?? null,
    tagline: category?.tagline ?? '',
    professionalTitle: category?.professionalTitle ?? '',
    iconKey: category?.iconKey ?? 'more',
    imageUrl: category?.imageUrl ?? null,
    description: category?.description ?? '',
    sortOrder: category?.sortOrder ?? all.length,
    isActive: category?.isActive ?? true,
    commission: category?.commission ?? null,
  });
  const up = <K extends keyof CategoryInput>(k: K, val: CategoryInput[K]) => setV((s) => ({ ...s, [k]: val }));
  const save = useSave((body: CategoryInput) => adminModulesApi.saveCategory(category?.id ?? null, body), ['categories', 'services'], onClose, category ? 'Category updated' : 'Category created');
  return (
    <FormDialog
      open
      title={category ? `Edit ${category.name}` : 'New category'}
      onClose={onClose}
      onSubmit={() => save.mutate({ ...v, name: v.name.trim(), tagline: v.tagline.trim(), professionalTitle: v.professionalTitle.trim(), description: v.description?.trim() || null })}
      pending={save.isPending}
      error={save.error?.message}
    >
      <Field label="Name">
        <input value={v.name} onChange={(e) => up('name', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Parent (for subcategories)">
        <select value={v.parentId ?? ''} onChange={(e) => up('parentId', e.target.value || null)} className={inputCls}>
          <option value="">— Top level —</option>
          {all
            .filter((c) => c.id !== category?.id && !c.parentId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Tagline">
        <input value={v.tagline} onChange={(e) => up('tagline', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Professional title" hint="e.g. “AC Technician” — shown on technician profiles.">
        <input value={v.professionalTitle} onChange={(e) => up('professionalTitle', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Illustration">
        <select value={v.iconKey} onChange={(e) => up('iconKey', e.target.value)} className={inputCls}>
          {ICON_KEYS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </Field>
      <Field label="Sort order">
        <input value={v.sortOrder} inputMode="numeric" onChange={(e) => up('sortOrder', Number(e.target.value.replace(/\D/g, '')) || 0)} className={inputCls} />
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <textarea value={v.description ?? ''} onChange={(e) => up('description', e.target.value)} rows={2} className={cx(inputCls, 'h-auto py-2')} />
      </Field>
      <CommissionField value={v.commission ?? null} onChange={(c) => up('commission', c)} inherited="the global rate" />
      <label className="flex items-center justify-between gap-3 self-end text-sm font-medium text-slate-700">
        Visible to customers <Toggle checked={v.isActive} onChange={(x) => up('isActive', x)} label="Active" />
      </label>
      <div className="sm:col-span-2">
        <ImageField value={v.imageUrl ?? null} onChange={(x) => up('imageUrl', x)} />
      </div>
    </FormDialog>
  );
}

// ─── Offers & coupons ────────────────────────────────────────────────────

export function OffersPage() {
  const offers = useQuery({ queryKey: ['admin', 'offers'], queryFn: adminModulesApi.offers });
  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminModulesApi.categories });
  const [editing, setEditing] = useState<AdminCouponDto | 'new' | null>(null);
  const [now] = useState(() => new Date().toISOString());
  const columns: Column<AdminCouponDto>[] = [
    {
      header: 'Code',
      cell: (c) => (
        <span>
          <span className="block font-mono font-semibold text-slate-900">{c.code}</span>
          <span className="text-xs text-slate-500">{c.title}</span>
        </span>
      ),
    },
    { header: 'Discount', className: 'whitespace-nowrap', cell: (c) => (c.discountType === 'PERCENTAGE' ? `${c.discountValue}%${c.maxDiscountAmount ? ` up to ${formatINR(c.maxDiscountAmount)}` : ''}` : formatINR(c.discountValue)) },
    { header: 'Min order', className: 'text-right whitespace-nowrap', cell: (c) => formatINR(c.minOrderAmount) },
    { header: 'Scope', cell: (c) => (c.categoryId ? (categories.data?.find((x) => x.id === c.categoryId)?.name ?? 'Category') : c.isFirstBookingOnly ? 'First booking' : 'All services') },
    { header: 'Used', className: 'text-right whitespace-nowrap', cell: (c) => `${c.usedCount}${c.usageLimit ? ` / ${c.usageLimit}` : ''}` },
    { header: 'Valid', className: 'whitespace-nowrap', cell: (c) => `${formatDate(c.startsAt)} – ${formatDate(c.endsAt)}` },
    {
      header: 'Status',
      cell: (c) =>
        !c.isActive ? <Pill tone="gray">Paused</Pill> : c.endsAt < now ? <Pill tone="red">Expired</Pill> : c.startsAt > now ? <Pill tone="amber">Scheduled</Pill> : <Pill tone="green">Live</Pill>,
    },
  ];
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageTitle
        icon={BadgePercent}
        title="Offers & Coupons"
        subtitle="Coupons are validated on the server at booking time — limits, dates, minimum order and first-booking rules."
        actions={
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            New coupon
          </Button>
        }
      />
      <Card className="mt-6">
        <DataTable columns={columns} rows={offers.data} rowKey={(c) => c.id} onRowClick={(c) => setEditing(c)} loading={offers.isPending} error={offers.error} onRetry={() => void offers.refetch()} empty="No coupons yet" />
      </Card>
      {editing && <CouponForm key={editing === 'new' ? 'new' : editing.id} coupon={editing === 'new' ? null : editing} categories={categories.data ?? []} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CouponForm({ coupon, categories, onClose }: { coupon: AdminCouponDto | null; categories: AdminCategoryDto[]; onClose(): void }) {
  const [v, setV] = useState(() => ({
    code: coupon?.code ?? '',
    title: coupon?.title ?? '',
    description: coupon?.description ?? '',
    terms: coupon?.terms.join('\n') ?? '',
    highlights: coupon?.highlights.join('\n') ?? '',
    discountType: coupon?.discountType ?? ('PERCENTAGE' as 'PERCENTAGE' | 'FIXED'),
    discountValue: coupon ? (coupon.discountType === 'PERCENTAGE' ? String(coupon.discountValue) : toRupees(coupon.discountValue)) : '10',
    minOrderAmount: coupon ? toRupees(coupon.minOrderAmount) : '0',
    maxDiscountAmount: coupon?.maxDiscountAmount ? toRupees(coupon.maxDiscountAmount) : '',
    startsAt: isoDay(coupon ? new Date(coupon.startsAt) : new Date()),
    endsAt: isoDay(coupon ? new Date(coupon.endsAt) : new Date(Date.now() + 30 * 86_400_000)),
    usageLimit: coupon?.usageLimit ? String(coupon.usageLimit) : '',
    perCustomerLimit: String(coupon?.perCustomerLimit ?? 1),
    isFirstBookingOnly: coupon?.isFirstBookingOnly ?? false,
    categoryId: coupon?.categoryId ?? '',
    isActive: coupon?.isActive ?? true,
  }));
  const up = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));
  const save = useSave((body: CouponInput) => adminModulesApi.saveOffer(coupon?.id ?? null, body), ['offers'], onClose, coupon ? 'Coupon updated' : 'Coupon created');
  const digits = (k: 'discountValue' | 'minOrderAmount' | 'maxDiscountAmount' | 'usageLimit' | 'perCustomerLimit') => ({
    value: v[k],
    inputMode: 'decimal' as const,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => up(k, e.target.value.replace(/[^\d.]/g, '')),
    className: inputCls,
  });
  const submit = () =>
    save.mutate({
      code: v.code.trim().toUpperCase(),
      title: v.title.trim(),
      description: v.description.trim() || null,
      terms: lines(v.terms),
      highlights: lines(v.highlights),
      discountType: v.discountType,
      discountValue: v.discountType === 'PERCENTAGE' ? Number(v.discountValue) || 0 : rupeesToPaise(Number(v.discountValue) || 0),
      minOrderAmount: rupeesToPaise(Number(v.minOrderAmount) || 0),
      maxDiscountAmount: v.maxDiscountAmount ? rupeesToPaise(Number(v.maxDiscountAmount)) : null,
      startsAt: `${v.startsAt}T00:00:00+05:30`,
      endsAt: `${v.endsAt}T23:59:59+05:30`,
      usageLimit: v.usageLimit ? Number(v.usageLimit) : null,
      perCustomerLimit: Number(v.perCustomerLimit) || 1,
      isFirstBookingOnly: v.isFirstBookingOnly,
      categoryId: v.categoryId || null,
      serviceId: coupon?.serviceId ?? null,
      locationId: coupon?.locationId ?? null,
      isActive: v.isActive,
    });

  return (
    <FormDialog open title={coupon ? `Edit ${coupon.code}` : 'New coupon'} onClose={onClose} onSubmit={submit} pending={save.isPending} error={save.error?.message}>
      <Field label="Code">
        <input value={v.code} onChange={(e) => up('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))} className={cx(inputCls, 'font-mono')} />
      </Field>
      <Field label="Title">
        <input value={v.title} onChange={(e) => up('title', e.target.value)} className={inputCls} placeholder="20% off AC service" />
      </Field>
      <Field label="Discount type">
        <select value={v.discountType} onChange={(e) => up('discountType', e.target.value as 'PERCENTAGE' | 'FIXED')} className={inputCls}>
          <option value="PERCENTAGE">Percentage</option>
          <option value="FIXED">Flat ₹</option>
        </select>
      </Field>
      <Field label={v.discountType === 'PERCENTAGE' ? 'Discount (%)' : 'Discount (₹)'}>
        <input {...digits('discountValue')} />
      </Field>
      <Field label="Minimum order (₹)">
        <input {...digits('minOrderAmount')} />
      </Field>
      <Field label="Maximum discount (₹, optional)">
        <input {...digits('maxDiscountAmount')} />
      </Field>
      <Field label="Starts">
        <input type="date" value={v.startsAt} onChange={(e) => up('startsAt', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Ends">
        <input type="date" value={v.endsAt} onChange={(e) => up('endsAt', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Total uses (optional)">
        <input {...digits('usageLimit')} />
      </Field>
      <Field label="Uses per customer">
        <input {...digits('perCustomerLimit')} />
      </Field>
      <Field label="Only for category">
        <select value={v.categoryId} onChange={(e) => up('categoryId', e.target.value)} className={inputCls}>
          <option value="">All services</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-col justify-end gap-3">
        <label className="flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
          First booking only <Toggle checked={v.isFirstBookingOnly} onChange={(x) => up('isFirstBookingOnly', x)} label="First booking only" />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
          Active <Toggle checked={v.isActive} onChange={(x) => up('isActive', x)} label="Active" />
        </label>
      </div>
      <Field label="Description" className="sm:col-span-2">
        <input value={v.description} onChange={(e) => up('description', e.target.value)} className={inputCls} />
      </Field>
      <Field label="Highlights (one per line)">
        <textarea value={v.highlights} onChange={(e) => up('highlights', e.target.value)} rows={3} className={cx(inputCls, 'h-auto py-2')} />
      </Field>
      <Field label="Terms (one per line)">
        <textarea value={v.terms} onChange={(e) => up('terms', e.target.value)} rows={3} className={cx(inputCls, 'h-auto py-2')} />
      </Field>
    </FormDialog>
  );
}
