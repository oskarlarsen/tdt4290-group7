// Decimal JSON numbers are decoded as strings by the vehicle API client to avoid IEEE-754 rounding.
import type { BodyType, FuelTechnology, VehicleCategory } from "../utils/vehicleCatalog";
export type Decimal = string;
export type DataSource = "LIVE" | "CACHE" | "STALE_CACHE" | "UNAVAILABLE";
export type Vehicle = { registrationNumber: string; createdAt: string; agreementId: string | null; planned: boolean; listed: boolean; updatedAt: string };
export type FleetSupplier = { id: string; name: string; orgNumber: string; active: boolean; updatedAt: string | null };
export type AgreementInput = {
  supplierId: string;
  startDate: string;
  endDate: string;
  allowedVehicles: number;
  note: string;
  requiresVehicles: boolean;
  requiresEnergy: boolean;
  requiresProducts: boolean;
};
export type FleetAgreement = AgreementInput & { id: string; updatedAt: string; active: boolean };
export type AgreementEvidence = { agreement: FleetAgreement; supplier: FleetSupplier };
export type FleetChange = { id: string; occurredAt: string; actorName: string; description: string; agreementId: string | null; reversedBy: string | null; undoOf: string | null; canUndo: boolean };
export type FleetOverview = { suppliers: FleetSupplier[]; agreements: FleetAgreement[]; vehicles: Vehicle[]; changes: FleetChange[] };
export type VehicleEntryInput = { planned: boolean; registrationNumber?: string };
export type TripData = {
  registrationNumber: string; periodStart: string; periodEnd: string;
  fuelTechnology: FuelTechnology; vehicleCategory: VehicleCategory; bodyType: BodyType; make: string; model: string;
  co2Registered: boolean; co2GramsPerKm: Decimal | null;
  totalTripKm: Decimal; totalKmCo2Registered: Decimal | null; totalKmCo2NotRegistered: Decimal;
  kmFuelNotRegistered: Decimal; totalKmFuelRegistered: Decimal;
  totalKmNoxRegistered: Decimal | null; totalNoxRegisteredGrams: Decimal | null;
  averageFuelConsumptionLitresPer100Km?: Decimal | null; fuelConsumedLitres?: Decimal | null; comment?: string | null;
};
export type TripRow = { id: string; registrationNumber: string; sourceName?: string | null; createdAt: string; data: TripData; estimatedCo2Kg: Decimal | null };
export type RegistryCode = { code: string; name?: string | null };
export type RegistryData = {
  registrationNumber: string; registrationStatus?: string | null; make?: string | null; model?: string | null;
  vehicleCategory?: RegistryCode | null; bodyType?: RegistryCode | null; euroClass?: RegistryCode | null;
  lastApprovedInspectionDate?: string | null; nextInspectionDueDate?: string | null;
  fuels: { fuelTechnology?: RegistryCode | null; measurements: {
    measurementMethod?: RegistryCode | null; co2GramsPerKm?: Decimal | null; noxMgPerKm?: Decimal | null;
  }[] }[];
};
export type Snapshot = { id: string; fetchedAt: string; source: string; data: RegistryData };
export type CheckSummary = {
  id: string; checkedAt: string; dataSource: DataSource;
  lookupOutcome: string; fetchedAt?: string | null; refreshFailure?: string | null; deviations: string[];
  highPriorityCount?: number; moderatePriorityCount?: number;
};
export type DeviationFinding = {
  code: string; priority: "MODERATE" | "HIGH"; origin: "AGREEMENT" | "REGISTRY" | "STATISTICS"; description: string;
  tripRowId?: string | null; relatedTripRowId?: string | null;
  fuelIndex?: number | null; measurementIndex?: number | null;
};
export type VehicleCheck = {
  id: string; checkedAt: string; vehicle: Vehicle;
  agreement: AgreementEvidence | null; tripRows: TripRow[]; deviations: string[]; findings: DeviationFinding[];
  registry: { dataSource: DataSource; lookupOutcome: string; fetchedAt?: string | null;
    refreshFailure?: string | null; registrationStatus?: string | null; data?: RegistryData | null;
    deviations: string[]; usageProhibitionState: "UNKNOWN" };
};
export type VehicleDetails = { vehicle: Vehicle; agreement: AgreementEvidence | null; tripRows: TripRow[]; latestSnapshot: Snapshot | null; latestCheck: CheckSummary | null };
export type CheckHistory = { items: CheckSummary[]; total: number; page: number; pageSize: number };
export type StatisticsList = { items: TripRow[]; total: number; page: number; pageSize: number };
export type StatisticsSave = { createdAt: string; rowCount: number; distinctVehicleCount: number; rows: TripRow[];
  checks: { registrationNumber: string; check?: CheckSummary | null; error?: string | null }[] };
