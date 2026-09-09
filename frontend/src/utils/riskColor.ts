export type RiskLevel = "high" | "medium" | "low";

export function riskColor(level: RiskLevel): "red" | "orange" | "green" {
  if (level === "high") return "red";
  if (level === "medium") return "orange";
  return "green";
}
