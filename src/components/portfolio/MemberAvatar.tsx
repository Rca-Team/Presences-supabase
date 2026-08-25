import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface MemberAvatarProps {
  name: string;
  image?: string;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
  alt?: string;
}

function initials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hueFrom(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function MemberAvatar({
  name,
  image,
  className,
  imgClassName,
  fallbackClassName,
  alt,
}: MemberAvatarProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [image]);

  const showImage = !!image && !failed;
  const h = hueFrom(name || 'x');

  return (
    <div className={cn('relative inline-flex overflow-hidden', className)}>
      {showImage ? (
        <img
          src={image}
          alt={alt || name}
          onError={() => setFailed(true)}
          className={cn('h-full w-full object-cover', imgClassName)}
          loading="lazy"
        />
      ) : (
        <div
          className={cn(
            'flex h-full w-full items-center justify-center font-bold text-white',
            fallbackClassName,
          )}
          style={{
            background: `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h + 60) % 360} 70% 45%))`,
          }}
          aria-label={name}
        >
          {initials(name)}
        </div>
      )}
    </div>
  );
}
