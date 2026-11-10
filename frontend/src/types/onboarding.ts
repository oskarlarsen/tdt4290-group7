export type OnboardingStatus =
  | "INVITED"
  | "PROFILE_PENDING"
  | "DATA_DRAFT"
  | "VALIDATING"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REVISION_REQUIRED";

export type OnboardingStep = {
  stepKey: string;
  title: string;
  isCompleted: boolean;
  detail: string | null;
};

export type OnboardingStatusResponse = {
  supplierId: string;
  status: OnboardingStatus;
  steps: OnboardingStep[];
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  reviewerNotes: string | null;
  requiredEntities: Array<"VEHICLES" | "ENERGY" | "PRODUCTS">;
  canSubmit: boolean;
};

export type SupplierProfileResponse = {
  supplierId: string;
  name: string;
  orgNumber: string;
  status: OnboardingStatus;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewerNotes: string | null;
  updatedAt: string;
};

export type SupplierOverview = {
  supplierId: string;
  supplierName: string;
  orgNumber: string;
  onboardingStatus: OnboardingStatus;
  agreements: Array<{
    id: string;
    note: string;
    saksnr: string | null;
    startDate: string;
    endDate: string;
    allowedVehicles: number;
    activeVehiclesCount: number;
    active: boolean;
    requiresVehicles: boolean;
    requiresEnergy: boolean;
    requiresProducts: boolean;
  }>;
  totalVehicles: number;
  totalCertificates: number;
  totalEnergyRecords: number;
  totalProducts: number;
};

export type CsvPreview = {
  batchId: string;
  entityType: "VEHICLES" | "ENERGY" | "PRODUCTS";
  fileName: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  canCommit: boolean;
  errors: Array<{
    row: number;
    column: string;
    message: string;
    value: string | null;
  }>;
  previewRows: Array<Record<string, string>>;
};

export type CsvConfirmation = {
  batchId: string;
  entityType: "VEHICLES" | "ENERGY" | "PRODUCTS";
  importedRows: number;
  message: string;
};
