import { useId, type ReactElement } from 'react';

/**
 * Original RapidFix category illustrations (soft 3D style). Keyed by the
 * category's `iconKey`, so new categories fall back to a neutral wrench.
 */
type ArtProps = { className?: string };

function Ac({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#DCE4EE" />
        </linearGradient>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#60B5FF" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect x="4" y="14" width="56" height="26" rx="7" fill={`url(#${id}b)`} stroke="#C7D2E0" />
      <rect x="4" y="33" width="56" height="7" rx="3.5" fill="#CFD8E4" />
      <path d="M11 36.5h42" stroke="#8FA0B7" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="38" y="19" width="16" height="6" rx="2.5" fill={`url(#${id}p)`} />
      <circle cx="51" cy="22" r="1.1" fill="#fff" />
      <rect x="9" y="19" width="22" height="2.4" rx="1.2" fill="#E6ECF4" />
      <g stroke="#7CC4FF" strokeWidth="2.2" strokeLinecap="round" fill="none">
        <path d="M18 45c2.5 3 2.5 6 0 9" />
        <path d="M32 45c2.5 3 2.5 6 0 9" />
        <path d="M46 45c2.5 3 2.5 6 0 9" />
      </g>
    </>
  );
}

function Electrical({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}g`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#FFE066" />
          <stop offset="1" stopColor="#FF9500" />
        </linearGradient>
      </defs>
      <path d="M38 3 14 36h14l-5 25 27-36H35L42 3z" fill={`url(#${id}g)`} />
      <path d="M38 3 14 36h6L40 7z" fill="#FFF3B0" opacity=".7" />
      <path d="M50 25 23 61l4-18z" fill="#E07B00" opacity=".35" />
    </>
  );
}

function Plumbing({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F1F5F9" />
          <stop offset="1" stopColor="#94A3B8" />
        </linearGradient>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7DD3FC" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect x="22" y="7" width="20" height="6" rx="3" fill="#64748B" />
      <rect x="29" y="12" width="6" height="8" fill="#94A3B8" />
      <rect x="6" y="19" width="12" height="16" rx="3" fill={`url(#${id}c)`} stroke="#94A3B8" />
      <path d="M16 20h28a10 10 0 0 1 10 10v5h-9v-3.5a3 3 0 0 0-3-3H16z" fill={`url(#${id}c)`} stroke="#94A3B8" />
      <rect x="44" y="34" width="11" height="4" rx="1.5" fill="#64748B" />
      <path d="M49.5 43s-6.5 7.4-6.5 11.6a6.5 6.5 0 0 0 13 0c0-4.2-6.5-11.6-6.5-11.6z" fill={`url(#${id}w)`} />
      <ellipse cx="47.2" cy="54" rx="1.6" ry="2.6" fill="#fff" opacity=".7" />
    </>
  );
}

function Carpentry({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E3A063" />
          <stop offset="1" stopColor="#9A5424" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F0B77E" />
          <stop offset="1" stopColor="#C57636" />
        </linearGradient>
      </defs>
      <rect x="17" y="5" width="5.5" height="54" rx="2" fill={`url(#${id}w)`} />
      <rect x="41.5" y="5" width="5.5" height="54" rx="2" fill={`url(#${id}w)`} />
      <rect x="15" y="3" width="34" height="6.5" rx="2.5" fill={`url(#${id}s)`} />
      {[24.5, 30, 35.5].map((x) => (
        <rect key={x} x={x} y="9" width="4" height="22" rx="1.5" fill={`url(#${id}s)`} />
      ))}
      <path d="M11 33h42l-3.5 8h-35z" fill={`url(#${id}s)`} />
      <rect x="14" y="41" width="5.5" height="20" rx="2" fill={`url(#${id}w)`} />
      <rect x="44.5" y="41" width="5.5" height="20" rx="2" fill={`url(#${id}w)`} />
    </>
  );
}

function Painting({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6AA8FF" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <rect x="8" y="6" width="42" height="18" rx="9" fill={`url(#${id}r)`} transform="rotate(-18 29 15)" />
      <rect x="12" y="9" width="30" height="4" rx="2" fill="#BFDBFE" opacity=".8" transform="rotate(-18 29 15)" />
      <path d="M50 12l5 1.5-2.5 13-20 6.5-1 7" stroke="#475569" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="27" y="38" width="9" height="23" rx="4.5" fill="#1E3A8A" transform="rotate(8 31 49)" />
    </>
  );
}

function Appliance({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#DCE3EC" />
        </linearGradient>
        <radialGradient id={`${id}d`} cx=".4" cy=".35" r=".8">
          <stop offset="0" stopColor="#60A5FA" />
          <stop offset="1" stopColor="#1E3A8A" />
        </radialGradient>
      </defs>
      <rect x="11" y="4" width="42" height="56" rx="6" fill={`url(#${id}b)`} stroke="#C7D2E0" />
      <rect x="11" y="4" width="42" height="11" rx="6" fill="#EEF2F7" />
      <rect x="15" y="8" width="12" height="3.5" rx="1.75" fill="#CBD5E1" />
      <circle cx="42" cy="9.8" r="2.3" fill="#2563EB" />
      <circle cx="48" cy="9.8" r="2.3" fill="#94A3B8" />
      <circle cx="32" cy="37" r="15" fill="#CBD5E1" />
      <circle cx="32" cy="37" r="11" fill={`url(#${id}d)`} />
      <path d="M25 33a9 9 0 0 1 8-6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".7" fill="none" />
    </>
  );
}

function Cleaning({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE38A" />
          <stop offset="1" stopColor="#F29B0C" />
        </linearGradient>
      </defs>
      <path d="M48 3 28 38" stroke="#2563EB" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M22 34.5l12.5 7-2.3 4-12.5-7z" fill="#1E3A8A" />
      <path d="M19.5 39 33 46.8 27 61c-7 1.5-15-1.6-21-7z" fill={`url(#${id}b)`} />
      <g stroke="#D97706" strokeWidth="1.3" opacity=".7">
        <path d="M16 45 9.5 55" />
        <path d="M21 48 15 58.5" />
        <path d="M26 50.5 21.5 60.5" />
      </g>
    </>
  );
}

function Cctv({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F8FAFC" />
          <stop offset="1" stopColor="#9AA8BB" />
        </linearGradient>
      </defs>
      <rect x="33" y="49" width="22" height="7" rx="2.5" fill="#475569" />
      <path d="M41 49V36h6v13z" fill="#64748B" />
      <g transform="rotate(-14 30 26)">
        <rect x="7" y="16" width="44" height="20" rx="7" fill={`url(#${id}b)`} stroke="#94A3B8" />
        <rect x="9" y="13" width="40" height="6" rx="3" fill="#CBD5E1" />
        <circle cx="13" cy="26" r="7.5" fill="#1E293B" />
        <circle cx="13" cy="26" r="3.8" fill="#3B82F6" />
        <circle cx="11.6" cy="24.6" r="1.1" fill="#fff" />
        <circle cx="44" cy="22" r="1.4" fill="#EF4444" />
      </g>
    </>
  );
}

function Ro({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#DCE3EC" />
        </linearGradient>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A5D8FF" />
          <stop offset="1" stopColor="#2F80ED" />
        </linearGradient>
      </defs>
      <rect x="15" y="3" width="34" height="52" rx="7" fill={`url(#${id}b)`} stroke="#C7D2E0" />
      <rect x="20" y="9" width="24" height="27" rx="5" fill={`url(#${id}p)`} />
      <path d="M32 15s-5 5.8-5 9a5 5 0 0 0 10 0c0-3.2-5-9-5-9z" fill="#fff" opacity=".9" />
      <rect x="29" y="40" width="6" height="5" rx="1.5" fill="#94A3B8" />
      <path d="M32 45v4" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="13" y="54" width="38" height="7" rx="3.5" fill="#CBD5E1" />
    </>
  );
}

function Pest({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4ADE80" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
      <path d="M30 10h14v10H30z" fill="#1F2937" />
      <path d="M30 12h-8l-3 5h11z" fill="#334155" />
      <rect x="26" y="20" width="24" height="40" rx="7" fill={`url(#${id}g)`} />
      <rect x="30" y="30" width="16" height="14" rx="3" fill="#fff" opacity=".85" />
      <path d="M34 37h8M38 33v8" stroke="#059669" strokeWidth="2.4" strokeLinecap="round" />
      <g fill="#A7F3D0">
        <circle cx="14" cy="15" r="2" />
        <circle cx="9" cy="20" r="1.6" />
        <circle cx="15" cy="23" r="1.3" />
      </g>
      <ellipse cx="12" cy="48" rx="5" ry="6.5" fill="#92400E" />
      <g stroke="#92400E" strokeWidth="1.4" strokeLinecap="round">
        <path d="M7 45 3 43M7 49H2.5M7.5 53 4 56M17 45l4-2M17 49h4.5M16.5 53l3.5 3" />
      </g>
    </>
  );
}

function More() {
  return (
    <g fill="#2563EB">
      <rect x="12" y="12" width="17" height="17" rx="8.5" />
      <rect x="35" y="12" width="17" height="17" rx="8.5" />
      <rect x="12" y="35" width="17" height="17" rx="8.5" />
      <rect x="35" y="35" width="17" height="17" rx="8.5" />
    </g>
  );
}

function Computer({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#60B5FF" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F1F5F9" />
          <stop offset="1" stopColor="#CBD5E1" />
        </linearGradient>
      </defs>
      <rect x="11" y="12" width="42" height="29" rx="4" fill="#334155" />
      <rect x="14" y="15" width="36" height="23" rx="2" fill={`url(#${id}s)`} />
      <path d="M14 15h20L18 38h-4z" fill="#fff" opacity=".18" />
      <path d="M5 44h54l-4 7H9z" fill={`url(#${id}b)`} stroke="#B6C2D2" />
      <rect x="27" y="44" width="10" height="2.4" rx="1.2" fill="#94A3B8" />
      <path d="m27 22 5 4-5 4M34 31h5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  );
}

function Vehicle({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#60B5FF" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <path d="M8 38l4-11c1-3 3-5 7-5h26c4 0 6 2 7 5l4 11v7a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z" fill={`url(#${id}c)`} />
      <path d="M16 27c1-2 2-3 4-3h24c2 0 3 1 4 3l2 7H14z" fill="#DBEAFE" />
      <path d="M32 24v10" stroke="#93C5FD" strokeWidth="1.5" />
      <circle cx="18" cy="48" r="6" fill="#1E293B" />
      <circle cx="18" cy="48" r="2.4" fill="#CBD5E1" />
      <circle cx="46" cy="48" r="6" fill="#1E293B" />
      <circle cx="46" cy="48" r="2.4" fill="#CBD5E1" />
      <rect x="9" y="38" width="6" height="3" rx="1.5" fill="#FDE68A" />
      <rect x="49" y="38" width="6" height="3" rx="1.5" fill="#FDE68A" />
      <g fill="#7DD3FC">
        <circle cx="50" cy="12" r="3" />
        <circle cx="56" cy="17" r="2" />
        <circle cx="45" cy="17" r="1.6" />
      </g>
    </>
  );
}

function Salon({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F9A8D4" />
          <stop offset="1" stopColor="#DB2777" />
        </linearGradient>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F1F5F9" />
          <stop offset="1" stopColor="#94A3B8" />
        </linearGradient>
      </defs>
      <circle cx="18" cy="46" r="7" fill="none" stroke={`url(#${id}h)`} strokeWidth="4" />
      <circle cx="34" cy="46" r="7" fill="none" stroke={`url(#${id}h)`} strokeWidth="4" />
      <path d="M22 40 44 8M30 40 12 12" stroke={`url(#${id}m)`} strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="26" cy="34" r="2.2" fill="#475569" />
      <g fill="#F9A8D4">
        <path d="M50 30l1.6 3.4 3.4 1.6-3.4 1.6L50 40l-1.6-3.4L45 35l3.4-1.6z" />
        <path d="M55 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
      </g>
    </>
  );
}

function Wrench() {
  return (
    <path
      d="M44 8a12 12 0 0 0-11 16L10 47a5 5 0 1 0 7 7l23-23a12 12 0 0 0 16-11l-7 4-6-6 4-7z"
      fill="#2563EB"
    />
  );
}

const ART: Record<string, (p: { id: string }) => ReactElement> = {
  ac: Ac,
  electrical: Electrical,
  plumbing: Plumbing,
  carpentry: Carpentry,
  painting: Painting,
  appliance: Appliance,
  cleaning: Cleaning,
  cctv: Cctv,
  ro: Ro,
  pest: Pest,
  computer: Computer,
  vehicle: Vehicle,
  salon: Salon,
  more: More,
};

export function CategoryArt({ iconKey, className }: ArtProps & { iconKey: string }) {
  const id = useId().replace(/:/g, '');
  const Art = ART[iconKey] ?? Wrench;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <Art id={id} />
    </svg>
  );
}

/** Soft background per category for image-less service cards. */
export const CATEGORY_TINT: Record<string, string> = {
  ac: 'from-sky-50 to-blue-100',
  electrical: 'from-amber-50 to-yellow-100',
  plumbing: 'from-cyan-50 to-sky-100',
  carpentry: 'from-orange-50 to-amber-100',
  painting: 'from-indigo-50 to-blue-100',
  appliance: 'from-slate-50 to-blue-100',
  cleaning: 'from-yellow-50 to-amber-100',
  cctv: 'from-slate-50 to-slate-200',
  ro: 'from-sky-50 to-cyan-100',
  pest: 'from-emerald-50 to-green-100',
  computer: 'from-blue-50 to-indigo-100',
  vehicle: 'from-sky-50 to-blue-100',
  salon: 'from-pink-50 to-rose-100',
};
