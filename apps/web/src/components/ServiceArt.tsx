import { useId, useState } from 'react';
import { cx } from '@fixora/ui';
import { mediaUrl } from '../lib/api';
import { SERVICE_ART } from './art/ServiceArt3D';
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

/** A service/category photo when one exists, otherwise the service's own 3D illustration (or its category's) on a soft tint. */
export function ServiceArt({ imageUrl, iconKey, slug, alt, className, artClassName = 'w-1/2 max-w-24' }: Props) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(imageUrl);
  const Art = slug ? SERVICE_ART[slug] : undefined;
  const artId = useId().replace(/:/g, '');
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
      {Art ? (
        <svg viewBox="0 0 64 64" className={artClassName} aria-hidden>
          <Art id={artId} />
        </svg>
      ) : (
        <CategoryArt iconKey={iconKey} className={artClassName} />
      )}
    </div>
  );
}
