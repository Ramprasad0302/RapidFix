import { useState } from 'react';
import { cx } from '@fixora/ui';
import { mediaUrl } from '../lib/api';
import { CATEGORY_TINT, CategoryArt } from './art/CategoryArt';

interface Props {
  imageUrl?: string | null;
  iconKey: string;
  alt: string;
  className?: string;
  /** Size of the fallback illustration relative to the box. */
  artClassName?: string;
}

/** A service/category photo when one exists, otherwise the category illustration on a soft tint. */
export function ServiceArt({ imageUrl, iconKey, alt, className, artClassName = 'w-1/2 max-w-24' }: Props) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(imageUrl);
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
      <CategoryArt iconKey={iconKey} className={artClassName} />
    </div>
  );
}
