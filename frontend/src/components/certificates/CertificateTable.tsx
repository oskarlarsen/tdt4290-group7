import { Pencil, Trash2 } from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";
import {
  CERTIFICATE_STANDARD_LABELS,
  formatCertificateDate,
  getCertificateStatus,
} from "../../types/certificate";
import type { Certificate } from "../../types/certificate";
import type { CertificateContract } from "../../types/certificate";

// contract is optional: shown "where available" if a certificate's contract can't be found.
export type CertificateRow = { certificate: Certificate; contract?: CertificateContract };

export function CertificateTable({
  rows,
  onSelect,
  onEdit,
  onDelete,
  emptyMessage = "No certificates to show.",
}: {
  rows: CertificateRow[];
  onSelect: (row: CertificateRow) => void;
  onEdit: (certificate: Certificate) => void;
  onDelete: (certificate: Certificate) => void;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <div className="py-8 text-center text-sm text-neutral-400">{emptyMessage}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-mono uppercase tracking-wide text-neutral-400">
            <th className="pb-2 pr-3 font-medium">Supplier &amp; org no.</th>
            <th className="pb-2 pr-3 font-medium">Standard &amp; certificate</th>
            <th className="pb-2 pr-3 font-medium">Contract</th>
            <th className="pb-2 pr-3 font-medium">Valid until</th>
            <th className="pb-2 pr-3 font-medium">Status</th>
            <th className="pb-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { certificate, contract } = row;
            const info = getCertificateStatus(certificate);
            return (
              <tr key={certificate.id} className="border-t border-neutral-100">
                <td className="py-3 pr-3">
                  {contract || certificate.supplierName ? (
                    <>
                      <div className="font-medium text-neutral-900">
                        {contract?.supplierName ?? certificate.supplierName}
                      </div>
                      {contract?.supplierOrgId && (
                        <div className="font-mono text-xs text-neutral-400">{contract.supplierOrgId}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-neutral-400">Contract not found</span>
                  )}
                </td>
                <td className="py-3 pr-3">
                  <div className="font-medium text-neutral-900">
                    {CERTIFICATE_STANDARD_LABELS[certificate.standard]}
                  </div>
                  <div className="font-mono text-xs text-neutral-400">
                    {certificate.certificateNumber ?? "Not extracted"}
                  </div>
                </td>
                <td className="py-3 pr-3 text-neutral-700">{contract?.contractName ?? "Not linked"}</td>
                <td
                  className={`whitespace-nowrap py-3 pr-3 ${
                    info.status === "expired" ? "font-semibold text-red-700" : "text-neutral-700"
                  }`}
                >
                  {certificate.validUntil ? formatCertificateDate(certificate.validUntil) : "—"}
                </td>
                <td className="py-3 pr-3">
                  <StatusBadge status={info.tone} label={info.label} />
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      onClick={() => onSelect(row)}
                      className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                    >
                      View Details
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(certificate)}
                      aria-label={`Edit ${certificate.supplierName ?? "certificate"}`}
                      className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(certificate)}
                      aria-label={`Delete ${certificate.supplierName ?? "certificate"}`}
                      className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}