import type { MetricCategory } from '@/lib/analysis/metrics';
import { radarData, SkillRadar } from '@/components/analysis/SkillRadar';
import { Panel } from './Panel';

/** Hidden entirely (no layout hole) unless every radar axis has a score. */
export function SkillProfilePanel({
  scores,
}: {
  scores: Record<MetricCategory, number | null> | null;
}) {
  if (!scores || radarData(scores) === null) return null;
  return (
    <Panel label="Skill Profile">
      <div className="mt-1">
        <SkillRadar scores={scores} />
      </div>
    </Panel>
  );
}
