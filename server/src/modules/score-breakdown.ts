export interface ScoreComponent {
  id: string;
  label: string;
  delta: number;
  category: "anchor" | "corroboration" | "social" | "penalty" | "user" | "wiki";
}

export function buildScoreBreakdown(components: ScoreComponent[]): {
  components: ScoreComponent[];
  baseScore: number;
  finalScore: number;
  summary: string;
} {
  const baseScore = 20;
  const delta = components.reduce((sum, c) => sum + c.delta, 0);
  const finalScore = Math.max(0, Math.min(100, baseScore + delta));
  const positives = components.filter((c) => c.delta > 0);
  const negatives = components.filter((c) => c.delta < 0);
  const summary = [
    positives.length ? `+${positives.reduce((s, c) => s + c.delta, 0)} from ${positives.length} signals` : null,
    negatives.length ? `${negatives.reduce((s, c) => s + c.delta, 0)} from ${negatives.length} penalties` : null,
  ]
    .filter(Boolean)
    .join("; ");
  return { components, baseScore, finalScore, summary };
}