import { useEffect } from "react";
import { useDrawerFocus } from "../../hooks/useDrawerFocus";
import { X, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StatusBadge } from "../ui/StatusBadge";
import {
  CERTIFICATE_STANDARD_LABELS,
  CERTIFICATE_THRESHOLDS,
  formatCertificateDate,
  getCertificateStatus,
} from "../../types/certificate";
import type { CertificateStatusInfo } from "../../types/certificate";
import type { CertificateRow } from "./CertificateTable";

function describeStatus(info: CertificateStatusInfo): string {
  const days = info.daysRemaining ?? 0;
  switch (info.status) {
    case "missing-documentation":
      return "Kreves av avtalen, men ingen sertifikatdokumentasjon er levert.";
    case "expired":
      return `Utløp for ${Math.abs(days)} ${Math.abs(days) === 1 ? "dag" : "dager"} siden.`;
    case "critical":
    case "expiring":
      return days === 0 ? "Utløper i dag." : `Utløper om ${days} ${days === 1 ? "dag" : "dager"}.`;
    case "valid":
      return `Gyldig i ${days} dager til.`;
  }
}

export function CertificateDetailsDrawer({
  row,
  onClose,
}: {
  row: CertificateRow | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const isOpen = row !== null;
  const drawerRef = useDrawerFocus(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  const certificate = row?.certificate;
  const contract = row?.contract;
  const info = certificate ? getCertificateStatus(certificate) : null;

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden={!isOpen}
        className={`fixed inset-0 z-40 bg-neutral-900/30 transition-opacity ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        ref={drawerRef}
        tabIndex={-1}
        inert={!isOpen}
        role="dialog"
        aria-modal="true"
        aria-label={certificate ? `Detaljer for ${CERTIFICATE_STANDARD_LABELS[certificate.standard]}` : undefined}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-y-auto border-l border-neutral-100 bg-white shadow-card transition-transform duration-200 sm:max-w-md ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {certificate && info && (
          <>
            <div className="flex items-start justify-between border-b border-neutral-100 p-4">
              <div>
                <h2 className="font-headline text-lg font-semibold text-neutral-900">
                  {CERTIFICATE_STANDARD_LABELS[certificate.standard]}
                </h2>
                <div className="mt-1.5">
                  <StatusBadge status={info.tone} label={info.label} />
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Lukk"
                className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 p-4">
              <Section title="Sertifikat">
                <Field label="Standard" value={CERTIFICATE_STANDARD_LABELS[certificate.standard]} />
                <Field label="Sertifikatnr." value={certificate.certificateNumber ?? "Ingen nummer registrert"} />
                <Field
                  label="Gyldig til"
                  value={certificate.validUntil ? formatCertificateDate(certificate.validUntil) : "Ikke levert"}
                />
                {certificate.issueDate && (
                  <Field label="Utstedt" value={formatCertificateDate(certificate.issueDate)} />
                )}
                {certificate.sourceFile && <Field label="Kildefil" value={certificate.sourceFile} />}
              </Section>

              <Section title="Status">
                <p className="text-sm text-neutral-700">{describeStatus(info)}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Beregnet ut fra gyldig-til-datoen. Midlertidige terskler: kritisk innen{" "}
                  {CERTIFICATE_THRESHOLDS.criticalDays} dager, utløper innen{" "}
                  {CERTIFICATE_THRESHOLDS.yellowDays} dager.
                </p>
              </Section>

              <Section title="Avtale og leverandør">
                {contract ? (
                  <>
                    <Field label="Avtale" value={contract.contractName} />
                    <Field label="Leverandør" value={contract.supplierName} />
                    <Field label="Org.nr." value={contract.supplierOrgId} />
                    <button
                      onClick={() => navigate(`/admin/suppliers?supplierId=${contract.supplierId}`)}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-secondary-700 hover:text-secondary-800"
                    >
                      Vis leverandør
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <Field label="Leverandør" value={certificate.supplierName ?? "Ikke registrert"} />
                )}
              </Section>

              <p className="rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-500">
                Kontroller de uthentede opplysningene før du bruker dem som dokumentasjon. Den opprinnelige PDF-en lagres ikke.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-mono uppercase tracking-wide text-neutral-500">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium text-neutral-900">{value}</span>
    </div>
  );
}