import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Mail } from "lucide-react";
import { NoticeReviewDialog } from "../ui/NoticeReviewDialog";
import { useSendSupplierNotice } from "../../hooks/useSupplierNotices";
import {
  CERTIFICATE_STANDARD_LABELS,
  formatCertificateDate,
  getCertificateStatus,
} from "../../types/certificate";
import type { CertificateRow } from "./CertificateTable";

function buildNoticeMessage(row: CertificateRow): string {
  const { certificate, contract } = row;
  const status = getCertificateStatus(certificate);
  const standard = CERTIFICATE_STANDARD_LABELS[certificate.standard];
  const certificateDescription = `${standard} certificate${
    certificate.certificateNumber ? ` (${certificate.certificateNumber})` : ""
  }`;
  const contractDescription = contract?.contractName
    ? ` for "${contract.contractName}"`
    : "";

  if (status.status === "expired") {
    const expiryDate = certificate.validUntil
      ? `, which expired on ${formatCertificateDate(certificate.validUntil)}`
      : "";
    return `Please provide an updated copy of the expired ${certificateDescription}${expiryDate}${contractDescription} and confirm when the renewal will be completed.`;
  }

  if (status.status === "missing-documentation") {
    return `Please provide the missing ${certificateDescription} documentation${contractDescription} and confirm when it will be available.`;
  }

  if (status.status === "critical" || status.status === "expiring") {
    const expiryDate = certificate.validUntil
      ? ` on ${formatCertificateDate(certificate.validUntil)}`
      : "";
    const daysRemaining =
      status.status === "critical" && status.daysRemaining !== null
        ? ` (${status.daysRemaining} days remaining)`
        : "";
    return `Please provide an update on the renewal of the ${certificateDescription}${contractDescription}, which is approaching expiry${expiryDate}${daysRemaining}, and confirm the planned next steps.`;
  }

  return `Please review the ${certificateDescription}${contractDescription} and provide an update on any actions needed to maintain its validity.`;
}

// Built only from real fields of the most urgent certificate. Legal citations and
// penalty language from the visual reference were deliberately not reproduced.
export function CertificateAttentionCard({
  rows,
  onViewDetails,
}: {
  rows: CertificateRow[];
  onViewDetails: (row: CertificateRow) => void;
}) {
  const [isNoticeInfoOpen, setIsNoticeInfoOpen] = useState(false);
  const [isNoticeRecorded, setIsNoticeRecorded] = useState(false);
  const [noticeMessageDraft, setNoticeMessageDraft] = useState("");
  const [activeAttentionIndex, setActiveAttentionIndex] = useState(0);

  const seenContractIds = new Set<string>();
  const attentionRows = rows.filter(({ certificate }) => {
    if (getCertificateStatus(certificate).group === "valid") return false;
    const key = certificate.contractId || certificate.id;
    if (seenContractIds.has(key)) return false;
    seenContractIds.add(key);
    return true;
  });
  const safeAttentionIndex = Math.min(activeAttentionIndex, attentionRows.length - 1);
  const row = attentionRows[safeAttentionIndex];

  const sendNotice = useSendSupplierNotice(row?.contract?.supplierId ?? null);

  useEffect(() => {
    setActiveAttentionIndex(0);
  }, [rows]);

  useEffect(() => {
    if (!isNoticeRecorded) return;
    const timeout = window.setTimeout(() => setIsNoticeRecorded(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [isNoticeRecorded]);

  if (!row) return null;

  const { certificate, contract } = row;
  const info = getCertificateStatus(certificate);

  const standard = CERTIFICATE_STANDARD_LABELS[certificate.standard];
  const supplierName = contract?.supplierName ?? certificate.supplierName ?? "Unknown supplier";
  const contractName = contract?.contractName ?? "an unknown contract";
  const days = Math.abs(info.daysRemaining ?? 0);

  const title =
    info.status === "expired"
      ? "Certificate lapsed"
      : info.status === "missing-documentation"
        ? "Certificate documentation missing"
        : "Certificate expiring soon";

  const description =
    info.status === "expired"
      ? `${standard} expired on ${formatCertificateDate(certificate.validUntil!)} (${days} day${days === 1 ? "" : "s"} ago) for contract "${contractName}".`
      : info.status === "missing-documentation"
        ? `${standard} is required for contract "${contractName}", but no documentation has been submitted.`
        : `${standard} expires on ${formatCertificateDate(certificate.validUntil!)} (in ${days} day${days === 1 ? "" : "s"}) for contract "${contractName}".`;

  const noticeReason =
    info.status === "expired"
      ? "The certificate has expired."
      : info.status === "missing-documentation"
        ? "Required certificate documentation is missing."
        : info.status === "critical"
          ? "The certificate expires within 30 days."
          : contract?.risk === "high"
            ? "Environmental compliance is non-compliant."
            : contract?.risk === "medium"
              ? "Environmental compliance is partial and requires follow-up."
              : "The certificate is expiring soon.";

  return (
    <>
      <div className="rounded-xl border border-neutral-100 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide text-red-700">
                Active attention
              </span>
              <span className="font-headline text-sm font-semibold text-neutral-900">
                {title} ({supplierName})
              </span>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-neutral-600">{description}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <button
              onClick={() => {
                setIsNoticeRecorded(false);
                setNoticeMessageDraft(buildNoticeMessage(row));
                setIsNoticeInfoOpen(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800"
            >
              <Mail className="h-3.5 w-3.5" />
              Send Notice
            </button>
            <button
              onClick={() => onViewDetails(row)}
              className="rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              View Details
            </button>
          </div>
        </div>

        <div className="-mx-4 -mb-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-b-xl bg-neutral-50 px-4 py-3">
          <p className="text-xs text-neutral-500">
            Showing {safeAttentionIndex + 1} of {attentionRows.length} contracts requiring attention
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveAttentionIndex((index) => Math.max(0, index - 1))}
              disabled={safeAttentionIndex <= 0}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <span className="font-mono text-xs text-neutral-400">
              Page {safeAttentionIndex + 1} of {attentionRows.length}
            </span>
            <button
              type="button"
              onClick={() =>
                setActiveAttentionIndex((index) => Math.min(attentionRows.length - 1, index + 1))
              }
              disabled={safeAttentionIndex >= attentionRows.length - 1}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {isNoticeInfoOpen && (
        <NoticeReviewDialog
          contractName={contract?.contractName ?? "Unknown contract"}
          supplierName={contract?.supplierName ?? "Unknown supplier"}
          reason={noticeReason}
          message={noticeMessageDraft}
          onMessageChange={setNoticeMessageDraft}
          onCancel={() => setIsNoticeInfoOpen(false)}
          onConfirm={() => {
            sendNotice.mutate({
              title: title,
              message: noticeMessageDraft
            }, {
              onSuccess: () => {
                setIsNoticeInfoOpen(false);
                setIsNoticeRecorded(true);
              }
            });
          }}
        />
      )}

      {isNoticeRecorded && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-card"
        >
          Notice recorded successfully.
        </div>
      )}
    </>
  );
}