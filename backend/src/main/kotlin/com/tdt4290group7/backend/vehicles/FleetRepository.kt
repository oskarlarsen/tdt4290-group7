package com.tdt4290group7.backend.vehicles

import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** Agreement and vehicle-list writes share the same transaction and relational change log. */
class FleetRepository internal constructor(private val database: VehicleDatabase) {
    private val tables = listOf("suppliers", "agreements", "vehicles")
    private fun key(table: String) = if (table == "vehicles") "registration_number" else "id"
    private fun rows(db: Connection, table: String, where: String = "1=1", args: List<Any?> = emptyList()) =
        database.query(db, "SELECT * FROM $table WHERE $where", args, ::values)
    private fun row(db: Connection, table: String, id: String) = rows(db, table, "${key(table)} = ?", listOf(id)).firstOrNull()
    private fun values(row: ResultSet): Map<String, Any?> = (1..row.metaData.columnCount).associate {
        val column = row.metaData.getColumnName(it)
        // Keep flag comparisons and audit states independent of getObject's numeric wrapper type.
        column to when (column) {
            "active", "listed", "planned" -> row.getInt(it)
            else -> row.getObject(it)
        }
    }

    fun overview(): FleetOverview = database.read { db ->
        FleetOverview(rows(db, "suppliers", "active = 1 ORDER BY name COLLATE NOCASE").map(::supplier),
            rows(db, "agreements", "active = 1 ORDER BY start_date DESC").map(::agreement),
            rows(db, "vehicles", "agreement_id IS NOT NULL ORDER BY registration_number").map(::vehicle), changes(db, 1))
    }

    fun history(page: Int): List<FleetChange> {
        require(page in 1..1_000_000) { "Ugyldig historikkside" }
        return database.read { changes(it, page) }
    }

    fun saveSupplier(id: String?, input: SupplierInput, actor: ChangeActor, now: Instant, expectedUpdatedAt: String? = null): FleetSupplier {
        val name = input.name.trim()
        val org = input.orgNumber.replace(Regex("\\s"), "")
        require(name.length in 1..200) { "Skriv inn leverandørnavn" }
        require(org.matches(Regex("[0-9]{9}"))) { "Skriv inn et organisasjonsnummer på ni siffer" }
        return change(actor, now, null, if (id == null) "La til leverandør $name" else "Oppdaterte leverandør $name") { writer ->
            val supplierId = id ?: UUID.randomUUID().toString()
            if (id != null) expect(requireActive(writer.db, "suppliers", id), expectedUpdatedAt)
            if (rows(writer.db, "suppliers", "org_number = ? AND id != ?", listOf(org, supplierId)).isNotEmpty())
                throw FleetConflictException("Dette organisasjonsnummeret tilhører allerede en leverandør")
            val result = mapOf("id" to supplierId, "name" to name, "org_number" to org,
                "updated_at" to now.storageTimestamp(), "active" to 1)
            writer.save("suppliers", result)
            supplier(result)
        }
    }

    fun isSupplierActive(id: String): Boolean = database.read { db ->
        row(db, "suppliers", id)?.get("active") == 1
    }

    fun activeAgreementEvidence(id: String): AgreementEvidence? = database.read { db ->
        val agreementRow = row(db, "agreements", id)?.takeIf { it["active"] == 1 } ?: return@read null
        val supplierRow = row(db, "suppliers", agreementRow["supplier_id"] as String)
            ?.takeIf { it["active"] == 1 } ?: return@read null
        AgreementEvidence(agreement(agreementRow), supplier(supplierRow))
    }

    fun removeSupplier(id: String, expectedUpdatedAt: String, actor: ChangeActor, now: Instant) =
        change(actor, now, null, "Fjernet leverandør") { writer ->
            val previous = requireActive(writer.db, "suppliers", id)
            expect(previous, expectedUpdatedAt)
            writer.description = "Fjernet leverandør ${previous["name"]}"
            rows(writer.db, "agreements", "supplier_id = ? AND active = 1", listOf(id)).forEach { agreement ->
                val agreementId = agreement["id"] as String
                rows(writer.db, "vehicles", "agreement_id = ? AND listed = 1", listOf(agreementId)).forEach {
                    writer.save("vehicles", it + ("listed" to 0))
                }
                writer.save("agreements", agreement + ("active" to 0))
            }
            writer.save("suppliers", previous + ("active" to 0))
        }

    fun saveAgreement(id: String?, input: AgreementInput, expectedUpdatedAt: String?, actor: ChangeActor, now: Instant): FleetAgreement {
        val start = date(input.startDate); val end = date(input.endDate)
        require(start <= end) { "Sluttdato må være lik eller senere enn startdato" }
        require(input.allowedVehicles in 0..10000) { "Antall tillatte kjøretøy må være mellom 0 og 10000" }
        require(input.note.length <= 4000) { "Notatet kan ha høyst 4000 tegn" }
        require(input.saksnr.trim().length in 1..50) { "Skriv inn saksnummer (Saksnr), opptil 50 tegn" }
        require(input.requiresVehicles || input.requiresEnergy || input.requiresProducts) {
            "Velg minst én type leverandøropplysninger som skal samles inn"
        }
        return change(actor, now, id, if (id == null) "Opprettet avtale" else "Oppdaterte avtale") { writer ->
            requireActive(writer.db, "suppliers", input.supplierId)
            val agreementId = id ?: UUID.randomUUID().toString()
            if (id != null) {
                val previous = requireActive(writer.db, "agreements", id)
                expect(previous, expectedUpdatedAt)
                require(previous["supplier_id"] == input.supplierId) { "En avtale kan ikke flyttes til en annen leverandør" }
            }
            val result = mapOf("id" to agreementId, "supplier_id" to input.supplierId,
                "start_date" to input.startDate, "end_date" to input.endDate,
                "allowed_vehicles" to input.allowedVehicles, "note" to input.note.trim(),
                "updated_at" to now.storageTimestamp(), "active" to 1,
                "requires_vehicles" to if (input.requiresVehicles) 1 else 0,
                "requires_energy" to if (input.requiresEnergy) 1 else 0,
                "requires_products" to if (input.requiresProducts) 1 else 0,
                "saksnr" to input.saksnr.trim())
            // Reducing an allowance is permitted even when more vehicles remain listed.
            writer.save("agreements", result)
            writer.agreementId = agreementId
            agreement(result)
        }
    }

    fun removeAgreement(id: String, expectedUpdatedAt: String, actor: ChangeActor, now: Instant) =
        change(actor, now, id, "Fjernet avtale") { writer ->
            val previous = requireActive(writer.db, "agreements", id)
            expect(previous, expectedUpdatedAt)
            rows(writer.db, "vehicles", "agreement_id = ? AND listed = 1", listOf(id)).forEach {
                writer.save("vehicles", it + ("listed" to 0))
            }
            writer.save("agreements", previous + ("active" to 0))
        }

    fun addVehicle(agreementId: String, input: VehicleEntryInput, actor: ChangeActor, now: Instant, snapshot: RegistrySnapshot? = null): Vehicle =
        change(actor, now, agreementId, "La til kjøretøy") { writer ->
            val agreement = requireActive(writer.db, "agreements", agreementId)
            val count = database.query(writer.db, "SELECT count(*) FROM vehicles WHERE agreement_id = ? AND listed = 1", listOf(agreementId)) { it.getInt(1) }.single()
            if (count >= (agreement["allowed_vehicles"] as Number).toInt()) throw FleetConflictException("Grensen for antall kjøretøy er nådd")
            val result = addEntry(writer, agreementId, input, now)
            saveVerifiedSnapshot(writer.db, result, snapshot)
            writer.description = if (input.planned) "La til et planlagt kjøretøy" else "La til ${result.registrationNumber}"
            result
        }

    fun removeVehicle(plate: String, expectedUpdatedAt: String, actor: ChangeActor, now: Instant) =
        change(actor, now, null, "Removed $plate") { writer ->
            val previous = requireListed(writer.db, plate)
            expect(previous, expectedUpdatedAt)
            writer.agreementId = previous["agreement_id"] as String
            writer.save("vehicles", previous + ("listed" to 0))
        }

    fun replaceVehicle(plate: String, request: ReplacementRequest, actor: ChangeActor, now: Instant, snapshot: RegistrySnapshot? = null): Vehicle =
        change(actor, now, null, "Erstattet $plate") { writer ->
            val previous = requireListed(writer.db, plate)
            expect(previous, request.expectedUpdatedAt)
            val agreementId = previous["agreement_id"] as String
            requireActive(writer.db, "agreements", agreementId)
            writer.agreementId = agreementId
            val next = addEntry(writer, agreementId, request.replacement, now)
            saveVerifiedSnapshot(writer.db, next, snapshot)
            writer.save("vehicles", previous + ("listed" to 0))
            writer.description = if ((previous["planned"] as Number).toInt() == 1 && !next.planned)
                "Registrerte ${next.registrationNumber} for $plate" else "Erstattet $plate med ${next.registrationNumber}"
            next
        }

    private fun addEntry(writer: Writer, agreementId: String, input: VehicleEntryInput, now: Instant): Vehicle {
        val plate = input.validatedRegistrationNumber()
            ?: "PLAN" + UUID.randomUUID().toString().replace("-", "").take(12).uppercase()
        val previous = row(writer.db, "vehicles", plate)
        if (previous != null) {
            if ((previous["listed"] as Number).toInt() == 1) throw FleetConflictException("Dette kjøretøyet er allerede på listen")
            if (previous["agreement_id"] != null && previous["agreement_id"] != agreementId)
                throw FleetConflictException("Dette kjøretøyet tilhører en annen avtale")
        }
        val next = mapOf("registration_number" to plate, "agreement_id" to agreementId,
            "planned" to if (input.planned) 1 else 0, "listed" to 1,
            "created_at" to (previous?.get("created_at") ?: now.storageTimestamp()), "updated_at" to now.storageTimestamp())
        writer.save("vehicles", next)
        return vehicle(next)
    }

    private fun saveVerifiedSnapshot(db: Connection, vehicle: Vehicle, snapshot: RegistrySnapshot?) {
        if (snapshot == null) return
        require(!vehicle.planned && snapshot.registrationNumber == vehicle.registrationNumber) { "Registerutdraget tilhører et annet kjøretøy" }
        database.insertRegistrySnapshot(db, snapshot)
    }

    fun undo(id: String, actor: ChangeActor, now: Instant) = database.write { db ->
        val original = database.query(db, "SELECT * FROM fleet_changes WHERE id = ?", listOf(id), ::values).firstOrNull()
            ?: throw FleetConflictException("Fant ikke endringen")
        if (!canUndo(db, original)) throw FleetConflictException("Denne endringen kan ikke angres etter senere endringer; last historikken på nytt")
        val writer = Writer(db, now, original["agreement_id"] as String?, "Angret: ${original["description"]}")
        tables.forEach { table ->
            states(db, table, id, "BEFORE").forEach { writer.save(table, it) }
        }
        writer.record(actor, id)
    }

    internal fun evidence(db: Connection, plate: String): AgreementEvidence? {
        val vehicle = row(db, "vehicles", plate) ?: return null
        val agreementId = vehicle["agreement_id"] as String? ?: return null
        val agreement = row(db, "agreements", agreementId) ?: return null
        val supplier = row(db, "suppliers", agreement["supplier_id"] as String) ?: return null
        return AgreementEvidence(agreement(agreement), supplier(supplier))
    }

    private fun states(db: Connection, table: String, id: String, phase: String) =
        rows(db, "change_$table", "change_id = ? AND phase = ?", listOf(id, phase)).map { it - setOf("change_id", "phase") }

    private fun canUndo(db: Connection, change: Map<String, Any?>): Boolean {
        if (change["undo_of"] != null) return false
        val id = change["id"] as String
        if (database.query(db, "SELECT 1 FROM fleet_changes WHERE undo_of = ?", listOf(id)) { it.getInt(1) }.isNotEmpty()) return false
        for (table in tables) {
            if (states(db, table, id, "AFTER").any { row(db, table, it[key(table)] as String) != it }) return false
            for (before in states(db, table, id, "BEFORE")) {
                if (table == "suppliers" && rows(db, "suppliers", "org_number = ? AND id != ?", listOf(before["org_number"], before["id"])).isNotEmpty()) return false
                if (table == "suppliers" && before["active"] == 0 && rows(db, "agreements", "supplier_id = ? AND active = 1", listOf(before["id"])).isNotEmpty()) return false
                if (table == "agreements" && before["active"] == 0 && rows(db, "vehicles", "agreement_id = ? AND listed = 1", listOf(before["id"])).isNotEmpty()) return false
                if (table == "vehicles" && before["listed"] == 1) {
                    val agreement = row(db, "agreements", before["agreement_id"] as String) ?: return false
                    if (agreement["active"] == 0 && states(db, "agreements", id, "BEFORE").none { it["id"] == agreement["id"] && it["active"] == 1 }) return false
                }
            }
        }
        return true
    }

    private fun changes(db: Connection, page: Int) = database.query(db,
        "SELECT c.*, r.id AS reversed_by FROM fleet_changes c LEFT JOIN fleet_changes r ON r.undo_of = c.id ORDER BY c.occurred_at DESC, c.rowid DESC LIMIT 30 OFFSET ?", listOf((page - 1L) * 30)) { result ->
        val data = values(result) - "reversed_by"
        FleetChange(result.getString("id"), result.getString("occurred_at"), result.getString("actor_name"),
            result.getString("description"), result.getString("agreement_id"), result.getString("reversed_by"),
            result.getString("undo_of"), canUndo(db, data))
    }

    private fun <T> change(actor: ChangeActor, now: Instant, agreementId: String?, description: String, action: (Writer) -> T): T = database.write { db ->
        val writer = Writer(db, now, agreementId, description)
        val result = action(writer)
        writer.record(actor)
        result
    }

    private inner class Writer(val db: Connection, val now: Instant, var agreementId: String?, var description: String) {
        val snapshots = linkedMapOf<Pair<String, String>, Pair<Map<String, Any?>, Map<String, Any?>>>()
        fun save(table: String, input: Map<String, Any?>) {
            val values = input + ("updated_at" to now.storageTimestamp())
            val id = values[key(table)] as String
            val previous = row(db, table, id)
            val before = previous ?: values + (if (table == "vehicles") "listed" to 0 else "active" to 0)
            val columns = values.keys.joinToString(",")
            val assignments = values.keys.filter { it != key(table) }.joinToString(",") { "$it = excluded.$it" }
            db.prepareStatement("INSERT INTO $table ($columns) VALUES (${values.keys.joinToString(",") { "?" }}) ON CONFLICT(${key(table)}) DO UPDATE SET $assignments").use {
                values.values.forEachIndexed { index, value -> it.setObject(index + 1, value) }; it.executeUpdate()
            }
            val identity = table to id
            snapshots[identity] = (snapshots[identity]?.first ?: before) to values
        }
        fun record(actor: ChangeActor, undoOf: String? = null): String {
            val id = UUID.randomUUID().toString()
            database.insert(db, "fleet_changes", mapOf("id" to id, "occurred_at" to now.storageTimestamp(),
                "actor_id" to actor.id, "actor_name" to actor.name, "description" to description,
                "agreement_id" to agreementId, "undo_of" to undoOf))
            snapshots.forEach { (entity, pair) ->
                listOf("BEFORE" to pair.first, "AFTER" to pair.second).forEach { (phase, state) ->
                    database.insert(db, "change_${entity.first}", state + mapOf("change_id" to id, "phase" to phase))
                }
            }
            return id
        }
    }

    private fun requireActive(db: Connection, table: String, id: String) = row(db, table, id)
        ?.takeIf { it["active"] == 1 } ?: throw FleetConflictException("Oppføringen er ikke lenger tilgjengelig; last siden på nytt")
    private fun requireListed(db: Connection, plate: String) = row(db, "vehicles", plate)
        ?.takeIf { it["listed"] == 1 } ?: throw FleetConflictException("Kjøretøyet er ikke lenger på listen; last siden på nytt")
    private fun expect(previous: Map<String, Any?>, expected: String?) {
        if (expected == null || previous["updated_at"] != expected) throw FleetConflictException("Oppføringen er endret; last siden på nytt før du redigerer")
    }
    private fun date(value: String): LocalDate {
        require(value.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}"))) { "Skriv inn en gyldig dato" }
        return try { LocalDate.parse(value) } catch (_: Exception) { throw IllegalArgumentException("Skriv inn en gyldig dato") }
    }
    private fun supplier(row: Map<String, Any?>) = FleetSupplier(row["id"] as String, row["name"] as String, row["org_number"] as String,
        row["active"] == 1, row["updated_at"] as String)
    private fun agreement(row: Map<String, Any?>) = FleetAgreement(row["id"] as String, row["supplier_id"] as String,
        row["start_date"] as String, row["end_date"] as String, (row["allowed_vehicles"] as Number).toInt(), row["note"] as String,
        row["updated_at"] as String, row["active"] == 1,
        (row["requires_vehicles"] as Number).toInt() == 1,
        (row["requires_energy"] as Number).toInt() == 1,
        (row["requires_products"] as Number).toInt() == 1,
        row["saksnr"] as String?)
    private fun vehicle(row: Map<String, Any?>) = Vehicle(row["registration_number"] as String, row["created_at"] as String,
        row["agreement_id"] as String?, row["planned"] == 1, row["listed"] == 1, row["updated_at"] as String)
}
