'use client';

import { useEffect } from 'react';

/**
 * Publisher id (ca-pub-XXXXXXXX). When unset, AdSlot renders a labeled, fixed-height
 * placeholder — so the layout is identical with or without ads (zero CLS, 04/05).
 *
 * ⚠️ Before setting this in production for EU/UK traffic you MUST enable Google's
 * certified CMP ("Privacy & messaging" in the AdSense dashboard). It gates consent
 * before personalized ads load; we do not serve ads without it.
 */
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export interface AdSlotProps {
  /** AdSense ad-unit id (data-ad-slot). Required to render a real unit. */
  slot?: string;
  /** Reserved height in px — kept fixed so the slot never shifts layout. */
  height?: number;
  label?: string;
  className?: string;
}

export function AdSlot({ slot, height = 90, label = 'Advertisement', className = '' }: AdSlotProps) {
  const live = Boolean(ADSENSE_CLIENT && slot);

  useEffect(() => {
    if (!live) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense script not ready / blocked — the reserved space simply stays empty.
    }
  }, [live]);

  return (
    <div
      className={`overflow-hidden rounded-lg ${live ? '' : 'flex items-center justify-center border border-dashed border-line-subtle text-xs text-frost-500'} ${className}`}
      style={{ height }}
      aria-label={label}
    >
      {live ? (
        <ins
          className="adsbygoogle"
          style={{ display: 'block', width: '100%', height }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : (
        label
      )}
    </div>
  );
}
