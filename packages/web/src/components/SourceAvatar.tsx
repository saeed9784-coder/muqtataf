'use client';

import { useState } from 'react';

interface SourceAvatarProps {
  name: string;
  image: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = { sm: 'size-6 text-xs', md: 'size-8 text-sm', lg: 'size-14 text-xl' } as const;

/** Source or user image with an initial-letter fallback when the image is missing or fails. */
export function SourceAvatar({ name, image, size = 'sm' }: SourceAvatarProps) {
  const [hasFailed, setHasFailed] = useState(false);
  const classes = `${SIZES[size]} shrink-0 rounded-full bg-surface-2 object-cover`;
  if (image && !hasFailed) {
    return <img src={image} alt="" className={classes} loading="lazy" referrerPolicy="no-referrer" onError={() => setHasFailed(true)} />;
  }
  return (
    <span className={`${classes} flex items-center justify-center font-bold text-muted`} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
