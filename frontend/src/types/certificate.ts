export type CertificateStandard =
  | "iso-14001"
  | "miljofyrtarn"
  | "emas"
  | "gront-punkt-norge"
  | "retura"
  | "eco-driving-course"
  | "unknown";

// The standards named in the customer's documents.
export const CERTIFICATE_STANDARD_LABELS: Record<CertificateStandard, string> = {
  "iso-14001": "ISO 14001",
  miljofyrtarn: "Miljøfyrtårn",
  emas: "EMAS",
  "gront-punkt-norge": "Grønt Punkt Norge",
  retura: "Retura",
  "eco-driving-course": "Eco-driving course",
  unknown: "Unrecognized certificate",
};

// Certificates belong to contracts. A null validUntil means required documentation is missing;
// contracts with no certificate requirement have no certificate record.
export type Certificate = {
  id: string;
  standard: CertificateStandard;
  certificateNumber: string | null;
  contractId: string;
  validUntil: string | null; // ISO date (YYYY-MM-DD)
  supplierName?: string;
  certificateType?: string;
  issueDate?: string | null;
  sourceFile?: string;
  /** Set when the certificate was archived: kept as history, but it raises no alerts and counts in no risk. */
  archivedAt?: string | null;
};

export type CertificateContract = {
  id: string;
  contractName: string;
  supplierId: string;
  supplierName: string;
  supplierOrgId: string;
  startDate: string;
  endDate: string;
};

export type CertificateStatus =
  | "valid"
  | "expiring"
  | "critical"
  | "expired"
  | "missing-documentation";
export type CertificateStatusGroup = "valid" | "expiring-soon" | "critical-expired";
export type CertificateTone = "red" | "orange" | "yellow" | "tertiary";

// PROVISIONAL thresholds, drawn from the customer's 30/90/180-day and
// 6/3/1-month wording plus the dashboard reference. Confirm before relying on them.
export const CERTIFICATE_THRESHOLDS = {
  criticalDays: 30,
  orangeDays: 90,
  yellowDays: 180,
} as const;

// Miljøfyrtårn and ISO 14001 take months to renew, so they are flagged a year ahead (backend: CertificateTypes).
export const LONG_LEAD_WARNING_DAYS = 365;
const LONG_LEAD_STANDARDS: readonly CertificateStandard[] = ["iso-14001", "miljofyrtarn"];

export type CertificateStatusInfo = {
  status: CertificateStatus;
  group: CertificateStatusGroup;
  daysRemaining: number | null; // negative = days since expiry, null = no date
  tone: CertificateTone;
  label: string;
  rank: number; // lower = more urgent
};

function daysUntil(isoDate: string, now: Date): number {
  const target = new Date(isoDate); // date-only ISO strings parse as UTC
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const expiry = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.round((expiry - today) / 86400000);
}

// Derived, never stored, so it can't drift from the date behind it.
export function getCertificateStatus(
  cert: Pick<Certificate, "validUntil"> & Partial<Pick<Certificate, "standard">>,
  now: Date = new Date()
): CertificateStatusInfo {
  if (cert.validUntil === null) {
    return {
      status: "missing-documentation",
      group: "critical-expired",
      daysRemaining: null,
      tone: "red",
      label: "Documentation missing",
      rank: 0,
    };
  }

  const days = daysUntil(cert.validUntil, now);
  const { criticalDays, orangeDays, yellowDays } = CERTIFICATE_THRESHOLDS;

  if (days < 0) {
    return { status: "expired", group: "critical-expired", daysRemaining: days, tone: "red", label: "Expired", rank: 0 };
  }
  if (days <= criticalDays) {
    // Colour follows the customer's scheme (orange within 3 months); "critical" is
    // the reference's extra label for the last 30 days.
    return { status: "critical", group: "critical-expired", daysRemaining: days, tone: "orange", label: `Critical (${days}d left)`, rank: 1 };
  }
  if (days <= orangeDays) {
    return { status: "expiring", group: "expiring-soon", daysRemaining: days, tone: "orange", label: `Expiring (${days}d)`, rank: 2 };
  }
  if (days <= yellowDays) {
    return { status: "expiring", group: "expiring-soon", daysRemaining: days, tone: "yellow", label: `Expiring (${days}d)`, rank: 2 };
  }
  if (cert.standard && LONG_LEAD_STANDARDS.includes(cert.standard) && days <= LONG_LEAD_WARNING_DAYS) {
    return { status: "expiring", group: "expiring-soon", daysRemaining: days, tone: "yellow", label: `Renew soon (${days}d)`, rank: 2 };
  }
  return { status: "valid", group: "valid", daysRemaining: days, tone: "tertiary", label: "Valid", rank: 3 };
}

export function formatCertificateDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}