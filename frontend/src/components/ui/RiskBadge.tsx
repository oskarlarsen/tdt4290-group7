type RiskLevel = "high" | "medium" | "low";

const LABELS: Record<RiskLevel, string> = {
  high: "Svært høy",
  medium: "Middels",
  low: "Lav",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <span className="px-2 py-0.5 rounded text-xs font-medium">{LABELS[level]}</span>;
}
