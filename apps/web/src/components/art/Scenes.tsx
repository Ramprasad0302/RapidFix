import { useId } from 'react';

type P = { className?: string };
const useSvgId = () => useId().replace(/:/g, '');

/** Modern two-storey home with a toolbox — hero & banner artwork. */
export function HomeScene({ className, tone = 'dark' }: P & { tone?: 'dark' | 'light' }) {
  const id = useSvgId();
  const wall = tone === 'dark' ? '#F1F5F9' : '#FFFFFF';
  return (
    <svg viewBox="0 0 220 170" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#BFDBFE" />
          <stop offset="1" stopColor="#1E40AF" />
        </linearGradient>
        <linearGradient id={`${id}u`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={wall} />
          <stop offset="1" stopColor="#CBD5E1" />
        </linearGradient>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1E3A8A" />
        </linearGradient>
      </defs>
      <ellipse cx="118" cy="160" rx="100" ry="8" fill="#0B1F3A" opacity=".18" />
      {/* trees */}
      <circle cx="30" cy="112" r="20" fill="#2F855A" opacity=".85" />
      <circle cx="44" cy="100" r="16" fill="#38A169" opacity=".85" />
      <rect x="34" y="118" width="4" height="40" fill="#5B3A1E" />
      <circle cx="204" cy="118" r="15" fill="#2F855A" opacity=".8" />
      {/* upper storey */}
      <rect x="66" y="40" width="132" height="9" rx="2" fill="#94A3B8" />
      <rect x="74" y="49" width="116" height="46" fill={`url(#${id}u)`} />
      <rect x="82" y="56" width="44" height="32" rx="2" fill={`url(#${id}g)`} opacity=".9" />
      <rect x="134" y="56" width="48" height="32" rx="2" fill={`url(#${id}g)`} opacity=".9" />
      <path d="M104 56v32M158 56v32" stroke="#E2E8F0" strokeWidth="1.5" />
      {/* lower storey */}
      <rect x="44" y="93" width="160" height="8" rx="2" fill="#94A3B8" />
      <rect x="52" y="101" width="146" height="57" fill={`url(#${id}u)`} />
      <rect x="60" y="110" width="58" height="30" rx="2" fill={`url(#${id}g)`} opacity=".85" />
      <rect x="126" y="104" width="22" height="54" fill="#B7794A" />
      <path d="M130 108v46M134 108v46M138 108v46M142 108v46" stroke="#9A6038" strokeWidth="1" />
      <rect x="156" y="112" width="34" height="46" rx="2" fill={`url(#${id}g)`} opacity=".85" />
      <path d="M173 112v46" stroke="#E2E8F0" strokeWidth="1.5" />
      {/* toolbox */}
      <rect x="74" y="140" width="42" height="20" rx="3" fill={`url(#${id}t)`} />
      <rect x="74" y="146" width="42" height="3" fill="#0B1F3A" opacity=".4" />
      <path d="M86 140v-5h18v5" stroke="#0B1F3A" strokeWidth="3" fill="none" strokeLinejoin="round" />
      <path d="M90 148h10" stroke="#00C2FF" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Verified-shield badge used on the "Trusted Professionals" banner. */
export function ShieldBadge({ className }: P) {
  const id = useSvgId();
  return (
    <svg viewBox="0 0 48 56" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <path d="M24 2 44 9v17c0 13-8.6 23.6-20 28C12.6 49.6 4 39 4 26V9z" fill={`url(#${id}s)`} />
      <path d="m14.5 28 6.5 6.5 13-14" stroke="#fff" strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Gift box, coins and a % tag — Offers banner. */
export function OfferGift({ className }: P) {
  const id = useSvgId();
  return (
    <svg viewBox="0 0 170 130" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#D6E4FF" />
        </linearGradient>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#60A5FA" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
        <radialGradient id={`${id}c`} cx=".35" cy=".35" r=".7">
          <stop offset="0" stopColor="#FFE58A" />
          <stop offset="1" stopColor="#E0A100" />
        </radialGradient>
      </defs>
      <ellipse cx="86" cy="122" rx="52" ry="6" fill="#000" opacity=".2" />
      <rect x="44" y="56" width="84" height="62" rx="6" fill={`url(#${id}b)`} />
      <rect x="38" y="44" width="96" height="18" rx="5" fill="#EFF4FF" />
      <rect x="78" y="44" width="16" height="74" fill={`url(#${id}r)`} />
      <path d="M86 44c-10-18-34-18-30-4 3 9 22 6 30 4zM86 44c10-18 34-18 30-4-3 9-22 6-30 4z" fill={`url(#${id}r)`} />
      {[
        [26, 38, 11],
        [150, 30, 9],
        [22, 92, 8],
        [148, 84, 12],
        [120, 14, 7],
      ].map(([x, y, r], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={r} fill={`url(#${id}c)`} />
          <text x={x} y={y! + r! * 0.38} textAnchor="middle" fontSize={r! * 1.05} fontWeight="700" fill="#B07800">
            ₹
          </text>
        </g>
      ))}
      <g transform="rotate(10 138 104)">
        <rect x="116" y="84" width="44" height="40" rx="8" fill="#2563EB" />
        <text x="138" y="112" textAnchor="middle" fontSize="26" fontWeight="800" fill="#fff">
          %
        </text>
      </g>
    </svg>
  );
}

/** Support agent silhouette with headset — "Need Help?" cards. */
export function SupportArt({ className }: P) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="32" cy="32" r="30" fill="#DBEAFE" />
      <circle cx="32" cy="26" r="11" fill="#1E3A8A" />
      <path d="M12 58c2-12 10-18 20-18s18 6 20 18a30 30 0 0 1-40 0z" fill="#2563EB" />
      <path d="M19 27a13 13 0 0 1 26 0" stroke="#0B1F3A" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="15" y="25" width="6" height="10" rx="3" fill="#0B1F3A" />
      <rect x="43" y="25" width="6" height="10" rx="3" fill="#0B1F3A" />
      <path d="M46 35c0 5-4 7-9 7" stroke="#0B1F3A" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="36" cy="42" r="2.2" fill="#0B1F3A" />
    </svg>
  );
}

/** Neutral guest avatar for the signed-out Account screen. */
export function GuestAvatar({ className }: P) {
  const id = useSvgId();
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E0ECFF" />
          <stop offset="1" stopColor="#BFD6FF" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <circle cx="60" cy="60" r="56" />
        </clipPath>
      </defs>
      <circle cx="60" cy="60" r="56" fill={`url(#${id}b)`} />
      <g clipPath={`url(#${id}c)`}>
        <circle cx="60" cy="50" r="22" fill="#F8FAFC" />
        <path d="M38 46c0-15 10-24 22-24s22 9 22 24c-4-7-12-11-22-11s-18 4-22 11z" fill="#1E3A8A" />
        <path d="M18 120c2-24 20-38 42-38s40 14 42 38z" fill="#2563EB" />
        <path d="M50 84l10 12 10-12" fill="#fff" />
      </g>
    </svg>
  );
}

/** Phone with a message bubble — OTP screen. */
export function OtpPhoneArt({ className }: P) {
  const id = useSvgId();
  return (
    <svg viewBox="0 0 140 120" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <circle cx="30" cy="30" r="4" fill="#BFDBFE" />
      <circle cx="112" cy="96" r="5" fill="#BFDBFE" />
      <circle cx="120" cy="20" r="3" fill="#93C5FD" />
      <rect x="42" y="8" width="52" height="104" rx="10" fill="#0B1F3A" />
      <rect x="46" y="16" width="44" height="86" rx="5" fill={`url(#${id}s)`} />
      <rect x="60" y="11" width="16" height="2.5" rx="1.25" fill="#1C3A63" />
      <path d="M74 34h50a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H94l-10 10v-10H74a8 8 0 0 1-8-8V42a8 8 0 0 1 8-8z" fill="#60A5FA" />
      <circle cx="87" cy="53" r="4" fill="#fff" />
      <circle cx="99" cy="53" r="4" fill="#fff" />
      <circle cx="111" cy="53" r="4" fill="#fff" />
    </svg>
  );
}
