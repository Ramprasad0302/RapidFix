import type { ReactNode } from 'react';
import { cx } from '@fixora/ui';

export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('min-w-0 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card sm:p-5', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-[17px] font-bold text-slate-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Chart colours, validated with the dataviz palette checker (lightness band,
 * chroma floor, CVD separation, normal-vision floor). Colour follows the entity:
 * each category keeps its slot whatever its rank.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  ac: '#2563EB',
  electrical: '#EB6834',
  plumbing: '#1BAF7A',
  carpentry: '#EDA100',
  painting: '#E87BA4',
  appliance: '#008300',
  cleaning: '#4A3AA7',
};
export const OTHERS_COLOR = '#94A3B8';
export const BOOKING_SERIES = { completed: '#2563EB', active: '#6DA7EC', cancelled: '#E34948' } as const;
