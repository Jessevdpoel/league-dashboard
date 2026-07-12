'use client';

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { MetricCategory } from '@/lib/analysis/metrics';
import { radarData } from '@/lib/analysis/radarData';

const chartConfig = {
  score: { label: 'Score', color: 'var(--chart-1)' },
} satisfies ChartConfig;

export function SkillRadar({ scores }: { scores: Record<MetricCategory, number | null> }) {
  const data = radarData(scores);
  if (data === null) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center rounded-lg border border-border bg-card p-4">
        <p className="text-center text-xs text-muted-foreground">
          Skill radar needs benchmark data.
          <br />
          Category bars below show what we have so far.
        </p>
      </div>
    );
  }
  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[220px] w-full">
      <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="skill" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar
          dataKey="score"
          fill="var(--color-score)"
          fillOpacity={0.35}
          stroke="var(--color-score)"
          strokeWidth={2}
          dot={{ r: 3, fillOpacity: 1 }}
        />
      </RadarChart>
    </ChartContainer>
  );
}
