// Decimal JSON numbers are decoded as strings by the vehicle API client to avoid IEEE-754 rounding.
export type Decimal = string;
export type ApprovalStatus = "ACTIVE" | "NOT_YET_ACTIVE" | "EXPIRED" | "REVOKED" | "NOT_APPROVED";
export type DataSource = "LIVE" | "CACHE" | "STALE_CACHE" | "UNAVAILABLE";
export type Vehicle = { registrationNumber: string; supplierId?: string | null; createdAt: string };
export type ApprovalInput = {
  registrationNumber: string; fuelTechnology?: string | null; usedThroughoutPeriod?: boolean | null;
  startDate?: string | null; expiryDate?: string | null; vehicleGroup?: string | null;
};
export type StoredApproval = {
  id: string; registrationNumber: string; sourceName?: string | null; createdAt: string;
  updatedAt: string; revokedAt?: string | null; data: ApprovalInput;
};
export type TripData = {
  registrationNumber: string; periodStart: string; periodEnd: string;
  fuelTechnology?: string | null; make?: string | null; vehicleType?: string | null; model?: string | null;
  co2Registered?: boolean | null; co2GramsPerKm?: Decimal | null; medianCo2?: Decimal | null;
  totalTripKm?: Decimal | null; totalKmCo2Registered?: Decimal | null; totalKmCo2NotRegistered?: Decimal | null;
  kmFuelNotRegistered?: Decimal | null; totalKmFuelRegistered?: Decimal | null;
  totalKmNoxRegistered?: Decimal | null; totalNoxRegisteredGrams?: Decimal | null;
  tripCount?: number | null; assignmentNumber?: string | null;
  averageConsumptionLitresPerKm?: Decimal | null; fuelConsumedLitres?: Decimal | null; comment?: string | null;
};
export type TripRow = { id: string; registrationNumber: string; sourceName?: string | null; createdAt: string; data: TripData; estimatedCo2Kg?: Decimal | null };
export type RegistryCode = { code: string; name?: string | null };
export type RegistryData = {
  registrationNumber: string; registrationStatus?: string | null; make?: string | null; model?: string | null;
  vehicleCategory?: RegistryCode | null; hybridCategory?: RegistryCode | null; euroClass?: RegistryCode | null;
  fuels: { fuelTechnology?: RegistryCode | null; measurements: {
    measurementMethod?: RegistryCode | null; co2GramsPerKm?: Decimal | null; noxMgPerKm?: Decimal | null;
  }[] }[];
};
export type Snapshot = { id: string; fetchedAt: string; source: string; data: RegistryData };
export type CheckSummary = {
  id: string; checkedAt: string; approvalStatus: ApprovalStatus; dataSource: DataSource;
  lookupOutcome: string; fetchedAt?: string | null; refreshFailure?: string | null; deviations: string[];
};
export type VehicleCheck = {
  id: string; checkedAt: string; vehicle: Vehicle; approvalStatus: ApprovalStatus;
  approval?: StoredApproval | null; tripRows: TripRow[]; deviations: string[];
  registry: { dataSource: DataSource; lookupOutcome: string; fetchedAt?: string | null;
    refreshFailure?: string | null; registrationStatus?: string | null; data?: RegistryData | null;
    deviations: string[]; usageProhibitionState: "UNKNOWN" };
};
export type VehicleOverview = { vehicle: Vehicle; approvalStatus: ApprovalStatus; approval?: StoredApproval | null; latestCheck?: CheckSummary | null };
export type VehicleList = { items: VehicleOverview[]; total: number; page: number; pageSize: number; approvalAsOf: string };
export type VehicleDetails = VehicleOverview & { approvalAsOf: string; tripRows: TripRow[]; latestSnapshot?: Snapshot | null };
export type CheckHistory = { items: CheckSummary[]; total: number; page: number; pageSize: number };
