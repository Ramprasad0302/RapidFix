import type { ReactElement } from 'react';

/**
 * Service illustrations in the same soft-3D style as the category art
 * (gradients, highlights, gentle shadows). 64×64 viewBox. Keyed by service slug
 * in SERVICE_ART at the bottom; services without one use their category art.
 */
type P = { id: string };

const lg = (id: string, from: string, to: string, horizontal = false) => (
  <linearGradient id={id} x1="0" y1="0" x2={horizontal ? '1' : '0'} y2="1">
    <stop offset="0" stopColor={from} />
    <stop offset="1" stopColor={to} />
  </linearGradient>
);
const C = {
  blue: ['#60B5FF', '#2563EB'],
  white: ['#FFFFFF', '#DCE4EE'],
  steel: ['#F1F5F9', '#94A3B8'],
  amber: ['#FFE066', '#FF9500'],
  wood: ['#F6C48A', '#C97B3A'],
  red: ['#FCA5A5', '#DC2626'],
  green: ['#86EFAC', '#16A34A'],
  teal: ['#67E8F9', '#0891B2'],
  dark: ['#64748B', '#1E293B'],
  pink: ['#F9A8D4', '#DB2777'],
  violet: ['#C4B5FD', '#7C3AED'],
  cream: ['#FFF7ED', '#FED7AA'],
} as const;
const Shadow = ({ cx = 32, cy = 59, rx = 20 }: { cx?: number; cy?: number; rx?: number }) => <ellipse cx={cx} cy={cy} rx={rx} ry="2.6" fill="#0F172A" opacity=".08" />;
const Shine = ({ d }: { d: string }) => <path d={d} fill="#fff" opacity=".35" />;

// ── AC & cooling ──
function AcRepair({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}b`, ...C.white)}
        {lg(`${id}w`, ...C.steel)}
      </defs>
      <rect x="4" y="12" width="48" height="22" rx="6" fill={`url(#${id}b)`} stroke="#C7D2E0" />
      <rect x="4" y="28" width="48" height="6" rx="3" fill="#CFD8E4" />
      <path d="M9 31h38" stroke="#8FA0B7" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="34" y="16" width="13" height="5" rx="2" fill="#3B82F6" />
      <path d="M50 30l9 9a4 4 0 0 1-6 6l-9-9a8 8 0 0 1-9-11l5 5 4-1 1-4-5-5a8 8 0 0 1 10 10z" fill={`url(#${id}w)`} stroke="#64748B" strokeWidth="1" />
      <g stroke="#7CC4FF" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M14 39c2 2.5 2 5 0 7.5" />
        <path d="M26 39c2 2.5 2 5 0 7.5" />
      </g>
    </>
  );
}
function AcInstall({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}b`, ...C.white)}
        {lg(`${id}g`, ...C.green)}
      </defs>
      <rect x="6" y="8" width="52" height="24" rx="7" fill={`url(#${id}b)`} stroke="#C7D2E0" />
      <rect x="6" y="26" width="52" height="6" rx="3" fill="#CFD8E4" />
      <rect x="40" y="12" width="13" height="5" rx="2" fill="#3B82F6" />
      <path d="M14 32v8M50 32v8" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
      <circle cx="44" cy="48" r="10" fill={`url(#${id}g)`} />
      <path d="m39 48 3.5 3.5L49 45" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}
function GasCylinder({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}c`, '#7DD3FC', '#0369A1', true)}
        {lg(`${id}v`, ...C.steel)}
      </defs>
      <Shadow rx={14} />
      <rect x="22" y="4" width="20" height="8" rx="2" fill={`url(#${id}v)`} stroke="#64748B" />
      <rect x="29" y="1" width="6" height="5" rx="1.5" fill="#475569" />
      <path d="M18 18a14 6 0 0 1 28 0v34a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6z" fill={`url(#${id}c)`} />
      <Shine d="M22 20h4v32h-4z" />
      <rect x="18" y="30" width="28" height="10" fill="#fff" opacity=".9" />
      <text x="32" y="38" textAnchor="middle" fontSize="7" fontWeight="800" fill="#0369A1" fontFamily="Inter,Arial">GAS</text>
    </>
  );
}
function AcRemove({ id }: P) {
  return (
    <>
      <defs>{lg(`${id}b`, ...C.white)}</defs>
      <rect x="4" y="10" width="46" height="22" rx="6" fill={`url(#${id}b)`} stroke="#C7D2E0" />
      <rect x="4" y="26" width="46" height="6" rx="3" fill="#CFD8E4" />
      <rect x="33" y="14" width="12" height="5" rx="2" fill="#3B82F6" />
      <path d="M20 44h30m0 0-8-7m8 7-8 7" stroke="#F97316" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}
function Cooler({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}b`, '#E0F2FE', '#7DD3FC')}
        {lg(`${id}g`, ...C.white)}
      </defs>
      <Shadow rx={16} />
      <rect x="14" y="6" width="36" height="50" rx="7" fill={`url(#${id}b)`} stroke="#38BDF8" />
      <rect x="19" y="11" width="26" height="26" rx="4" fill={`url(#${id}g)`} />
      {[15, 20, 25, 30].map((y) => (
        <path key={y} d={`M22 ${y}h20`} stroke="#93C5FD" strokeWidth="1.8" strokeLinecap="round" />
      ))}
      <circle cx="26" cy="46" r="3" fill="#0284C7" />
      <circle cx="38" cy="46" r="3" fill="#0EA5E9" />
    </>
  );
}

// ── Electrical ──
function FanArt({ id }: P) {
  const blade = 'M32 30C38 25 50 22 59 25C56 32 42 35 32 30Z';
  return (
    <>
      <defs>
        {lg(`${id}b`, '#BFDBFE', '#3B82F6')}
        {lg(`${id}h`, ...C.amber)}
        {lg(`${id}r`, ...C.steel)}
      </defs>
      <rect x="30" y="2" width="4" height="22" rx="2" fill={`url(#${id}r)`} />
      <rect x="25" y="2" width="14" height="4" rx="2" fill="#94A3B8" />
      <g stroke="#1D4ED8" strokeWidth=".8" strokeLinejoin="round">
        {[0, 120, 240].map((a) => (
          <path key={a} d={blade} fill={`url(#${id}b)`} transform={`rotate(${a} 32 30)`} />
        ))}
      </g>
      <circle cx="32" cy="30" r="7.5" fill={`url(#${id}h)`} stroke="#D97706" strokeWidth=".8" />
      <circle cx="30" cy="28" r="2.2" fill="#fff" opacity=".7" />
      <Shadow cy={60} rx={14} />
    </>
  );
}
function Bulb({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}g`, '#FFF3B0', '#FFB800')}
        {lg(`${id}s`, ...C.steel)}
      </defs>
      <circle cx="32" cy="24" r="22" fill="#FDE68A" opacity=".35" />
      <path d="M32 6a16 16 0 0 0-9 29c2 1.5 3 4 3 6v3h12v-3c0-2 1-4.5 3-6A16 16 0 0 0 32 6z" fill={`url(#${id}g)`} />
      <Shine d="M24 14a10 10 0 0 1 6-5c-1 4-4 7-7 9z" />
      <path d="M28 34c0-5 2-9 4-11 2 2 4 6 4 11" stroke="#F59E0B" strokeWidth="1.5" fill="none" />
      <rect x="25" y="44" width="14" height="10" rx="2.5" fill={`url(#${id}s)`} stroke="#64748B" />
      <path d="M25 48h14M25 51h14" stroke="#64748B" strokeWidth="1" />
      <rect x="29" y="54" width="6" height="4" rx="1.5" fill="#475569" />
    </>
  );
}
function Battery({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}b`, ...C.dark)}
        {lg(`${id}g`, ...C.green)}
      </defs>
      <Shadow rx={22} />
      <rect x="6" y="16" width="52" height="36" rx="6" fill={`url(#${id}b)`} />
      <rect x="14" y="10" width="8" height="7" rx="1.5" fill="#EF4444" />
      <rect x="42" y="10" width="8" height="7" rx="1.5" fill="#94A3B8" />
      <rect x="12" y="24" width="40" height="20" rx="4" fill="#0F172A" opacity=".5" />
      <rect x="15" y="27" width="26" height="14" rx="2" fill={`url(#${id}g)`} />
      <path d="M35 24l-7 10h5l-3 9 9-12h-5l3-7z" fill="#FDE047" />
    </>
  );
}
function Wiring({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}p`, ...C.white)}
        {lg(`${id}c`, ...C.amber)}
      </defs>
      <path d="M40 36c8 0 14 6 14 14v8" stroke={`url(#${id}c)`} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M8 8v10c0 10 8 16 18 16h6" stroke="#EF4444" strokeWidth="5" fill="none" strokeLinecap="round" />
      <rect x="26" y="24" width="18" height="22" rx="5" fill={`url(#${id}p)`} stroke="#94A3B8" />
      <rect x="44" y="28" width="9" height="3" rx="1.5" fill="#64748B" />
      <rect x="44" y="38" width="9" height="3" rx="1.5" fill="#64748B" />
    </>
  );
}

// ── Plumbing ──
function PlumberTools({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}p`, ...C.steel)}
        {lg(`${id}r`, ...C.red, true)}
      </defs>
      <path d="M6 22h22a8 8 0 0 1 8 8v28" stroke={`url(#${id}p)`} strokeWidth="9" fill="none" />
      <path d="M6 22h22a8 8 0 0 1 8 8v28" stroke="#64748B" strokeWidth="9" fill="none" opacity=".15" />
      <rect x="2" y="15" width="7" height="14" rx="2" fill="#94A3B8" />
      <path d="M44 6l12 12-4 4-3-3-14 14-5-5 14-14-3-3z" fill={`url(#${id}r)`} />
      <path d="M28 33l-6 6" stroke="#991B1B" strokeWidth="5" strokeLinecap="round" />
    </>
  );
}
function WaterTank({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}t`, '#4B5563', '#111827', true)}
        {lg(`${id}w`, '#7DD3FC', '#0284C7')}
      </defs>
      <Shadow rx={22} />
      <path d="M12 16c0-4 9-7 20-7s20 3 20 7v34c0 4-9 7-20 7s-20-3-20-7z" fill={`url(#${id}t)`} />
      <ellipse cx="32" cy="16" rx="20" ry="7" fill="#374151" />
      <ellipse cx="32" cy="15" rx="7" ry="2.5" fill="#1F2937" />
      <path d="M12 28c0 4 9 7 20 7s20-3 20-7M12 40c0 4 9 7 20 7s20-3 20-7" stroke="#6B7280" strokeWidth="1.5" fill="none" />
      <path d="M50 8c-3 5-3 7 0 9 3-2 3-4 0-9z" fill={`url(#${id}w)`} />
    </>
  );
}
function ToiletArt({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}b`, ...C.white)}
        {lg(`${id}t`, '#F8FAFC', '#CBD5E1', true)}
      </defs>
      <Shadow rx={18} />
      <rect x="10" y="6" width="22" height="26" rx="4" fill={`url(#${id}t)`} stroke="#CBD5E1" />
      <rect x="15" y="11" width="10" height="3" rx="1.5" fill="#60A5FA" />
      <path d="M8 32h46c0 10-8 16-18 16h-6l2 8H18l2-9C13 44 8 39 8 32z" fill={`url(#${id}b)`} stroke="#CBD5E1" />
      <ellipse cx="31" cy="32" rx="23" ry="4" fill="#E2E8F0" stroke="#CBD5E1" />
    </>
  );
}
function Drain({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}s`, ...C.white)}
        {lg(`${id}w`, '#7DD3FC', '#0284C7')}
      </defs>
      <path d="M6 20h52l-6 22a10 10 0 0 1-10 7H22a10 10 0 0 1-10-7z" fill={`url(#${id}s)`} stroke="#CBD5E1" />
      <ellipse cx="32" cy="20" rx="26" ry="5" fill="#E2E8F0" stroke="#CBD5E1" />
      <path d="M22 30c4-4 16-4 20 0-4 4-16 4-20 0z" fill={`url(#${id}w)`} />
      <path d="M28 30c2-2 6-2 8 0" stroke="#fff" strokeWidth="1.5" fill="none" />
      <path d="M32 49v9" stroke="#94A3B8" strokeWidth="5" strokeLinecap="round" />
    </>
  );
}
function Pump({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}m`, '#60A5FA', '#1D4ED8', true)}
        {lg(`${id}s`, ...C.steel)}
      </defs>
      <Shadow rx={24} />
      <rect x="6" y="20" width="30" height="26" rx="8" fill={`url(#${id}m)`} />
      {[26, 31, 36, 41].map((y) => (
        <path key={y} d={`M10 ${y}h22`} stroke="#93C5FD" strokeWidth="1.5" opacity=".7" />
      ))}
      <circle cx="44" cy="33" r="11" fill={`url(#${id}s)`} stroke="#64748B" />
      <circle cx="44" cy="33" r="4" fill="#475569" />
      <path d="M44 22V10h12" stroke="#94A3B8" strokeWidth="5" fill="none" strokeLinecap="round" />
      <rect x="8" y="46" width="44" height="6" rx="2" fill="#475569" />
    </>
  );
}

// ── Carpentry ──
function Door({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}d`, ...C.wood, true)}
        {lg(`${id}k`, ...C.amber)}
      </defs>
      <Shadow rx={18} />
      <rect x="14" y="4" width="36" height="54" rx="3" fill="#8B5A2B" />
      <rect x="17" y="7" width="30" height="51" rx="2" fill={`url(#${id}d)`} />
      <rect x="21" y="11" width="22" height="18" rx="2" fill="none" stroke="#A86B32" strokeWidth="1.5" />
      <rect x="21" y="34" width="22" height="18" rx="2" fill="none" stroke="#A86B32" strokeWidth="1.5" />
      <circle cx="41" cy="32" r="3" fill={`url(#${id}k)`} />
      <rect x="39.5" y="34" width="3" height="5" rx="1" fill="#B45309" />
    </>
  );
}
function Toolbox({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}b`, ...C.red)}
        {lg(`${id}h`, ...C.wood, true)}
      </defs>
      <Shadow rx={24} />
      <path d="M22 18v-6h20v6" stroke="#475569" strokeWidth="4" fill="none" strokeLinejoin="round" />
      <rect x="6" y="18" width="52" height="36" rx="5" fill={`url(#${id}b)`} />
      <rect x="6" y="30" width="52" height="5" fill="#991B1B" opacity=".5" />
      <rect x="27" y="27" width="10" height="10" rx="2" fill="#FDE68A" />
      <path d="M44 4l14 14-3 3-5-5-12 12-3-3 12-12-5-5z" fill={`url(#${id}h)`} />
    </>
  );
}
function Cabinet({ id }: P) {
  return (
    <>
      <defs>{lg(`${id}d`, ...C.wood, true)}</defs>
      <Shadow rx={24} />
      <rect x="6" y="8" width="52" height="48" rx="4" fill="#A86B32" />
      <rect x="9" y="11" width="22" height="42" rx="2" fill={`url(#${id}d)`} />
      <rect x="33" y="11" width="22" height="20" rx="2" fill={`url(#${id}d)`} />
      <rect x="33" y="33" width="22" height="20" rx="2" fill={`url(#${id}d)`} />
      <rect x="26" y="26" width="2.5" height="10" rx="1" fill="#475569" />
      <rect x="38" y="20" width="10" height="2.5" rx="1" fill="#475569" />
      <rect x="38" y="42" width="10" height="2.5" rx="1" fill="#475569" />
    </>
  );
}

// ── Painting ──
function HousePaint({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}w`, '#FDE68A', '#F59E0B')}
        {lg(`${id}r`, ...C.red)}
        {lg(`${id}p`, ...C.violet)}
      </defs>
      <Shadow rx={24} />
      <path d="M6 30 32 10l26 20" fill={`url(#${id}r)`} />
      <path d="M11 28h42v28H11z" fill={`url(#${id}w)`} />
      <rect x="27" y="40" width="10" height="16" rx="1.5" fill="#92400E" />
      <rect x="15" y="34" width="8" height="8" rx="1" fill="#BFDBFE" />
      <rect x="41" y="34" width="8" height="8" rx="1" fill="#BFDBFE" />
      <rect x="40" y="2" width="18" height="9" rx="3" fill={`url(#${id}p)`} />
      <path d="M49 11v6h-6v7" stroke="#475569" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  );
}
function Waterproof({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}u`, '#60A5FA', '#1D4ED8')}
        {lg(`${id}d`, '#7DD3FC', '#0284C7')}
      </defs>
      <path d="M8 34a24 24 0 0 1 48 0c-4-3-8-3-12 0-4-3-8-3-12 0-4-3-8-3-12 0-4-3-8-3-12 0z" fill={`url(#${id}u)`} />
      <path d="M32 10v40a5 5 0 0 1-10 0" stroke="#475569" strokeWidth="3" fill="none" strokeLinecap="round" />
      {[
        [12, 6],
        [24, 2],
        [48, 4],
      ].map(([x, y]) => (
        <path key={x} d={`M${x} ${y}c-3 5-3 7 0 8 3-1 3-3 0-8z`} fill={`url(#${id}d)`} />
      ))}
    </>
  );
}

// ── Appliances ──
function Fridge({ id }: P) {
  return (
    <>
      <defs>{lg(`${id}b`, '#F8FAFC', '#CBD5E1', true)}</defs>
      <Shadow rx={16} />
      <rect x="16" y="3" width="32" height="54" rx="5" fill={`url(#${id}b)`} stroke="#94A3B8" />
      <path d="M16 22h32" stroke="#94A3B8" strokeWidth="1.5" />
      <rect x="20" y="10" width="2.5" height="8" rx="1" fill="#64748B" />
      <rect x="20" y="27" width="2.5" height="12" rx="1" fill="#64748B" />
      <Shine d="M40 6h4v48h-4z" />
      <circle cx="40" cy="14" r="2" fill="#38BDF8" />
    </>
  );
}
function Television({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}f`, ...C.dark)}
        {lg(`${id}s`, '#38BDF8', '#6366F1', true)}
      </defs>
      <Shadow rx={18} />
      <rect x="4" y="8" width="56" height="36" rx="4" fill={`url(#${id}f)`} />
      <rect x="8" y="12" width="48" height="28" rx="2" fill={`url(#${id}s)`} />
      <Shine d="M8 12h18L14 40H8z" />
      <path d="M26 44l-4 10h20l-4-10" fill="#334155" />
    </>
  );
}
function Geyser({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}b`, '#FFFFFF', '#E2E8F0', true)}
        {lg(`${id}h`, '#FCA5A5', '#EF4444')}
      </defs>
      <rect x="16" y="4" width="32" height="44" rx="14" fill={`url(#${id}b)`} stroke="#CBD5E1" />
      <circle cx="32" cy="22" r="7" fill="#F1F5F9" stroke="#94A3B8" />
      <path d="M32 18v4l3 2" stroke="#EF4444" strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="22" y="36" width="20" height="3" rx="1.5" fill={`url(#${id}h)`} />
      <path d="M26 48v8M38 48v8" stroke="#94A3B8" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M26 56h-4M38 56h4" stroke="#EF4444" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}
function MicrowaveArt({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}b`, ...C.steel)}
        {lg(`${id}w`, '#1E293B', '#475569', true)}
      </defs>
      <Shadow rx={24} />
      <rect x="4" y="14" width="56" height="38" rx="5" fill={`url(#${id}b)`} stroke="#64748B" />
      <rect x="9" y="19" width="34" height="28" rx="3" fill={`url(#${id}w)`} />
      <Shine d="M11 21h10L13 45h-2z" />
      <rect x="47" y="20" width="9" height="6" rx="1.5" fill="#22C55E" />
      <circle cx="51.5" cy="34" r="3" fill="#475569" />
      <circle cx="51.5" cy="43" r="3" fill="#475569" />
    </>
  );
}
function Chimney({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}b`, ...C.steel)}
        {lg(`${id}f`, '#FDBA74', '#EA580C')}
      </defs>
      <rect x="24" y="2" width="16" height="16" fill={`url(#${id}b)`} stroke="#94A3B8" />
      <path d="M8 34l16-16h16l16 16z" fill={`url(#${id}b)`} stroke="#94A3B8" />
      <rect x="6" y="34" width="52" height="5" rx="2" fill="#475569" />
      <path d="M22 58c-3-5 2-7 1-12 4 3 5 6 4 9 2-2 2-4 1-7 4 4 5 8 2 10z" fill={`url(#${id}f)`} />
      <path d="M40 58c-3-5 2-7 1-12 4 3 5 6 4 9 2-2 2-4 1-7 4 4 5 8 2 10z" fill={`url(#${id}f)`} />
    </>
  );
}

// ── Cleaning ──
function Shower({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}h`, ...C.steel)}
        {lg(`${id}w`, '#BAE6FD', '#38BDF8')}
      </defs>
      <path d="M10 4v12h18" stroke="#94A3B8" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M18 18h22a6 6 0 0 1 6 6H12a6 6 0 0 1 6-6z" fill={`url(#${id}h)`} stroke="#64748B" />
      {[16, 22, 28, 34, 40].map((x, i) => (
        <path key={x} d={`M${x} 30l${-2 + (i % 2)} 10`} stroke={`url(#${id}w)`} strokeWidth="2.5" strokeLinecap="round" />
      ))}
      <path d="M8 50h48" stroke="#E2E8F0" strokeWidth="6" strokeLinecap="round" />
      <path d="M50 38l2-4 2 4 4 2-4 2-2 4-2-4-4-2z" fill="#FDE047" />
    </>
  );
}
function SofaArt({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}s`, ...C.violet)}
        {lg(`${id}c`, '#DDD6FE', '#A78BFA')}
      </defs>
      <Shadow rx={26} />
      <rect x="12" y="14" width="40" height="22" rx="7" fill={`url(#${id}s)`} />
      <rect x="4" y="26" width="14" height="22" rx="6" fill={`url(#${id}s)`} />
      <rect x="46" y="26" width="14" height="22" rx="6" fill={`url(#${id}s)`} />
      <rect x="14" y="32" width="36" height="14" rx="5" fill={`url(#${id}c)`} />
      <path d="M10 48v6M54 48v6" stroke="#5B21B6" strokeWidth="3" strokeLinecap="round" />
      <path d="M50 6l1.5 3 3 1.5-3 1.5L50 15l-1.5-3-3-1.5 3-1.5z" fill="#FDE047" />
    </>
  );
}
function KitchenClean({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}p`, ...C.dark)}
        {lg(`${id}h`, ...C.wood, true)}
      </defs>
      <Shadow rx={24} />
      <ellipse cx="28" cy="36" rx="22" ry="14" fill={`url(#${id}p)`} />
      <ellipse cx="28" cy="33" rx="18" ry="9" fill="#94A3B8" />
      <rect x="44" y="30" width="18" height="5" rx="2.5" fill={`url(#${id}h)`} transform="rotate(-15 44 30)" />
      {(
        [
          [14, 12],
          [30, 6],
          [46, 14],
        ] as const
      ).map(([x, y]) => (
        <path key={x} d={`M${x} ${y}l1.6 3.4 3.4 1.6-3.4 1.6L${x} ${y + 10}l-1.6-3.4-3.4-1.6 3.4-1.6z`} fill="#FDE047" />
      ))}
    </>
  );
}
function HomeSparkle({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}w`, '#DBEAFE', '#93C5FD')}
        {lg(`${id}r`, ...C.blue)}
      </defs>
      <Shadow rx={22} />
      <path d="M8 30 32 12l24 18" fill={`url(#${id}r)`} />
      <path d="M13 28h38v28H13z" fill={`url(#${id}w)`} />
      <rect x="27" y="40" width="10" height="16" rx="1.5" fill="#2563EB" />
      {[
        [48, 4],
        [10, 10],
      ].map(([x, y]) => (
        <path key={x} d={`M${x} ${y}l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z`} fill="#FDE047" />
      ))}
    </>
  );
}

// ── CCTV / RO ──
function CctvRepair({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}c`, '#FFFFFF', '#CBD5E1')}
        {lg(`${id}w`, ...C.steel)}
      </defs>
      <rect x="4" y="6" width="38" height="18" rx="5" fill={`url(#${id}c)`} stroke="#94A3B8" transform="rotate(12 4 6)" />
      <circle cx="36" cy="22" r="6" fill="#1E293B" />
      <circle cx="36" cy="22" r="2.5" fill="#38BDF8" />
      <path d="M14 26l-4 14H4" stroke="#94A3B8" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M52 34l8 8a4 4 0 0 1-6 6l-8-8a8 8 0 0 1-9-11l5 5 4-1 1-4-5-5a8 8 0 0 1 10 10z" fill={`url(#${id}w)`} stroke="#64748B" />
    </>
  );
}
function RoInstall({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}b`, '#FFFFFF', '#DBEAFE')}
        {lg(`${id}g`, ...C.green)}
      </defs>
      <Shadow rx={18} />
      <rect x="12" y="4" width="32" height="50" rx="8" fill={`url(#${id}b)`} stroke="#93C5FD" />
      <rect x="18" y="12" width="20" height="14" rx="3" fill="#BFDBFE" />
      <path d="M28 15c-3 5-3 7 0 8 3-1 3-3 0-8z" fill="#0284C7" />
      <path d="M44 38h6v8" stroke="#94A3B8" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="46" cy="16" r="9" fill={`url(#${id}g)`} />
      <path d="M46 11v10M41 16h10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}
function FilterArt({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}f`, '#E0F2FE', '#7DD3FC', true)}
        {lg(`${id}c`, ...C.blue)}
      </defs>
      <Shadow rx={14} />
      <rect x="20" y="4" width="24" height="8" rx="3" fill={`url(#${id}c)`} />
      <rect x="22" y="12" width="20" height="38" rx="3" fill={`url(#${id}f)`} stroke="#38BDF8" />
      {[18, 24, 30, 36, 42].map((y) => (
        <path key={y} d={`M24 ${y}h16`} stroke="#38BDF8" strokeWidth="1.5" opacity=".7" />
      ))}
      <rect x="20" y="50" width="24" height="7" rx="3" fill={`url(#${id}c)`} />
    </>
  );
}

// ── Pest control ──
function Termite({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}w`, ...C.wood, true)}
        {lg(`${id}b`, '#FDE68A', '#D97706')}
      </defs>
      <rect x="4" y="34" width="56" height="20" rx="3" fill={`url(#${id}w)`} />
      <path d="M12 40c6 4 10 0 16 4s12 0 18 4" stroke="#92400E" strokeWidth="2" fill="none" opacity=".6" />
      <ellipse cx="32" cy="20" rx="12" ry="7" fill={`url(#${id}b)`} />
      <circle cx="44" cy="18" r="5" fill="#B45309" />
      {[24, 30, 36].map((x) => (
        <path key={x} d={`M${x} 26l-3 6M${x} 14l-3-6`} stroke="#78350F" strokeWidth="1.8" strokeLinecap="round" />
      ))}
      <path d="M8 6l48 48" stroke="#EF4444" strokeWidth="4" strokeLinecap="round" opacity=".85" />
    </>
  );
}
function Mosquito({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}c`, ...C.green)}
        {lg(`${id}s`, '#E0F2FE', '#BAE6FD')}
      </defs>
      <rect x="6" y="20" width="18" height="32" rx="5" fill={`url(#${id}c)`} />
      <rect x="10" y="12" width="10" height="9" rx="2" fill="#166534" />
      <path d="M20 14h8" stroke="#166534" strokeWidth="3" strokeLinecap="round" />
      <path d="M28 14c8-4 16 0 24 8" stroke={`url(#${id}s)`} strokeWidth="10" strokeLinecap="round" fill="none" opacity=".9" />
      <ellipse cx="48" cy="42" rx="6" ry="3" fill="#334155" transform="rotate(-30 48 42)" />
      <path d="M44 40l-4-6M50 38l4-7M46 45l-6 4M52 44l6 3" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M40 30l18 20" stroke="#EF4444" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}
function BedBug({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}m`, '#F1F5F9', '#CBD5E1')}
        {lg(`${id}b`, '#FCA5A5', '#B91C1C')}
      </defs>
      <Shadow rx={26} />
      <rect x="4" y="30" width="56" height="16" rx="4" fill={`url(#${id}m)`} />
      <rect x="4" y="22" width="20" height="10" rx="4" fill="#E2E8F0" />
      <path d="M4 46v8M60 46v8" stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="42" cy="22" rx="9" ry="7" fill={`url(#${id}b)`} />
      <path d="M34 18l-4-3M34 26l-4 3M50 18l4-3M50 26l4 3" stroke="#7F1D1D" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M30 10l24 24" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
    </>
  );
}

// ── Computer ──
function Desktop({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}s`, '#60A5FA', '#4F46E5', true)}
        {lg(`${id}p`, ...C.steel)}
      </defs>
      <Shadow rx={26} />
      <rect x="4" y="6" width="38" height="28" rx="3" fill="#334155" />
      <rect x="7" y="9" width="32" height="22" rx="1.5" fill={`url(#${id}s)`} />
      <path d="M18 34l-3 8h16l-3-8" fill="#475569" />
      <rect x="38" y="30" width="22" height="14" rx="3" fill={`url(#${id}p)`} stroke="#64748B" />
      <rect x="42" y="24" width="14" height="7" rx="1" fill="#fff" stroke="#94A3B8" />
      <rect x="42" y="40" width="14" height="10" rx="1" fill="#fff" stroke="#94A3B8" />
    </>
  );
}
function Software({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}w`, '#E0E7FF', '#A5B4FC')}
        {lg(`${id}g`, ...C.blue)}
      </defs>
      <rect x="4" y="6" width="46" height="36" rx="5" fill={`url(#${id}w)`} stroke="#818CF8" />
      <rect x="4" y="6" width="46" height="8" rx="4" fill="#6366F1" />
      <circle cx="10" cy="10" r="1.6" fill="#fff" />
      <circle cx="15" cy="10" r="1.6" fill="#fff" />
      <path d="M12 22h20M12 28h28M12 34h14" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" opacity=".6" />
      <circle cx="46" cy="44" r="12" fill={`url(#${id}g)`} />
      <circle cx="46" cy="44" r="4.5" fill="#fff" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <rect key={a} x="44.5" y="30" width="3" height="5" rx="1" fill={`url(#${id}g)`} transform={`rotate(${a} 46 44)`} />
      ))}
    </>
  );
}

// ── Vehicle ──
function CarSeat({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}s`, '#475569', '#0F172A')}
        {lg(`${id}c`, '#94A3B8', '#475569')}
      </defs>
      <Shadow rx={20} />
      <rect x="18" y="6" width="22" height="10" rx="4" fill={`url(#${id}s)`} />
      <path d="M16 18h26l-3 24H20z" fill={`url(#${id}s)`} />
      <path d="M22 22h14l-2 16H24z" fill={`url(#${id}c)`} />
      <path d="M14 44h34a4 4 0 0 1 0 8H14a4 4 0 0 1 0-8z" fill={`url(#${id}s)`} />
      <path d="M48 10l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z" fill="#FDE047" />
    </>
  );
}
function BikeArt({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}b`, ...C.red)}
        {lg(`${id}t`, ...C.dark)}
      </defs>
      <Shadow rx={26} />
      <circle cx="14" cy="44" r="10" fill="none" stroke={`url(#${id}t)`} strokeWidth="5" />
      <circle cx="50" cy="44" r="10" fill="none" stroke={`url(#${id}t)`} strokeWidth="5" />
      <path d="M20 30h20l8 14M26 30l-12 14M40 30l-6-12h-8" stroke="#475569" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 24h20c3 0 5 3 4 6H24z" fill={`url(#${id}b)`} />
      <rect x="22" y="14" width="10" height="4" rx="2" fill="#1E293B" />
    </>
  );
}

// ── Salon ──
function Facial({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}f`, '#FFE4D6', '#F9B998')}
        {lg(`${id}j`, ...C.pink)}
      </defs>
      <Shadow rx={22} />
      <ellipse cx="26" cy="28" rx="16" ry="20" fill={`url(#${id}f)`} />
      <path d="M10 22c2-14 30-18 32 2-8-6-20-8-32-2z" fill="#7C2D12" />
      <path d="M19 30c2 2 4 2 6 0M29 30c2 2 4 2 6 0" stroke="#7C2D12" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M22 39c3 2 7 2 10 0" stroke="#BE123C" strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="42" y="38" width="18" height="16" rx="4" fill={`url(#${id}j)`} />
      <rect x="40" y="33" width="22" height="6" rx="2" fill="#FBCFE8" />
      <path d="M48 4l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z" fill="#F9A8D4" />
    </>
  );
}
function Wax({ id }: P) {
  return (
    <>
      <defs>
        {lg(`${id}p`, ...C.amber)}
        {lg(`${id}s`, ...C.pink)}
      </defs>
      <Shadow rx={22} />
      <path d="M10 26h34v20a10 10 0 0 1-10 10H20a10 10 0 0 1-10-10z" fill={`url(#${id}p)`} />
      <ellipse cx="27" cy="26" rx="17" ry="5" fill="#FBBF24" />
      <ellipse cx="27" cy="26" rx="13" ry="3.2" fill="#F59E0B" />
      <rect x="34" y="4" width="8" height="30" rx="3" fill="#E7C9A0" transform="rotate(20 38 19)" />
      <rect x="44" y="34" width="16" height="22" rx="3" fill={`url(#${id}s)`} transform="rotate(-10 52 45)" />
    </>
  );
}

/** Service slug → illustration. Missing slugs use the category art. */
export const SERVICE_ART: Record<string, (p: P) => ReactElement> = {
  'ac-repair': AcRepair,
  'ac-installation': AcInstall,
  'ac-gas-refill': GasCylinder,
  'ac-uninstallation': AcRemove,
  'air-cooler-repair': Cooler,
  'fan-installation': FanArt,
  'light-installation': Bulb,
  'inverter-service': Battery,
  'house-wiring': Wiring,
  'plumber-visit': PlumberTools,
  'water-tank-cleaning': WaterTank,
  'toilet-repair': ToiletArt,
  'drain-blockage': Drain,
  'motor-pump-repair': Pump,
  'door-repair': Door,
  'furniture-assembly': Toolbox,
  'kitchen-cabinet-repair': Cabinet,
  'full-home-painting': HousePaint,
  waterproofing: Waterproof,
  'refrigerator-repair': Fridge,
  'tv-repair': Television,
  'geyser-repair': Geyser,
  'microwave-repair': MicrowaveArt,
  'chimney-cleaning': Chimney,
  'home-deep-cleaning': HomeSparkle,
  'bathroom-cleaning': Shower,
  'sofa-cleaning': SofaArt,
  'kitchen-cleaning': KitchenClean,
  'cctv-repair': CctvRepair,
  'ro-installation': RoInstall,
  'ro-filter-change': FilterArt,
  'termite-control': Termite,
  'mosquito-control': Mosquito,
  'bed-bug-control': BedBug,
  'desktop-printer-repair': Desktop,
  'software-installation': Software,
  'car-interior-cleaning': CarSeat,
  'bike-service': BikeArt,
  'facial-cleanup': Facial,
  waxing: Wax,
};
