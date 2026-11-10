package com.tdt4290group7.backend.vehicles

import com.tdt4290group7.backend.blockSupplierAccounts
import com.tdt4290group7.backend.syncSupplierNames
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

/** Agreement and vehicle-list writes share the same transaction and relational change log. */
class FleetRepository internal constructor(private val database: VehicleDatabase) {
    // vehicles (the truck itself) is not part of the change history; what is listed under which agreement is.
    private val tables = listOf("suppliers", "agreements", "vehicle_usages")
    private fun usageId(plate: String, agreementId: String) = "$plate|$agreementId"
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
            rows(db, "vehicle_usages", "1=1 ORDER BY registration_number, agreement_id").map(::vehicle), changes(db, 1))
    }

    fun history(page: Int): List<FleetChange> {
        require(page in 1..1_000_000) { "Invalid history page" }
        return database.read { changes(it, page) }
    }

    fun saveSupplier(id: String?, input: SupplierInput, actor: ChangeActor, now: Instant, expectedUpdatedAt: String? = null): FleetSupplier {
        val name = input.name.trim()
        val org = input.orgNumber.replace(Regex("\\s"), "")
        require(name.length in 1..200) { "Enter the supplier name" }
        require(org.matches(Regex("[0-9]{9}"))) { "Enter a nine-digit organization number" }
        return change(actor, now, null, if (id == null) "Added supplier $name" else "Updated supplier $name") { writer ->
            val supplierId = id ?: UUID.randomUUID().toString()
            if (id != null) expect(requireActive(writer.db, "suppliers", id), expectedUpdatedAt)
            if (id == null) rows(writer.db, "suppliers", "org_number = ? AND active = 0", listOf(org)).firstOrNull()?.let {
                throw ArchivedSupplierMatchException(archivedMatch(writer.db, it))
            }
            if (rows(writer.db, "suppliers", "org_number = ? AND id != ?", listOf(org, supplierId)).isNotEmpty())
                throw FleetConflictException("This organization number already belongs to a supplier")
            // Same name as an archived supplier but another number (maybe a typo): ask once. The admin can say "no, a new one".
            if (id == null && !input.confirmNewSupplier) rows(writer.db, "suppliers", "active = 0 AND lower(name) = lower(?)", listOf(name)).firstOrNull()?.let {
                throw ArchivedSupplierMatchException(archivedMatch(writer.db, it, "ARCHIVED_SUPPLIER_NAME_MATCH", "An archived supplier has the same name"))
            }
            val result = mapOf("id" to supplierId, "name" to name, "org_number" to org,
                "updated_at" to now.storageTimestamp(), "active" to 1)
            writer.save("suppliers", result)
            // A renamed supplier: the copies of its name on invitations and certificates follow.
            if (id != null) syncSupplierNames(writer.db, supplierId)
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
        change(actor, now, null, "Removed supplier") { writer ->
            val previous = requireActive(writer.db, "suppliers", id)
            expect(previous, expectedUpdatedAt)
            writer.description = "Removed supplier ${previous["name"]}"
            rows(writer.db, "agreements", "supplier_id = ? AND active = 1", listOf(id)).forEach { agreement ->
                val agreementId = agreement["id"] as String
                rows(writer.db, "vehicle_usages", "agreement_id = ? AND listed = 1", listOf(agreementId)).forEach {
                    writer.save("vehicle_usages", it + ("listed" to 0))
                }
                writer.save("agreements", agreement + ("active" to 0))
            }
            writer.save("suppliers", previous + ("active" to 0))
            // Same transaction as the removal; skipped when the account tables are in another file.
            blockSupplierAccounts(writer.db, id, writer.now.storageTimestamp())
        }

    /** Brings an archived supplier back. Its old agreements and vehicles stay archived, and its accounts stay blocked until an admin invites someone. */
    fun reactivateSupplier(id: String, expectedUpdatedAt: String, actor: ChangeActor, now: Instant): FleetSupplier =
        change(actor, now, null, "Reactivated supplier") { writer ->
            val previous = row(writer.db, "suppliers", id) ?: throw FleetConflictException("Record no longer available; reload the page")
            if (previous["active"] == 1) throw FleetConflictException("This supplier is already active")
            expect(previous, expectedUpdatedAt)
            writer.description = "Reactivated supplier ${previous["name"]}"
            val result = previous + ("active" to 1)
            writer.save("suppliers", result)
            supplier(result + ("updated_at" to now.storageTimestamp()))
        }

    /** Archived suppliers, most recently archived first, each with every agreement and vehicle it ever had. */
    fun archive(): FleetArchive = database.read { db ->
        FleetArchive(rows(db, "suppliers", "active = 0").map { supplierRow ->
            val id = supplierRow["id"] as String
            val agreements = rows(db, "agreements", "supplier_id = ? ORDER BY start_date DESC", listOf(id))
            val vehicles = agreements.flatMap { rows(db, "vehicle_usages", "agreement_id = ? ORDER BY registration_number", listOf(it["id"])) }
            ArchivedSupplier(supplier(supplierRow), archivedAt(db, id), agreements.map(::agreement), vehicles.map(::vehicle))
        }.sortedByDescending { it.archivedAt ?: "" })
    }

    private fun archivedAt(db: Connection, supplierId: String): String? = database.query(db,
        "SELECT c.occurred_at FROM change_suppliers s JOIN fleet_changes c ON c.id = s.change_id WHERE s.id = ? AND s.phase = 'AFTER' AND s.active = 0 ORDER BY c.occurred_at DESC LIMIT 1",
        listOf(supplierId)) { it.getString(1) }.firstOrNull()

    private fun archivedMatch(db: Connection, supplierRow: Map<String, Any?>, code: String = "ARCHIVED_SUPPLIER_MATCH", message: String = "This organization number belonged to an archived supplier"): ArchivedSupplierMatch {
        val id = supplierRow["id"] as String
        val count = database.query(db, "SELECT count(*) FROM agreements WHERE supplier_id = ?", listOf(id)) { it.getInt(1) }.single()
        return ArchivedSupplierMatch(message, code, supplier(supplierRow), archivedAt(db, id), count)
    }

    fun saveAgreement(id: String?, input: AgreementInput, expectedUpdatedAt: String?, actor: ChangeActor, now: Instant): FleetAgreement {
        val start = date(input.startDate); val end = date(input.endDate)
        require(start <= end) { "End date must be on or after start date" }
        require(input.allowedVehicles in 0..10000) { "Vehicle allowance must be between 0 and 10000" }
        require(input.note.length <= 4000) { "Note must be at most 4000 characters" }
        require(input.saksnr.trim().length in 1..50) { "Enter the saksnr (case number), up to 50 characters" }
        require(input.requiresVehicles || input.requiresEnergy || input.requiresProducts) {
            "Select at least one type of supplier information to collect"
        }
        return change(actor, now, id, if (id == null) "Created agreement" else "Updated agreement") { writer ->
            requireActive(writer.db, "suppliers", input.supplierId)
            val agreementId = id ?: UUID.randomUUID().toString()
            if (id != null) {
                val previous = requireActive(writer.db, "agreements", id)
                expect(previous, expectedUpdatedAt)
                require(previous["supplier_id"] == input.supplierId) { "An agreement cannot be moved to another supplier" }
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
        change(actor, now, id, "Removed agreement") { writer ->
            val previous = requireActive(writer.db, "agreements", id)
            expect(previous, expectedUpdatedAt)
            rows(writer.db, "vehicle_usages", "agreement_id = ? AND listed = 1", listOf(id)).forEach {
                writer.save("vehicle_usages", it + ("listed" to 0))
            }
            writer.save("agreements", previous + ("active" to 0))
        }

    fun addVehicle(agreementId: String, input: VehicleEntryInput, actor: ChangeActor, now: Instant, snapshot: RegistrySnapshot? = null): Vehicle =
        change(actor, now, agreementId, "Added vehicle") { writer ->
            val agreement = requireActive(writer.db, "agreements", agreementId)
            val count = database.query(writer.db, "SELECT count(*) FROM vehicle_usages WHERE agreement_id = ? AND listed = 1", listOf(agreementId)) { it.getInt(1) }.single()
            if (count >= (agreement["allowed_vehicles"] as Number).toInt()) throw FleetConflictException("Vehicle allowance reached")
            val result = addEntry(writer, agreementId, input, now)
            saveVerifiedSnapshot(writer.db, result, snapshot)
            writer.description = "Added ${result.registrationNumber}"
            result
        }

    /** [agreementId] says which listing to remove when the truck is listed under more than one agreement. */
    fun removeVehicle(plate: String, expectedUpdatedAt: String, actor: ChangeActor, now: Instant, agreementId: String? = null) =
        change(actor, now, null, "Removed $plate") { writer ->
            val previous = requireListed(writer.db, plate, agreementId)
            expect(previous, expectedUpdatedAt)
            writer.agreementId = previous["agreement_id"] as String
            writer.save("vehicle_usages", previous + ("listed" to 0))
        }

    fun replaceVehicle(plate: String, request: ReplacementRequest, actor: ChangeActor, now: Instant, snapshot: RegistrySnapshot? = null, agreementId: String? = null): Vehicle =
        change(actor, now, null, "Replaced $plate") { writer ->
            val previous = requireListed(writer.db, plate, agreementId)
            expect(previous, request.expectedUpdatedAt)
            val usageAgreementId = previous["agreement_id"] as String
            requireActive(writer.db, "agreements", usageAgreementId)
            writer.agreementId = usageAgreementId
            val next = addEntry(writer, usageAgreementId, request.replacement, now)
            saveVerifiedSnapshot(writer.db, next, snapshot)
            writer.save("vehicle_usages", previous + ("listed" to 0))
            writer.description = if ((previous["planned"] as Number).toInt() == 1 && !next.planned)
                "Registered ${next.registrationNumber} for $plate" else "Replaced $plate with ${next.registrationNumber}"
            next
        }

    private fun addEntry(writer: Writer, agreementId: String, input: VehicleEntryInput, now: Instant): Vehicle {
        val plate = input.validatedRegistrationNumber()
            ?: "PLAN" + UUID.randomUUID().toString().replace("-", "").take(12).uppercase()
        val usageId = usageId(plate, agreementId)
        val previous = row(writer.db, "vehicle_usages", usageId)
        // The same truck may be listed under other agreements, also another supplier's; only this agreement's own listing counts.
        if (previous != null && (previous["listed"] as Number).toInt() == 1) throw FleetConflictException("This vehicle is already listed under this agreement")
        ensureTruck(writer.db, plate, input.planned, now)
        val next = mapOf("id" to usageId, "registration_number" to plate, "agreement_id" to agreementId,
            "planned" to if (input.planned) 1 else 0, "listed" to 1,
            "created_at" to (previous?.get("created_at") ?: now.storageTimestamp()), "updated_at" to now.storageTimestamp())
        writer.save("vehicle_usages", next)
        return vehicle(next)
    }

    private fun saveVerifiedSnapshot(db: Connection, vehicle: Vehicle, snapshot: RegistrySnapshot?) {
        if (snapshot == null) return
        require(!vehicle.planned && snapshot.registrationNumber == vehicle.registrationNumber) { "Snapshot vehicle mismatch" }
        database.insertRegistrySnapshot(db, snapshot)
    }

    fun undo(id: String, actor: ChangeActor, now: Instant) = database.write { db ->
        val original = database.query(db, "SELECT * FROM fleet_changes WHERE id = ?", listOf(id), ::values).firstOrNull()
            ?: throw FleetConflictException("Change not found")
        if (!canUndo(db, original)) throw FleetConflictException("This change cannot be undone after subsequent changes; reload history")
        val writer = Writer(db, now, original["agreement_id"] as String?, "Undid: ${original["description"]}")
        tables.forEach { table ->
            states(db, table, id, "BEFORE").forEach { writer.save(table, it) }
        }
        writer.record(actor, id)
    }

    /** The truck itself, once, whatever agreements it is listed under. */
    internal fun ensureTruck(db: Connection, plate: String, planned: Boolean, now: Instant) {
        db.prepareStatement("INSERT OR IGNORE INTO vehicles (registration_number, planned, listed, created_at, updated_at) VALUES (?, ?, 0, ?, ?)").use {
            it.setString(1, plate); it.setInt(2, if (planned) 1 else 0); it.setString(3, now.storageTimestamp()); it.setString(4, now.storageTimestamp())
            it.executeUpdate()
        }
    }

    /**
     * The listing of [plate] to judge it by: the one under [agreementId] when given, otherwise a listed one whose agreement is
     * active and covers today, then the most recently started agreement. Null when the truck has never been listed.
     */
    internal fun usage(db: Connection, plate: String, agreementId: String? = null): Map<String, Any?>? {
        if (agreementId != null) return row(db, "vehicle_usages", usageId(plate, agreementId))
        val today = LocalDate.now(java.time.ZoneId.of("Europe/Oslo")).toString()
        return rows(db, "vehicle_usages", "registration_number = ?", listOf(plate)).maxWithOrNull(compareBy<Map<String, Any?>> {
            val agreement = row(db, "agreements", it["agreement_id"] as String)
            val covers = agreement != null && agreement["active"] == 1 && (agreement["start_date"] as String) <= today && (agreement["end_date"] as String) >= today
            (if (it["listed"] == 1) 4 else 0) + (if (covers) 2 else 0) + (if (agreement?.get("active") == 1) 1 else 0)
        }.thenBy { row(db, "agreements", it["agreement_id"] as String)?.get("start_date") as String? ?: "" })
    }

    internal fun usageCount(db: Connection, plate: String) = database.query(db, "SELECT count(*) FROM vehicle_usages WHERE registration_number = ?", listOf(plate)) { it.getInt(1) }.single()

    internal fun evidence(db: Connection, plate: String, agreementId: String? = null): AgreementEvidence? {
        val usage = usage(db, plate, agreementId) ?: return null
        val agreement = row(db, "agreements", usage["agreement_id"] as String) ?: return null
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
                if (table == "agreements" && before["active"] == 0 && rows(db, "vehicle_usages", "agreement_id = ? AND listed = 1", listOf(before["id"])).isNotEmpty()) return false
                if (table == "vehicle_usages" && before["listed"] == 1) {
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
            val before = previous ?: values + (if (table == "vehicle_usages") "listed" to 0 else "active" to 0)
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
        ?.takeIf { it["active"] == 1 } ?: throw FleetConflictException("Record no longer available; reload the page")
    /** The listed listing of [plate]; with several agreements the caller must say which one. */
    private fun requireListed(db: Connection, plate: String, agreementId: String? = null): Map<String, Any?> {
        val listed = rows(db, "vehicle_usages", "registration_number = ? AND listed = 1" + (if (agreementId != null) " AND agreement_id = ?" else ""), listOfNotNull(plate, agreementId))
        require(listed.size <= 1) { "$plate is listed under several agreements; say which one" }
        return listed.singleOrNull() ?: throw FleetConflictException("Vehicle is no longer listed; reload the page")
    }
    private fun expect(previous: Map<String, Any?>, expected: String?) {
        if (expected == null || previous["updated_at"] != expected) throw FleetConflictException("This record changed; reload before editing")
    }
    private fun date(value: String): LocalDate {
        require(value.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}"))) { "Enter a valid date" }
        return try { LocalDate.parse(value) } catch (_: Exception) { throw IllegalArgumentException("Enter a valid date") }
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
