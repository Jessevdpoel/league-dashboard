import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Summit stat panel: dark gradient surface with a gold top-rail accent. */
export function Panel({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'relative rounded-xl border border-panel-border bg-gradient-to-b from-panel to-panel-2 p-5',
        className
      )}
    >
      <span
        aria-hidden
        className="absolute left-3.5 top-0 h-0.5 w-2/5 rounded bg-gradient-to-r from-gold to-transparent"
      />
      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      {children}
    </section>
  );
}
