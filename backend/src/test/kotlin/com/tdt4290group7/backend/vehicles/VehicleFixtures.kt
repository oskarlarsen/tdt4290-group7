package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal

/** Complete synthetic observations only. Production inputs deliberately have no defaults. */
fun syntheticTrip(
    registrationNumber: String = "AB12345", periodStart: String = "2026-01-01", periodEnd: String = "2026-01-31",
    fuelTechnology: FuelTechnology = FuelTechnology.DIESEL, make: String = "Synthetic make",
    bodyType: BodyType = BodyType.AA, model: String = "Synthetic model", co2Registered: Boolean = !fuelTechnology.locksEmissionsToZero,
    co2GramsPerKm: BigDecimal = BigDecimal.ZERO, medianCo2: BigDecimal = BigDecimal.ZERO,
    totalTripKm: BigDecimal = BigDecimal.ZERO, totalKmCo2Registered: BigDecimal = BigDecimal.ZERO,
    totalKmCo2NotRegistered: BigDecimal = BigDecimal.ZERO, kmFuelNotRegistered: BigDecimal = BigDecimal.ZERO,
    totalKmFuelRegistered: BigDecimal = BigDecimal.ZERO, totalKmNoxRegistered: BigDecimal = BigDecimal.ZERO,
    totalNoxRegisteredGrams: BigDecimal = BigDecimal.ZERO, tripCount: Int = 0, assignmentNumber: String? = null,
    averageConsumptionLitresPerKm: BigDecimal? = if (fuelTechnology.usesLitres) BigDecimal.ZERO else null,
    fuelConsumedLitres: BigDecimal? = if (fuelTechnology.usesLitres) BigDecimal.ZERO else null,
    comment: String? = null, vehicleCategory: VehicleCategory = VehicleCategory.M1,
) = TripRowInput(registrationNumber, periodStart, periodEnd, fuelTechnology, make, bodyType, model,
    co2Registered, co2GramsPerKm, medianCo2, totalTripKm, totalKmCo2Registered, totalKmCo2NotRegistered,
    kmFuelNotRegistered, totalKmFuelRegistered, totalKmNoxRegistered, totalNoxRegisteredGrams,
    tripCount, vehicleCategory, assignmentNumber, averageConsumptionLitresPerKm, fuelConsumedLitres, comment)

fun syntheticApproval(
    registrationNumber: String = "AB12345", fuelTechnology: FuelTechnology = FuelTechnology.DIESEL,
    usedThroughoutPeriod: Boolean? = null, startDate: String? = null, expiryDate: String? = null,
    vehicleCategory: VehicleCategory = VehicleCategory.M1,
) = ApprovalInput(registrationNumber, fuelTechnology, vehicleCategory, usedThroughoutPeriod, startDate, expiryDate)
