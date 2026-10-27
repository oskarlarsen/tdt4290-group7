package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal

/** Complete synthetic observations only. Production inputs deliberately have no defaults. */
fun syntheticTrip(
    registrationNumber: String = "AB12345", periodStart: String = "2026-01-01", periodEnd: String = "2026-01-31",
    fuelTechnology: FuelTechnology = FuelTechnology.DIESEL, make: String = "Synthetic make",
    bodyType: BodyType = BodyType.AA, model: String = "Synthetic model", co2Registered: Boolean = !fuelTechnology.emissionsNotApplicable,
    co2GramsPerKm: BigDecimal? = if (fuelTechnology.emissionsNotApplicable) null else BigDecimal.ZERO,
    medianCo2: BigDecimal? = if (fuelTechnology.emissionsNotApplicable) null else BigDecimal.ZERO,
    totalTripKm: BigDecimal = BigDecimal.ZERO, totalKmCo2Registered: BigDecimal? = if (fuelTechnology.emissionsNotApplicable) null else BigDecimal.ZERO,
    totalKmCo2NotRegistered: BigDecimal = BigDecimal.ZERO, kmFuelNotRegistered: BigDecimal = BigDecimal.ZERO,
    totalKmFuelRegistered: BigDecimal = BigDecimal.ZERO, totalKmNoxRegistered: BigDecimal? = if (fuelTechnology.emissionsNotApplicable) null else BigDecimal.ZERO,
    totalNoxRegisteredGrams: BigDecimal? = if (fuelTechnology.emissionsNotApplicable) null else BigDecimal.ZERO, tripCount: Int = 0,
    averageFuelConsumptionLitresPer100Km: BigDecimal? = if (fuelTechnology.usesLitres) BigDecimal.ZERO else null,
    fuelConsumedLitres: BigDecimal? = if (fuelTechnology.usesLitres) BigDecimal.ZERO else null,
    comment: String? = null, vehicleCategory: VehicleCategory = VehicleCategory.M1,
) = TripRowInput(registrationNumber, periodStart, periodEnd, fuelTechnology, make, bodyType, model,
    co2Registered, co2GramsPerKm, medianCo2, totalTripKm, totalKmCo2Registered, totalKmCo2NotRegistered,
    kmFuelNotRegistered, totalKmFuelRegistered, totalKmNoxRegistered, totalNoxRegisteredGrams,
    tripCount, vehicleCategory, averageFuelConsumptionLitresPer100Km, fuelConsumedLitres, comment)

fun syntheticApproval(
    registrationNumber: String = "AB12345", fuelTechnology: FuelTechnology = FuelTechnology.DIESEL,
    startDate: String? = null, expiryDate: String? = null,
    vehicleCategory: VehicleCategory = VehicleCategory.M1,
) = ApprovalInput(registrationNumber, fuelTechnology, vehicleCategory, startDate, expiryDate)
