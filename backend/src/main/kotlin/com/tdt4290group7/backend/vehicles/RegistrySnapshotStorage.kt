package com.tdt4290group7.backend.vehicles

import java.math.BigDecimal
import java.sql.Connection

internal fun VehicleDatabase.insertRegistrySnapshot(db: Connection, snapshot: RegistrySnapshot) {
    require(snapshot.registrationNumber == snapshot.data.registrationNumber) { "Registerutdraget tilhører et annet kjøretøy" }
    val data = snapshot.data
    val values = linkedMapOf<String, Any?>(
        "id" to snapshot.id, "registration_number" to snapshot.registrationNumber,
        "fetched_at" to snapshot.fetchedAt, "source" to snapshot.source,
        "registration_status" to data.registrationStatus, "make" to data.make, "model" to data.model,
        "last_approved_inspection_date" to data.lastApprovedInspectionDate,
        "next_inspection_due_date" to data.nextInspectionDueDate,
    )
    values.putCode("vehicle_category", data.vehicleCategory)
    values.putCode("body_type", data.bodyType)
    values.putCode("euro_class", data.euroClass)
    insert(db, "svv_snapshots", values)
    data.fuels.forEachIndexed { fuelIndex, fuel ->
        val fuelValues = linkedMapOf<String, Any?>("snapshot_id" to snapshot.id, "fuel_index" to fuelIndex)
        fuelValues.putCode("fuel_technology", fuel.fuelTechnology)
        insert(db, "svv_snapshot_fuels", fuelValues)
        fuel.measurements.forEachIndexed { measurementIndex, measurement ->
            val measurementValues = linkedMapOf<String, Any?>(
                "snapshot_id" to snapshot.id, "fuel_index" to fuelIndex, "measurement_index" to measurementIndex,
            )
            measurementValues.putCode("measurement_method", measurement.measurementMethod)
            measurementValues.putDecimal("co2_grams_per_km", measurement.co2GramsPerKm)
            measurementValues.putDecimal("nox_mg_per_km", measurement.noxMgPerKm)
            insert(db, "svv_emission_measurements", measurementValues)
        }
    }
}


internal fun MutableMap<String, Any?>.putCode(column: String, code: RegistryCode?) {
    this[column] = code?.code
    this[column + "_name"] = code?.name
}

internal fun MutableMap<String, Any?>.putDecimal(column: String, value: BigDecimal?) {
    val parts = value?.let(::decimalParts)
    this[column + "_unscaled"] = parts?.unscaled
    this[column + "_scale"] = parts?.scale
}
