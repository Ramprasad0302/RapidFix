import { TIME_SLOTS, type AddressSnapshot } from '@fixora/shared-types';

/** Dates are shown in India time regardless of the device timezone. */
const TZ = 'Asia/Kolkata';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const partsFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: TZ });
/** IST calendar parts — month names are ours, so every device shows "Sep" (not "Sept"). */
function istParts(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { day: Number(p.day), month: MONTHS[Number(p.month) - 1]!, year: p.year };
}
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ });
const weekdayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: TZ });

export const formatDate = (iso: string | Date) => {
  const p = istParts(new Date(iso));
  return `${p.day} ${p.month} ${p.year}`;
};
export const formatShortDate = (iso: string | Date) => {
  const p = istParts(new Date(iso));
  return `${p.day} ${p.month}`;
};
export const formatWeekday = (iso: string | Date) => weekdayFmt.format(new Date(iso));
export const formatMonth = (iso: string | Date) => {
  const p = istParts(new Date(iso));
  return `${p.month} ${p.year}`;
};
/** "10:05 AM" */
export const formatTime = (iso: string | Date) => timeFmt.format(new Date(iso)).toUpperCase().replace(/\s+/g, ' ');

const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;

/** "9:00 AM – 11:00 AM", or null for non-slot values like "NOW". */
export function slotRange(slotId: string): string | null {
  const s = TIME_SLOTS.find((t) => t.id === slotId);
  return s ? `${hourLabel(s.startHour)} – ${hourLabel(s.endHour)}` : null;
}

/** "30 Sep 2026, 9:00 AM – 11:00 AM" / "30 Sep 2026, 10:05 AM" for book-now jobs. */
export function formatSchedule(scheduledFor: string, timeSlot: string, scheduleType: 'NOW' | 'SCHEDULED') {
  const range = slotRange(timeSlot);
  if (scheduleType === 'SCHEDULED' && range) return `${formatDate(scheduledFor)}, ${range}`;
  return `${formatDate(scheduledFor)}, ${formatTime(scheduledFor)}`;
}

/** Just the time part, for compact cards. */
export function formatScheduleTime(scheduledFor: string, timeSlot: string, scheduleType: 'NOW' | 'SCHEDULED') {
  return (scheduleType === 'SCHEDULED' && slotRange(timeSlot)) || formatTime(scheduledFor);
}

/** "Today, 29 Sep 2026" / "Tomorrow, 30 Sep 2026" / "Wed, 01 Oct 2026" */
export function formatDayHeading(iso: string) {
  const key = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86_400_000);
  const prefix = key(d) === key(today) ? 'Today' : key(d) === key(tomorrow) ? 'Tomorrow' : formatWeekday(d);
  return `${prefix}, ${formatDate(d)}`;
}

/** Local calendar key (YYYY-MM-DD, IST) for grouping. */
export const dayKey = (iso: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));

export function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: TZ }).format(now));
  return hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} hour${s < 7200 ? '' : 's'} ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} day${s < 172_800 ? '' : 's'} ago`;
  return formatDate(iso);
}

export const durationRange = (min: number, max: number) =>
  max >= 120 ? `${Math.round((min / 60) * 10) / 10}–${Math.round((max / 60) * 10) / 10} hrs` : `${min} - ${max} mins`;

export const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] ?? '';

export const initials = (name: string | null | undefined) =>
  (name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'F';

/** Next `n` calendar days (IST) as YYYY-MM-DD, starting today. */
export function nextDays(n: number) {
  return Array.from({ length: n }, (_, i) => dayKey(new Date(Date.now() + i * 86_400_000)));
}

/** Multi-line postal address for display. */
export const addressLines = (a: Pick<AddressSnapshot, 'houseNo' | 'street' | 'area' | 'villageTown' | 'district' | 'state' | 'pincode' | 'landmark'>) =>
  [[a.houseNo, a.street, a.area].filter(Boolean).join(', '), `${a.villageTown}, ${a.district}, ${a.state} - ${a.pincode}`, a.landmark].filter(Boolean);
