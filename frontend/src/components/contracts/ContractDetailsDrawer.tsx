import { useEffect } from "react";
import { useDrawerFocus } from "../../hooks/useDrawerFocus";
import { X, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { FleetAgreement, FleetSupplier } from "../../types/vehicle";
import { agreementLabel } from "../../utils/agreementLabel";
import { agreementStatusText, getAgreementStatus } from "../../utils/agreementStatus";
import { formatDate } from "../../utils/formatDate";

type Props = {
  agreement: FleetAgreement | null;
  supplier: FleetSupplier | null;
  onClose: () => void;
};

const STATUS_LABELS = {
  Expired: "Utløpt",
  "Expiring soon": "Utløper snart",
  Upcoming: "Kommende",
  Active: "Aktiv",
} as const;

const STATUS_CLASSES = {
  Expired: "bg-red-100 text-red-700",
  "Expiring soon": "bg-amber-100 text-amber-800",
  Upcoming: "bg-blue-100 text-blue-700",
  Active: "bg-tertiary-100 text-tertiary-700",
} as const;

export function ContractDetailsDrawer({ agreement, supplier, onClose }: Props) {
  const navigate = useNavigate();
  const isOpen = agreement !== null && supplier !== null;
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

  const requested = agreement
    ? [agreement.requiresVehicles && "Kjøretøy", agreement.requiresEnergy && "Energi", agreement.requiresProducts && "Produkter"].filter(Boolean).join(", ")
    : "";
  const status = agreement ? getAgreementStatus(agreement) : null;

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden={!isOpen}
        className={`fixed inset-0 z-40 bg-neutral-900/30 transition-opacity ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />

      <div
        ref={drawerRef}
        tabIndex={-1}
        inert={!isOpen}
        role="dialog"
        aria-modal="true"
        aria-label={agreement ? `Detaljer for ${agreementLabel(agreement)}` : undefined}
        aria-hidden={!isOpen}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-y-auto border-l border-neutral-100 bg-white shadow-card transition-transform duration-200 sm:max-w-md ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        {agreement && supplier && status && (
          <>
            <div className="flex items-start justify-between border-b border-neutral-100 p-4">
              <div>
                <h2 className="font-headline text-lg font-semibold text-neutral-900">{agreementLabel(agreement)}</h2>
                <span className={`mt-1.5 inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}>
                  {agreementStatusText(agreement)}
                </span>
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
              <Section title="Avtale">
                <Field label="Saksnr" value={agreement.saksnr?.trim() || "Saksnr mangler"} />
                {agreement.note.trim() && <Field label="Notat" value={agreement.note.trim()} />}
                <Field label="Status" value={STATUS_LABELS[status]} />
                <Field label="Startdato" value={formatDate(agreement.startDate)} />
                <Field label="Sluttdato" value={formatDate(agreement.endDate)} />
                <Field label="Maks. antall kjøretøy" value={String(agreement.allowedVehicles)} />
                <Field label="Informasjon fra leverandør" value={requested || "Ingen"} />
              </Section>

              <Section title="Tilknyttet leverandør">
                <Field label="Leverandør" value={supplier.name} />
                <Field label="Org.nr." value={supplier.orgNumber} />
                <button
                  onClick={() => navigate(`/admin/suppliers?supplierId=${supplier.id}`)}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-secondary-700 hover:text-secondary-800"
                >
                  Vis tilknyttet leverandør
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </Section>
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
    <div className="flex items-start justify-between gap-4 py-1 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium text-neutral-900">{value}</span>
    </div>
  );
}
