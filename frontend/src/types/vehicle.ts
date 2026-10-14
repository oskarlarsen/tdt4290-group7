// Decimal JSON numbers are decoded as strings by the vehicle API client to avoid IEEE-754 rounding.
import type { BodyType, FuelTechnology, VehicleCategory } from "../utils/vehicleCatalog";
export type Decimal = string;
export type ApprovalStatus = "ACTIVE" | "NOT_YET_ACTIVE" | "EXPIRED" | "REVOKED" | "NOT_APPROVED";
export type DataSource = "LIVE" | "CACHE" | "STALE_CACHE" | "UNAVAILABLE";
export type Vehicle = { registrationNumber: string; supplierId?: string | null; createdAt: string };
export type ApprovalInput = {
  registrationNumber: string; fuelTechnology: FuelTechnology; vehicleCategory: VehicleCategory;
  startDate?: string | null; expiryDate?: string | null;
};
export type StoredApproval = {
  id: string; registrationNumber: string; sourceName?: string | null; createdAt: string;
  updatedAt: string; revokedAt?: string | null; data: ApprovalInput;
};
export type TripData = {
  registrationNumber: string; periodStart: string; periodEnd: string;
  fuelTechnology: FuelTechnology; vehicleCategory: VehicleCategory; bodyType: BodyType; make: string; model: string;
  co2Registered: boolean; co2GramsPerKm: Decimal | null; medianCo2: Decimal | null;
  totalTripKm: Decimal; totalKmCo2Registered: Decimal | null; totalKmCo2NotRegistered: Decimal;
  kmFuelNotRegistered: Decimal; totalKmFuelRegistered: Decimal;
  totalKmNoxRegistered: Decimal | null; totalNoxRegisteredGrams: Decimal | null;
  tripCount: number;
  averageFuelConsumptionLitresPer100Km?: Decimal | null; fuelConsumedLitres?: Decimal | null; comment?: string | null;
};
export type TripRow = { id: string; registrationNumber: string; sourceName?: string | null; createdAt: string; data: TripData; estimatedCo2Kg: Decimal | null };
export type RegistryCode = { code: string; name?: string | null };
export type RegistryData = {
  registrationNumber: string; registrationStatus?: string | null; make?: string | null; model?: string | null;
  vehicleCategory?: RegistryCode | null; bodyType?: RegistryCode | null; euroClass?: RegistryCode | null;
  fuels: { fuelTechnology?: RegistryCode | null; measurements: {
    measurementMethod?: RegistryCode | null; co2GramsPerKm?: Decimal | null; noxMgPerKm?: Decimal | null;
  }[] }[];
};
export type Snapshot = { id: string; fetchedAt: string; source: string; data: RegistryData };
export type CheckSummary = {
  id: string; checkedAt: string; approvalStatus: ApprovalStatus; dataSource: DataSource;
  lookupOutcome: string; fetchedAt?: string | null; refreshFailure?: string | null; deviations: string[];
  highPriorityCount?: number; moderatePriorityCount?: number;
};
export type DeviationFinding = {
  code: string; priority: "MODERATE" | "HIGH"; origin: "APPROVAL" | "REGISTRY" | "STATISTICS"; description: string;
  tripRowId?: string | null; relatedTripRowId?: string | null; approvalId?: string | null; relatedApprovalId?: string | null;
  fuelIndex?: number | null; measurementIndex?: number | null;
};
export type VehicleCheck = {
  id: string; checkedAt: string; vehicle: Vehicle; approvalStatus: ApprovalStatus;
  approval?: StoredApproval | null; tripRows: TripRow[]; deviations: string[];
  approvals: StoredApproval[]; findings: DeviationFinding[];
  registry: { dataSource: DataSource; lookupOutcome: string; fetchedAt?: string | null;
    refreshFailure?: string | null; registrationStatus?: string | null; data?: RegistryData | null;
    deviations: string[]; usageProhibitionState: "UNKNOWN" };
};
export type VehicleOverview = { vehicle: Vehicle; approvalStatus: ApprovalStatus; approval?: StoredApproval | null; latestCheck?: CheckSummary | null };
export type VehicleList = { items: VehicleOverview[]; total: number; page: number; pageSize: number; approvalAsOf: string };
export type VehicleDetails = VehicleOverview & { approvalAsOf: string; tripRows: TripRow[]; approvals: StoredApproval[]; latestSnapshot?: Snapshot | null };
export type CheckHistory = { items: CheckSummary[]; total: number; page: number; pageSize: number };
export type StatisticsList = { items: TripRow[]; total: number; page: number; pageSize: number };
export type StatisticsSave = { createdAt: string; rowCount: number; distinctVehicleCount: number; rows: TripRow[];
  checks: { registrationNumber: string; check?: CheckSummary | null; error?: string | null }[] };
