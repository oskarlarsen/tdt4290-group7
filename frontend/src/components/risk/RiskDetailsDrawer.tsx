import { useEffect } from "react";
import { useDrawerFocus } from "../../hooks/useDrawerFocus";
import { ArrowUpRight, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StatusBadge } from "../ui/StatusBadge";
import { RISK_CATEGORY_ICONS } from "./riskCategoryIcons";
import { RISK_INDICATOR_KIND_LABELS, RISK_PRIORITY_INFO } from "../../types/riskOutlook";
import { formatCertificateDate } from "../../types/certificate";
import type { RiskIndicator, RiskIndicatorCategory, RiskOutlookRow } from "../../types/riskOutlook";
import type { SupplierRisk } from "../../types/dashboard";

const SUPPLIER_RISK_LABELS: Record<SupplierRisk, string> = {
  unassessed: "Not yet assessed",
  high: "High",
  medium: "Medium",
  compliant: "Compliant",
};

const INDICATOR_LINKS: Record<
  RiskIndicatorCategory,
  { label: string; path: (contractId: string) => string }
> = {
  vehicle: { label: "View vehicles", path: (id) => `/admin/vehicles?contractId=${id}` },
  energy: { label: "View energy data", path: () => "/admin/energy" },
  certificate: { label: "View certificates", path: () => "/admin/certificates" },
};

const PRIORITY_TONES = RISK_PRIORITY_INFO;

export function RiskDetailsDrawer({
  row,
  onClose,
}: {
  row: RiskOutlookRow | null;
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

  const contract = row?.contract;
  const info = row ? PRIORITY_TONES[row.priority] : null;

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
        aria-label={contract ? `${contract.supplierName} risk details` : undefined}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-y-auto border-l border-neutral-100 bg-white shadow-card transition-transform duration-200 sm:max-w-md ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {row && contract && info && (
          <>
            <div className="flex items-start justify-between border-b border-neutral-100 p-4">
              <div>
                <h2 className="font-headline text-lg font-semibold text-neutral-900">
                  {contract.supplierName}
                </h2>
                <p className="mt-0.5 text-sm text-neutral-500">{contract.contractName}</p>
                <div className="mt-1.5">
                  <StatusBadge status={info.tone} label={`${info.label} priority`} />
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 p-4">
              <Section title={`Risk indicators (${row.indicators.length})`}>
                {row.indicators.length === 0 ? (
                  <p className="text-sm text-neutral-500">
                    No risk indicators on record for this contract.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {row.indicators.map((indicator) => (
                      <IndicatorCard
                        key={indicator.id}
                        indicator={indicator}
                        onOpen={(path) => navigate(path)}
                      />
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Not calculated yet">
                <p className="text-sm text-neutral-500">
                  Trend-based predictions (energy consumption and fuel-distribution trends) need
                  several periods of historical statistics. Only one period of demo data exists, so
                  none are calculated. No probabilities or scores are shown for the same reason.
                </p>
              </Section>

              <Section title="Contract & supplier">
                <Field label="Contract" value={contract.contractName} />
                <Field label="Supplier" value={contract.supplierName} />
                <Field label="Org ID" value={contract.supplierOrgId} />
                <Field label="Supplier risk badge" value={SUPPLIER_RISK_LABELS[contract.risk]} />
                <p className="mt-1 text-xs text-neutral-500">
                  The supplier risk badge shown on other pages is the supplier's stored assessment. It is not
                  derived from the indicators above, so the two can differ.
                </p>
                <button
                  onClick={() => navigate(`/admin/suppliers?supplierId=${contract.supplierId}`)}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-secondary-700 hover:text-secondary-800"
                >
                  View supplier
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </Section>

              <p className="rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-500">
                Demo data. Indicators are calculated in the browser from fictional vehicle,
                certificate and energy records. No prediction model, historical dataset or backend
                job exists.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function IndicatorCard({
  indicator,
  onOpen,
}: {
  indicator: RiskIndicator;
  onOpen: (path: string) => void;
}) {
  const Icon = RISK_CATEGORY_ICONS[indicator.category];
  const priority = RISK_PRIORITY_INFO[indicator.priority];
  const link = INDICATOR_LINKS[indicator.category];

  return (
    <div className="rounded-lg bg-neutral-50 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
          <div>
            <div className="text-sm font-medium text-neutral-900">{indicator.title}</div>
            <div className="text-[11px] font-mono uppercase tracking-wide text-neutral-500">
              {RISK_INDICATOR_KIND_LABELS[indicator.kind]}
            </div>
          </div>
        </div>
        <StatusBadge status={priority.tone} label={priority.label} />
      </div>
      <p className="mt-1.5 text-sm text-neutral-600">{indicator.detail}</p>
      {indicator.date && (
        <p className="mt-1 text-xs text-neutral-500">
          {indicator.kind === "predicted" ? "Projected breach date" : "Lapsed on"}:{" "}
          {formatCertificateDate(indicator.date)}
        </p>
      )}
      <button
        onClick={() => onOpen(link.path(indicator.contractId))}
        className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-secondary-700 hover:text-secondary-800"
      >
        {link.label}
        <ArrowUpRight className="h-3 w-3" />
      </button>
    </div>
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