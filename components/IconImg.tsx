'use client';

export interface IconImgProps {
  src: string;
  alt: string;
  className?: string;
}

/** Renders an icon `<img>` that hides itself on load failure — a Client Component
 * because `onError` can't be passed as a prop from a Server Component. */
export function IconImg({ src, alt, className }: IconImgProps) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
    />
  );
}
