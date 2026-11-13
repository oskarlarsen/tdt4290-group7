import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Download, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDrawerFocus } from "../../hooks/useDrawerFocus";
import { StatusBadge } from "../ui/StatusBadge";
import { adminEnergyEvidenceHref, setEnergyCommitment } from "../../api/energy";
import {
  ENERGY_STATUS_LABELS,
  ENERGY_STATUS_TONES,
  formatKwh,
  formatPercent,
  formatSignedKwh,
  MAX_ENERGY_COMMITMENT_KWH,
  isEnergyYearClosed,
} from "../../types/energy";
import type { EnergyContract } from "../../types/energy";

function percentOf(value: number, target: number): number {
  return target > 0 ? (value / target) * 100 : 0;
}

/** A bar for delivered against a commitment. The marker sits at 100% of the commitment. */
function CommitmentBar({ label, delivered, committed, tone }: { label: string; delivered: number; committed: number | null; tone: string }) {
  const percent = committed ? percentOf(delivered, committed) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-neutral-500">{label}</span>
        <span className="font-medium text-neutral-900">
          {formatKwh(delivered)}
          {committed !== null && <span className="font-normal text-neutral-500"> av {formatKwh(committed)}</span>}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(percent))}
        className="mt-1 h-2 w-full rounded bg-neutral-100"
      >
        <div className={`h-2 rounded ${tone}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      {committed !== null && <p className="mt-0.5 text-xs text-neutral-500">{formatPercent(percent)} av forpliktelsen</p>}
    </div>
  );
}

const COMMITMENT_RANGE_MESSAGE = `Oppgi et tall fra 0 til ${MAX_ENERGY_COMMITMENT_KWH.toLocaleString("nb-NO")} kWh.`;

function parseCommitment(text: string): { value: number; valid: boolean; empty: boolean } {
  const empty = text.trim() === "";
  const value = Number(text);
  return { value, empty, valid: !empty && Number.isFinite(value) && value >= 0 && value <= MAX_ENERGY_COMMITMENT_KWH };
}

function CommitmentForm({ row }: { row: EnergyContract }) {
  const queryClient = useQueryClient();
  const [selfKwh, setSelfKwh] = useState(String(row.commitment?.minSelfProducedKwh ?? ""));
  const [gooKwh, setGooKwh] = useState(String(row.commitment?.minGooKwh ?? ""));
  const self = parseCommitment(selfKwh);
  const goo = parseCommitment(gooKwh);
  const save = useMutation({
    mutationFn: () => setEnergyCommitment(row.agreementId, { minSelfProducedKwh: self.value, minGooKwh: goo.value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["energy"] }),
  });
  const inputClass = (invalid: boolean) =>
    `mt-1 w-full rounded-md border bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:ring-2 ${
      invalid ? "border-red-400 focus:border-red-600 focus:ring-red-600/10" : "border-neutral-200 focus:border-primary-900 focus:ring-primary-900/10"
    }`;
  // Editing clears the "Lagret"-meldingen, so it never claims the shown numbers are saved when they are not.
  const edit = (setter: (value: string) => void) => (event: { target: { value: string } }) => {
    save.reset();
    setter(event.target.value);
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (self.valid && goo.valid) save.mutate();
      }}
      className="space-y-2"
    >
      <label className="block text-xs text-neutral-600">
        Forpliktet egenprodusert energi per år (kWh)
        <input type="number" min={0} max={MAX_ENERGY_COMMITMENT_KWH} step="any" inputMode="decimal" value={selfKwh} onChange={edit(setSelfKwh)} aria-invalid={!self.empty && !self.valid} className={inputClass(!self.empty && !self.valid)} />
        {!self.empty && !self.valid && <span role="alert" className="mt-0.5 block text-red-700">{COMMITMENT_RANGE_MESSAGE}</span>}
      </label>
      <label className="block text-xs text-neutral-600">
        Minimum energi dekket av opprinnelsesgarantier (GoO) per år (kWh)
        <input type="number" min={0} max={MAX_ENERGY_COMMITMENT_KWH} step="any" inputMode="decimal" value={gooKwh} onChange={edit(setGooKwh)} aria-invalid={!goo.empty && !goo.valid} className={inputClass(!goo.empty && !goo.valid)} />
        {!goo.empty && !goo.valid && <span role="alert" className="mt-0.5 block text-red-700">{COMMITMENT_RANGE_MESSAGE}</span>}
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!self.valid || !goo.valid || save.isPending}
          className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {save.isPending ? "Lagrer…" : "Lagre forpliktelse"}
        </button>
        {save.isSuccess && <span role="status" className="text-xs text-tertiary-700">Lagret</span>}
        {save.isError && <span role="alert" className="text-xs text-red-700">{save.error instanceof Error ? save.error.message : "Kunne ikke lagre"}</span>}
      </div>
    </form>
  );
}

export function EnergyDetailsDrawer({ row, onClose }: { row: EnergyContract | null; onClose: () => void }) {
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

  const maxQuarterKwh = row ? Math.max(1, ...row.quarterTotals.map((q) => q.selfProducedKwh)) : 1;

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
        aria-label={row ? `Energidetaljer for ${row.supplierName}` : undefined}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col overflow-y-auto border-l border-neutral-100 bg-white shadow-card transition-transform duration-200 sm:max-w-lg ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {row && (
          <>
            <div className="flex items-start justify-between border-b border-neutral-100 p-4">
              <div>
                <h2 className="font-headline text-lg font-semibold text-neutral-900">{row.saksnr ?? "Avtale uten saksnummer"}</h2>
                <p className="mt-0.5 text-sm text-neutral-500">{row.supplierName} · {row.year}</p>
                <div className="mt-1.5">
                  <StatusBadge status={ENERGY_STATUS_TONES[row.status]} label={ENERGY_STATUS_LABELS[row.status]} />
                </div>
              </div>
              <button onClick={onClose} aria-label="Lukk" className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 p-4">
              <Section title="Lovet mot levert">
                {row.reportedQuarters.length === 0 ? (
                  <p className="text-sm text-neutral-500">Leverandøren har ikke rapportert noen kvartaler for {row.year}.</p>
                ) : (
                  <div className="space-y-4">
                    <CommitmentBar label="Egenprodusert fornybar energi" delivered={row.selfProducedKwh} committed={row.commitment?.minSelfProducedKwh ?? null} tone="bg-primary-700" />
                    <CommitmentBar label="Dekket av opprinnelsesgarantier (GoO)" delivered={row.gooCoveredKwh} committed={row.commitment?.minGooKwh ?? null} tone="bg-tertiary-700" />
                    {row.commitment && row.selfProducedDeviationKwh !== null && row.gooDeviationKwh !== null && (
                      <div className="rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-600">
                        <p>Rapporterte kvartaler: {row.reportedQuarters.map((q) => `Q${q}`).join(", ")}.</p>
                        <p>
                          {isEnergyYearClosed(row) ? "Avvik" : "Anslått avvik ved årsslutt"}: egenprodusert {formatSignedKwh(row.selfProducedDeviationKwh)}, opprinnelsesgarantier
                          (GoO) {formatSignedKwh(row.gooDeviationKwh)}.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </Section>

              <Section title="Avtalt forpliktelse">
                <CommitmentForm key={row.agreementId} row={row} />
              </Section>

              {row.quarterTotals.length > 0 && (
                <Section title="Egenprodusert energi per kvartal">
                  <ul className="space-y-1.5">
                    {row.quarterTotals.map((q) => (
                      <li key={q.quarter} className="flex items-center gap-2 text-sm">
                        <span className="w-7 font-mono text-xs text-neutral-500">Q{q.quarter}</span>
                        <div className="h-2 flex-1 rounded bg-neutral-100">
                          <div className="h-2 rounded bg-primary-700" style={{ width: `${(q.selfProducedKwh / maxQuarterKwh) * 100}%` }} />
                        </div>
                        <span className="w-24 text-right text-neutral-900">{formatKwh(q.selfProducedKwh)}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {row.reportedQuarters.length > 0 && (
                <Section title="Bygningstall">
                  <Field label="Total energibruk" value={formatKwh(row.consumedKwh)} />
                  <Field label="Egenprodusert andel av totalen" value={row.selfProducedSharePercent === null ? "—" : formatPercent(row.selfProducedSharePercent)} />
                  <Field label="Energi per m²" value={row.kwhPerSqm === null ? "—" : `${row.kwhPerSqm.toFixed(1)} kWh/m²`} />
                </Section>
              )}

              {row.facilities.length > 0 && (
                <Section title="Per lokasjon">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left font-mono uppercase text-neutral-500">
                          <th scope="col" className="pb-1 pr-2 font-medium">Lokasjon</th>
                          <th scope="col" className="pb-1 pr-2 font-medium">Kvartal</th>
                          <th scope="col" className="pb-1 pr-2 text-right font-medium">Brukt</th>
                          <th scope="col" className="pb-1 pr-2 text-right font-medium">Egenprod.</th>
                          <th scope="col" className="pb-1 text-right font-medium">GoO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.facilities.map((f) => (
                          <tr key={`${f.locationCode}-${f.quarter}`} className="border-t border-neutral-100">
                            <td className="py-1.5 pr-2">
                              <div className="font-medium text-neutral-900">{f.locationCode}</div>
                              <div className="text-neutral-500">{f.address}</div>
                            </td>
                            <td className="py-1.5 pr-2 font-mono text-neutral-700">Q{f.quarter}</td>
                            <td className="py-1.5 pr-2 text-right text-neutral-700">{formatKwh(f.consumedKwh)}</td>
                            <td className="py-1.5 pr-2 text-right text-neutral-700">{formatKwh(f.selfProducedKwh)}</td>
                            <td className="py-1.5 text-right text-neutral-700">{formatKwh(f.gooCoveredKwh)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}

              <Section title="Dokumentasjon fra leverandøren">
                {row.evidence.length === 0 ? (
                  <p className="text-sm text-neutral-500">Ingen målerdata eller skjermbilder er lagt ved for {row.year}.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {row.evidence.map((file) => (
                      <li key={file.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate text-neutral-700">
                          <span className="font-mono text-xs text-neutral-500">Q{file.reportingQuarter} </span>
                          {file.fileName}
                        </span>
                        <a
                          href={adminEnergyEvidenceHref(file.id)}
                          download={file.fileName}
                          aria-label={`Last ned ${file.fileName}`}
                          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-secondary-700 hover:text-secondary-800"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Last ned
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <button
                onClick={() => navigate(`/admin/suppliers?supplierId=${row.supplierId}`)}
                className="inline-flex items-center gap-1 text-sm font-medium text-secondary-700 hover:text-secondary-800"
              >
                Vis leverandør
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
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
