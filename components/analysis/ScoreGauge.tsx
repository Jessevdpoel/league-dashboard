/**
 * Mobalytics-style circular performance gauge. Pure SVG, no client JS.
 * 240° arc opening at the bottom; color follows the shared score bands
 * (>=65 win, >=40 amber, else loss).
 */
const SIZE = 140;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const SWEEP_DEG = 240;
const ARC_LEN = (SWEEP_DEG / 360) * 2 * Math.PI * RADIUS;

function bandClass(score: number): string {
  if (score >= 65) return 'stroke-win';
  if (score >= 40) return 'stroke-amber';
  return 'stroke-loss';
}

export interface ScoreGaugeProps {
  score: number | null;
  label?: string;
}

export function ScoreGauge({ score, label = 'Overall score' }: ScoreGaugeProps) {
  // Arc starts at 150° (lower-left) and sweeps clockwise 240° to 30° (lower-right).
  const track = (
    <circle
      cx={SIZE / 2}
      cy={SIZE / 2}
      r={RADIUS}
      fill="none"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeDasharray={`${ARC_LEN} ${2 * Math.PI * RADIUS}`}
      transform={`rotate(150 ${SIZE / 2} ${SIZE / 2})`}
      className="stroke-muted"
    />
  );

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative"
        style={{ width: SIZE, height: SIZE }}
        {...(score !== null
          ? { role: 'meter', 'aria-valuenow': score, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label }
          : {})}
      >
        <svg width={SIZE} height={SIZE} aria-hidden="true">
          {track}
          {score !== null && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${(score / 100) * ARC_LEN} ${2 * Math.PI * RADIUS}`}
              transform={`rotate(150 ${SIZE / 2} ${SIZE / 2})`}
              className={bandClass(score)}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
          <span className="text-4xl font-bold text-foreground">{score ?? '—'}</span>
          {score !== null && <span className="text-[11px] text-muted-foreground">/ 100</span>}
        </div>
      </div>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
