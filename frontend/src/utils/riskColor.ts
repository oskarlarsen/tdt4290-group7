export type RiskLevel = "high" | "medium" | "low";

// Tertiary is used for compliant status; primary and secondary are reserved for brand elements
export function riskColor(level: RiskLevel): "red" | "orange" | "tertiary" {
  if (level === "high") return "red";
  if (level === "medium") return "orange";
  return "tertiary";
}