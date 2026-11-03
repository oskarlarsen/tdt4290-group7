import { apiFetch } from "./client";

export type ProcurementContract = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierOrgNumber: string;
  name: string;
  reference: string;
  startDate: string;
  endDate: string;
};

export type ContractCsvRow = {
  row: number;
  name: string;
  reference: string;
  startDate: string;
  endDate: string;
};

export type ContractCsvIssue = { row: number; field: string; message: string };
export type ContractCsvPreview = { validRows: ContractCsvRow[]; issues: ContractCsvIssue[] };
export type ContractCsvImportResult = { imported: number; contracts: ProcurementContract[] };

export function getProcurementContracts() {
  return apiFetch<ProcurementContract[]>("/procurement/contracts");
}

export function previewContractCsv(supplierId: string, csv: string) {
  return apiFetch<ContractCsvPreview>("/procurement/contracts/preview", {
    method: "POST",
    body: JSON.stringify({ supplierId, csv }),
  });
}

export function importContractCsv(supplierId: string, csv: string) {
  return apiFetch<ContractCsvImportResult>("/procurement/contracts/import", {
    method: "POST",
    body: JSON.stringify({ supplierId, csv }),
  });
}
