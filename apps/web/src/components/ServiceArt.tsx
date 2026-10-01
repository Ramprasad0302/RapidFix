import { useState } from 'react';
import { cx } from '@fixora/ui';
import { mediaUrl } from '../lib/api';
import { CATEGORY_ACCENT, SERVICE_ICONS } from '../lib/serviceIcons';
import { CATEGORY_TINT, CategoryArt } from './art/CategoryArt';

interface Props {
  imageUrl?: string | null;
  iconKey: string;
  /** Service slug: shows the service's own icon (fan, bulb, tap…) instead of the category art. */
  slug?: string;
  alt: string;
  className?: string;
  /** Size of the fallback illustration relative to the box. */
  artClassName?: string;
}

/** A service/category photo when one exists, otherwise the service's own icon (or the category illustration) on a soft tint. */
export function ServiceArt({ imageUrl, iconKey, slug, alt, className, artClassName = 'w-1/2 max-w-24' }: Props) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(imageUrl);
  const Icon = slug ? SERVICE_ICONS[slug] : undefined;
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={cx('object-cover', className)}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={alt}
      className={cx('flex items-center justify-center bg-gradient-to-br', CATEGORY_TINT[iconKey] ?? 'from-slate-50 to-blue-100', className)}
    >
      {Icon ? (
        <Icon className={cx('h-1/2 max-h-20 w-1/2 max-w-20 drop-shadow-[0_4px_6px_rgb(15_23_42/0.12)]', CATEGORY_ACCENT[iconKey] ?? 'text-fixora-blue')} strokeWidth={1.75} aria-hidden />
      ) : (
        <CategoryArt iconKey={iconKey} className={artClassName} />
      )}
    </div>
  );
}
