export interface ParsedRiotId {
  gameName: string;
  tagLine: string;
}

export function parseRiotIdSegment(segment: string): ParsedRiotId | null {
  const lastDash = segment.lastIndexOf('-');
  if (lastDash <= 0 || lastDash === segment.length - 1) return null;
  return {
    gameName: decodeURIComponent(segment.slice(0, lastDash)),
    tagLine: decodeURIComponent(segment.slice(lastDash + 1)),
  };
}
