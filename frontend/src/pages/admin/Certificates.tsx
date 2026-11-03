import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useCertificates } from "../../hooks/useCertificates";
import { useContracts } from "../../hooks/useContracts";
import { KpiCard } from "../../components/ui/KpiCard";
import { CertificateTable } from "../../components/certificates/CertificateTable";
import type { CertificateRow } from "../../components/certificates/CertificateTable";
import { CertificateEditDialog } from "../../components/certificates/CertificateEditDialog";
import { CertificateDetailsDrawer } from "../../components/certificates/CertificateDetailsDrawer";
import { CertificateAttentionCard } from "../../components/certificates/CertificateAttentionCard";
import { CertificateUploadDialog } from "../../components/certificates/CertificateUploadDialog";
import { useDeleteCertificate } from "../../hooks/useCertificates";
import { useProcurementContracts } from "../../hooks/useProcurementContracts";
import type { Certificate } from "../../types/certificate";
import {
  CERTIFICATE_STANDARD_LABELS,
  CERTIFICATE_THRESHOLDS,
  getCertificateStatus,
} from "../../types/certificate";
import { downloadCsv, toCsv } from "../../utils/csv";
import { useSearchParams } from "react-router-dom";

type CertificateFilter = "all" | "valid" | "expiring-soon" | "expired";

const FILTERS: { value: CertificateFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "valid", label: "Valid" },
  { value: "expiring-soon", label: "Expiring soon" },
  { value: "expired", label: "Expired" },
];

const PAGE_SIZE = 6; // same as the reference; the logic doesn't assume how many rows exist

// Most urgent first; within a tier, soonest expiry first; undated rows last in their tier.
function compareBySeverity(a: CertificateRow, b: CertificateRow): number {
  const rankA = getCertificateStatus(a.certificate).rank;
  const rankB = getCertificateStatus(b.certificate).rank;
  if (rankA !== rankB) return rankA - rankB;
  const dateA = a.certificate.validUntil;
  const dateB = b.certificate.validUntil;
  if (dateA === dateB) return 0;
  if (dateA === null) return 1;
  if (dateB === null) return -1;
  return dateA.localeCompare(dateB);
}

export default function Certificates() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: certificates, isLoading: certsLoading, isError: certsError } = useCertificates();
  const { data: contracts, isLoading: contractsLoading, isError: contractsError } = useContracts();
  const { data: procurementContracts, isLoading: procurementLoading, isError: procurementError } = useProcurementContracts();
  const removeCertificate = useDeleteCertificate();

  const [statusFilter, setStatusFilter] = useState<CertificateFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingCertificate, setEditingCertificate] = useState<Certificate | null>(null);
  const isUploadOpen = searchParams.get("upload") === "true";

  function setUploadOpen(open: boolean) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (open) next.set("upload", "true");
      else next.delete("upload");
      return next;
    });
  }

  function handleDelete(certificate: Certificate) {
    const supplier = certificate.supplierName ?? "this supplier";
    if (!window.confirm(`Delete the ${certificate.certificateType ?? "certificate"} for ${supplier}? This cannot be undone.`)) {
      return;
    }
    removeCertificate.reset();
    removeCertificate.mutate(certificate.id, {
      onSuccess: () => {
        if (selectedId === certificate.id) setSelectedId(null);
      },
    });
  }

  const rows = useMemo<CertificateRow[]>(() => {
    if (!certificates || !contracts || !procurementContracts) return [];
    const contractById = new Map([
      ...contracts.map((contract) => [contract.id, contract] as const),
      ...procurementContracts.map((contract) => [
        contract.id,
        {
          id: contract.id,
          contractName: contract.name,
          supplierId: contract.supplierId,
          supplierName: contract.supplierName,
          supplierOrgId: contract.supplierOrgNumber,
        },
      ] as const),
    ]);
    return certificates
      .map((certificate) => ({ certificate, contract: contractById.get(certificate.contractId) }))
      .sort(compareBySeverity);
  }, [certificates, contracts, procurementContracts]);

  const counts = useMemo(() => {
    const result: Record<CertificateFilter | "criticalExpired", number> = {
      all: rows.length,
      valid: 0,
      "expiring-soon": 0,
      expired: 0,
      criticalExpired: 0,
    };
    for (const { certificate } of rows) {
      const status = getCertificateStatus(certificate).status;
      if (status === "valid") result.valid += 1;
      else if (status === "expiring" || status === "critical") result["expiring-soon"] += 1;
      else if (status === "expired") result.expired += 1;
      if (status === "critical" || status === "expired" || status === "missing-documentation") {
        result.criticalExpired += 1;
      }
    }
    return result;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter(
        ({ certificate, contract }) => {
          const status = getCertificateStatus(certificate).status;
          const matchesStatus =
            statusFilter === "all" ||
            (statusFilter === "valid" && status === "valid") ||
            (statusFilter === "expiring-soon" && (status === "expiring" || status === "critical")) ||
            (statusFilter === "expired" && status === "expired");
          const matchesSearch =
            query.length === 0 ||
            CERTIFICATE_STANDARD_LABELS[certificate.standard].toLowerCase().includes(query) ||
            (certificate.certificateNumber?.toLowerCase().includes(query) ?? false) ||
            (certificate.supplierName?.toLowerCase().includes(query) ?? false) ||
            (contract?.supplierName.toLowerCase().includes(query) ?? false) ||
            (contract?.supplierOrgId.toLowerCase().includes(query) ?? false) ||
            (contract?.contractName.toLowerCase().includes(query) ?? false);
          return matchesStatus && matchesSearch;
        }
      );
  }, [rows, statusFilter, search]);

  // Back to page 1 when the result set changes shape.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pagedRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);

  if (certsLoading || contractsLoading || procurementLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (certsError || contractsError || procurementError || !certificates || !contracts || !procurementContracts) {
    return <div className="text-sm text-red-700">Couldn't load certificates. Try again.</div>;
  }

  // Every KPI is a direct count over the certificate records.
  const total = certificates.length;
  const contractCount = new Set(certificates.map((c) => c.contractId).filter(Boolean)).size;
  const validPercent = total > 0 ? Math.round((counts.valid / total) * 100) : null;
  const selectedRow = rows.find((r) => r.certificate.id === selectedId) ?? null;

  function handleExport() {
    if (filteredRows.length === 0) return;
    const csv = toCsv(
      filteredRows.map(({ certificate, contract }) => ({
        Supplier: contract?.supplierName ?? certificate.supplierName ?? "",
        "Org ID": contract?.supplierOrgId ?? "",
        Contract: contract?.contractName ?? "",
        Standard: CERTIFICATE_STANDARD_LABELS[certificate.standard],
        "Certificate number": certificate.certificateNumber ?? "",
        "Valid until": certificate.validUntil ?? "",
        Status: getCertificateStatus(certificate).label,
      }))
    );
    downloadCsv(`certificates-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-[#e7e9e7] bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-headline text-2xl font-semibold leading-tight tracking-[-0.04em] text-[#0f172a]">
              Environmental Certificates
            </h1>
            <p className="mt-1.5 max-w-[680px] text-sm leading-6 text-[#5c6773]">
              Validity tracking of environmental certifications held by contracted suppliers, with upcoming expiries and missing documentation.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
          <button
            onClick={handleExport}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export (CSV)
          </button>
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Upload certificate
          </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Certificates tracked"
          value={total}
          sublabel={`across ${contractCount} contract${contractCount === 1 ? "" : "s"}`}
          icon={<ShieldCheck className="h-4 w-4" />}
          iconClassName="bg-primary-100 text-primary-900"
        />
        <KpiCard
          label="Valid"
          value={counts.valid}
          note={validPercent === null ? "No certificates" : `${validPercent}% of tracked certificates`}
          noteTone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
          iconClassName="bg-tertiary-100 text-tertiary-700"
        />
        <KpiCard
          label="Expiring soon"
          value={counts["expiring-soon"]}
          note={`Expiring within ${CERTIFICATE_THRESHOLDS.yellowDays} days`}
          icon={<Clock3 className="h-4 w-4" />}
          iconClassName="bg-amber-100 text-amber-700"
        />
        <KpiCard
          label="Critical / expired"
          value={counts.criticalExpired}
          note={`Expired, undocumented, or ≤${CERTIFICATE_THRESHOLDS.criticalDays} days left`}
          noteTone={counts.criticalExpired > 0 ? "danger" : "success"}
          icon={<AlertTriangle className="h-4 w-4" />}
          iconClassName="bg-red-100 text-red-700"
        />
      </div>

      <section className="rounded-xl border border-neutral-100 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search certificate no., supplier, standard, contract…"
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 py-1.5 pl-9 pr-3 text-xs text-neutral-700 placeholder:text-neutral-400 outline-none focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
            />
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs text-neutral-600">
            <span className="font-medium text-neutral-700">Status:</span>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as CertificateFilter)}
                aria-label="Filter certificates by status"
                className="appearance-none rounded-md border border-neutral-200 bg-white px-2 py-1 pr-7 text-xs font-medium text-neutral-700 outline-none transition-colors focus:border-primary-900 focus:ring-2 focus:ring-primary-900/10"
              >
                {FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
            </div>
          </label>
        </div>

        <CertificateTable
          rows={pagedRows}
          onSelect={(row) => setSelectedId(row.certificate.id)}
          onEdit={setEditingCertificate}
          onDelete={handleDelete}
          emptyMessage={
            certificates.length === 0
              ? "No certificate records available."
              : "No certificates match the current filters."
          }
        />
        {removeCertificate.isError && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {removeCertificate.error instanceof Error
              ? removeCertificate.error.message
              : "Could not delete certificate."}
          </p>
        )}

        <div className="-mx-4 -mb-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-b-xl bg-neutral-50 px-4 py-3">
          <p className="text-xs text-neutral-500">
            {filteredRows.length === 0
              ? "No certificates match the current filters."
              : `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filteredRows.length)} of ${filteredRows.length} certificate${filteredRows.length === 1 ? "" : "s"}`}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <span className="font-mono text-xs text-neutral-400">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Portfolio-wide highlight: the most urgent certificate, regardless of the filters above. */}
      <CertificateAttentionCard rows={rows} onViewDetails={(row) => setSelectedId(row.certificate.id)} />

      <CertificateDetailsDrawer row={selectedRow} onClose={() => setSelectedId(null)} />

      {isUploadOpen && <CertificateUploadDialog contracts={procurementContracts} onClose={() => setUploadOpen(false)} />}
      {editingCertificate && (
        <CertificateEditDialog
          certificate={editingCertificate}
          contracts={procurementContracts}
          onClose={() => setEditingCertificate(null)}
        />
      )}
    </div>
  );
}