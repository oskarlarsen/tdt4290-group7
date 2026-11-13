import { CERTIFICATE_STANDARD_LABELS, getCertificateStatus } from "../types/certificate";
import type { SupplierWorkspaceData } from "../hooks/useMySupplierOverview";

export type RequiredAction = {
  id: string;
  /** Problem 5 priority: vehicles and energy first, then expired certificates, then certificates about to expire. */
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  to: string;
  linkLabel: string;
};

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** What the supplier still has to do, worked out from what is already stored, in plain language. */
export function buildRequiredActions(data: SupplierWorkspaceData, now: Date = new Date()): RequiredAction[] {
  const actions: RequiredAction[] = [];
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;

  if (!["SUBMITTED", "APPROVED"].includes(data.overview.onboardingStatus)) {
    actions.push({
      id: "submit-onboarding",
      priority: "high",
      title: "Send inn registreringen til vurdering",
      detail: "Kommunen kan ikke begynne oppfølgingen før du har sendt inn opplysningene dine.",
      to: "/supplier/onboarding",
      linkLabel: "Åpne registreringen",
    });
  }

  for (const agreement of data.overview.agreements.filter((a) => a.active)) {
    if (agreement.requiresVehicles && data.vehicles.every((v) => v.agreementId !== agreement.id || !v.listed)) {
      actions.push({
        id: `vehicles-${agreement.id}`,
        priority: "high",
        title: "Rapporter kjøretøyene dine",
        detail: "Denne avtalen krever en liste over kjøretøyene du bruker. Kjøretøy som ikke står på den godkjente kjøretøylisten, markeres.",
        to: "/supplier/onboarding?entity=vehicles",
        linkLabel: "Legg til kjøretøy",
      });
    }
    if (agreement.requiresEnergy) {
      const reported = data.energy.filter((e) => e.agreementId === agreement.id && e.reportingYear === year).map((e) => e.reportingQuarter);
      const dueQuarter = quarter - 1; // a quarter is reported after it has ended
      if (dueQuarter >= 1 && !reported.includes(dueQuarter)) {
        actions.push({
          id: `energy-${agreement.id}-${dueQuarter}`,
          priority: "high",
          title: `Rapporter energi for Q${dueQuarter} ${year}`,
          detail: "Energibruken din sammenlignes med kWh egenprodusert fornybar energi og opprinnelsesgarantier (GoO) som er lovet i avtalen.",
          to: "/supplier/onboarding?entity=energy",
          linkLabel: "Rapporter energi",
        });
      } else if (reported.length === 0 && dueQuarter < 1) {
        actions.push({
          id: `energy-${agreement.id}-first`,
          priority: "medium",
          title: "Rapporter energibruken din",
          detail: "Det er ikke rapportert energi for denne avtalen ennå.",
          to: "/supplier/onboarding?entity=energy",
          linkLabel: "Rapporter energi",
        });
      }
    }
    if (agreement.requiresProducts && data.products.every((p) => p.agreementId !== agreement.id)) {
      actions.push({
        id: `products-${agreement.id}`,
        priority: "medium",
        title: "Rapporter produktene dine",
        detail: "Denne avtalen krever en produktliste.",
        to: "/supplier/onboarding?entity=products",
        linkLabel: "Legg til produkter",
      });
    }
  }

  for (const certificate of data.certificates.filter((c) => !c.archivedAt)) {
    const info = getCertificateStatus(certificate, now);
    const name = CERTIFICATE_STANDARD_LABELS[certificate.standard];
    if (info.status === "expired") {
      actions.push({ id: `cert-${certificate.id}`, priority: "medium", title: `${name} er utløpt`, detail: "Last opp det fornyede sertifikatet.", to: "/supplier/certificates", linkLabel: "Last opp sertifikat" });
    } else if (info.status === "missing-documentation") {
      actions.push({ id: `cert-${certificate.id}`, priority: "medium", title: `${name}: dokumentasjon mangler`, detail: "Utløpsdatoen kunne ikke leses. Last opp en tydeligere kopi.", to: "/supplier/certificates", linkLabel: "Last opp sertifikat" });
    } else if (info.group !== "valid") {
      actions.push({ id: `cert-${certificate.id}`, priority: "low", title: `${name} utløper om ${info.daysRemaining} dager`, detail: "Last opp det fornyede sertifikatet før det utløper.", to: "/supplier/certificates", linkLabel: "Last opp sertifikat" });
    }
  }

  return actions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
