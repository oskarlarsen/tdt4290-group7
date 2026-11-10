import type { FleetAgreement } from "../types/vehicle";
import { formatDate } from "./formatDate";

export type AgreementStatusFilter = "all" | "Active" | "Upcoming" | "Expiring soon" | "Expired";

export function getAgreementStatus(agreement: FleetAgreement, today = new Date()): Exclude<AgreementStatusFilter, "all"> {
  if (!agreement.active) return "Expired";
  const todayIso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
  if (agreement.endDate < todayIso) return "Expired";
  if (agreement.startDate > todayIso) return "Upcoming";

  const endDate = new Date(`${agreement.endDate}T00:00:00Z`);
  const currentDate = new Date(`${todayIso}T00:00:00Z`);
  const daysUntilEnd = Math.round((endDate.getTime() - currentDate.getTime()) / 86_400_000);
  return daysUntilEnd <= 90 ? "Expiring soon" : "Active";
}

/** The status with the date that explains it, e.g. "Expires on 31.12.2026". */
export function agreementStatusText(agreement: FleetAgreement, today = new Date()): string {
  if (!agreement.active) return "Removed";
  const status = getAgreementStatus(agreement, today);
  if (status === "Expired") return `Expired on ${formatDate(agreement.endDate)}`;
  if (status === "Upcoming") return `Starts on ${formatDate(agreement.startDate)}`;
  return `Expires on ${formatDate(agreement.endDate)}`;
}
