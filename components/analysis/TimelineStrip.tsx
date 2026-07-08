'use client';

import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { DeathFact, GoldDiffPoint } from '@/lib/analysis/timelineFacts';

const chartConfig = {
  gold: { label: 'Gold lead', color: 'var(--chart-1)' },
} satisfies ChartConfig;

export interface TimelineStripProps {
  series: GoldDiffPoint[];
  deaths: DeathFact[];
}

/** Gold-diff area chart with death markers (04-frontend.md §layout item 5). */
export function TimelineStrip({ series, deaths }: TimelineStripProps) {
  if (series.length < 2) return null;

  const byMinute = new Map(series.map((p) => [p.minute, p.gold]));
  const deathMarkers = deaths
    .map((d) => {
      const minute = Math.round(d.minute);
      const gold = byMinute.get(minute);
      return gold === undefined ? null : { minute, gold, solo: d.wasSoloDeath };
    })
    .filter((d): d is { minute: number; gold: number; solo: boolean } => d !== null);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Gold lead vs lane opponent · <span className="text-loss">●</span> deaths
      </h2>
      <ChartContainer config={chartConfig} className="h-[140px] w-full">
        <AreaChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="minute"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
            tickFormatter={(m: number) => `${m}m`}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => `Minute ${payload[0]?.payload.minute}`}
              />
            }
          />
          <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
          <Area
            dataKey="gold"
            type="monotone"
            fill="var(--color-gold)"
            fillOpacity={0.2}
            stroke="var(--color-gold)"
            strokeWidth={2}
          />
          {deathMarkers.map((d, i) => (
            <ReferenceDot
              key={i}
              x={d.minute}
              y={d.gold}
              r={d.solo ? 5 : 4}
              fill="var(--color-loss, #ff5f5f)"
              stroke="var(--background)"
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ChartContainer>
    </section>
  );
}
