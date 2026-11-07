import { getCertificateStatus, type Certificate } from "../types/certificate";
import type { Vehicle } from "../types/vehicle";

/** The vehicle and certificate totals the dashboard shows, counted from stored records. */
export function dashboardTotals(vehicles: Pick<Vehicle, "listed">[], certificates: Pick<Certificate, "validUntil" | "standard">[], now = new Date()) {
  const statuses = certificates.map((certificate) => getCertificateStatus(certificate, now));
  return {
    listedVehicles: vehicles.filter((vehicle) => vehicle.listed).length,
    certificatesTracked: certificates.length,
    expiredCertificates: statuses.filter((info) => info.status === "expired").length,
    certificatesExpiringWithin90Days: statuses.filter((info) => info.daysRemaining !== null && info.daysRemaining >= 0 && info.daysRemaining <= 90).length,
  };
}
