import { BadgeCheck, Truck, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RiskIndicatorCategory } from "../../types/riskOutlook";

// The same icons the sidebar uses for these three areas.
export const RISK_CATEGORY_ICONS: Record<RiskIndicatorCategory, LucideIcon> = {
  vehicle: Truck,
  energy: Zap,
  certificate: BadgeCheck,
};