export type CertificateStatus =
  | "VALID"
  | "EXPIRES_180D"
  | "EXPIRES_90D"
  | "EXPIRES_30D"
  | "EXPIRED"
  | "MISSING_DOCUMENTATION";

export type Certificate = {
  id: string;
  supplierName: string;
  certificateType: string;
  issueDate: string | null;
  expiryDate: string | null;
  sourceFile: string;
  status: CertificateStatus;
  contractId: string | null;
};
