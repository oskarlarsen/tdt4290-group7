import { useEffect } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StatusBadge } from "../ui/StatusBadge";
import { getEnergyStatusLabel } from "./energyFilters";
import {
  ENERGY_CARRIER_LABELS,
  ENERGY_THRESHOLDS,
  formatKwh,
  formatPercent,
} from "../../types/energy";
import type { EnergyAnalysis, EnergyCarrier } from "../../types/energy";
import type { EnergyRow } from "./EnergyTable";

const CARRIERS: EnergyCarrier[] = ["electric", "biogas", "fossil"];

function describeResult(a: EnergyAnalysis): string {
  if (a.status === "compliant") {
    return `Meets the contract minimum (${formatPercent(a.renewableSharePercent)} vs ${formatPercent(a.minRenewableSharePercent)} required).`;
  }
  return `Renewable share is ${a.shortfallPoints.toFixed(1)} percentage points below the contract minimum.`;
}

export function EnergyDetailsDrawer({
  row,
  onClose,
}: {
  row: EnergyRow | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const isOpen = row !== null;

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

  const record = row?.record;
  const contract = row?.contract;
  const analysis = row?.analysis;

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
        role="dialog"
        aria-modal="true"
        aria-label={contract ? `${contract.contractName} energy details` : undefined}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-y-auto border-l border-neutral-100 bg-white shadow-card transition-transform duration-200 sm:max-w-md ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {record && analysis && row && (
          <>
            <div className="flex items-start justify-between border-b border-neutral-100 p-4">
              <div>
                <h2 className="font-headline text-lg font-semibold text-neutral-900">
                  {contract?.contractName ?? "Energy record"}
                </h2>
                {contract && <p className="mt-0.5 text-sm text-neutral-500">{contract.supplierName}</p>}
                <div className="mt-1.5">
                  <StatusBadge status={analysis.tone} label={getEnergyStatusLabel(analysis.status)} />
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 p-4">
              <Section title={`Energy mix · ${record.period}`}>
                {CARRIERS.map((carrier) => (
                  <Field
                    key={carrier}
                    label={ENERGY_CARRIER_LABELS[carrier]}
                    value={`${formatKwh(record.consumptionKwh[carrier])} · ${Math.round(analysis.shares[carrier])}%`}
                  />
                ))}
                <Field label="Total" value={formatKwh(analysis.totalKwh)} />
                <p className="mt-1 text-xs text-neutral-400">
                  All carriers are shown as energy (kWh). Renewable = electric + biogas.
                </p>
              </Section>

              <Section title="Contract requirement">
                <Field label="Minimum renewable share" value={formatPercent(analysis.minRenewableSharePercent)} />
                <Field label="Maximum fossil share" value={formatPercent(analysis.maxFossilSharePercent)} />
              </Section>

              <Section title="Result">
                <p className="text-sm text-neutral-700">{describeResult(analysis)}</p>
                {analysis.fossilExcessKwh > 0 && (
                  <p className="mt-1 text-sm text-red-700">
                    Fossil energy above the contractual limit: {formatKwh(analysis.fossilExcessKwh)}.
                  </p>
                )}
                <p className="mt-1 text-xs text-neutral-400">
                  Minor deviation = within {ENERGY_THRESHOLDS.minorDeviationPoints} percentage points of
                  the minimum (provisional threshold).
                </p>
              </Section>

              <Section title="Contract & supplier">
                {contract ? (
                  <>
                    <Field label="Contract" value={contract.contractName} />
                    <Field label="Supplier" value={contract.supplierName} />
                    <Field label="Org ID" value={contract.supplierOrgId} />
                    <button
                      onClick={() => navigate(`/admin/suppliers?supplierId=${contract.supplierId}`)}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-secondary-700 hover:text-secondary-800"
                    >
                      View supplier
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-neutral-400">Contract not found for this record.</p>
                )}
              </Section>

              <p className="rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-500">
                Demo data. Consumption and requirements are fictional. Supplier quarterly statistics and
                contract requirements (Mercell) aren't connected, so nothing here reflects a real
                submission or verification.
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
      <h3 className="text-xs font-mono uppercase tracking-wide text-neutral-400">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-neutral-400">{label}</span>
      <span className="text-right font-medium text-neutral-900">{value}</span>
    </div>
  );
}