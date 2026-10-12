package com.tdt4290group7.backend.vehicles

import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class VehicleRepositoryTest {
    @Test
    fun concurrentApprovalsReuseOneUnrevokedRecordAcrossRepositories() {
        val path = databasePath()
        val repositories = List(8) { VehicleRepository(path) }

        for (precreate in listOf(false, true)) {
            repeat(4) { round ->
                val plate = "AB${(if (precreate) 10100 else 10000) + round}"
                if (precreate) repositories.first().findOrCreateVehicle(plate, Instant.now())
                val responses = concurrently(repositories.mapIndexed { index, repository ->
                    {
                        repository.upsertApprovals(
                            UpsertApprovalsRequest(approvals = listOf(
                                ApprovalInput(plate, fuelTechnology = "synthetic-$index"),
                            )),
                            Instant.now(),
                        )
                    }
                })

                val records = responses.map { it.approvals.single() }
                assertEquals(1, records.map { it.id }.distinct().size)
                assertEquals(1, records.map { it.registrationNumber }.distinct().size)
                val stored = repositories.first().approvalForVehicle(records.first().registrationNumber)!!
                assertTrue(stored.data.fuelTechnology in records.map { it.data.fuelTechnology })
            }
        }
        connection(path).use { db ->
            assertEquals(8, count(db, "vehicles"))
            assertEquals(8, count(db, "vehicle_approvals"))
        }
    }

    @Test
    fun concurrentTripUploadsAppendEveryRowForTheSameVehicle() {
        val path = databasePath()
        val repositories = List(8) { VehicleRepository(path) }
        val responses = concurrently(repositories.mapIndexed { index, repository ->
            {
                repository.appendTripRows(
                    AppendTripRowsRequest(rows = listOf(
                        TripRowInput("AB 12345", "2026-01-01", "2026-01-31", tripCount = index),
                        TripRowInput("ab-12345", "2026-01-01", "2026-01-31", tripCount = index),
                    )),
                    Instant.now(),
                )
            }
        })

        assertTrue(responses.all { it.rowCount == 2 && it.distinctVehicleCount == 1 })
        val vehicleIds = responses.flatMap { it.rows }.map { it.registrationNumber }.distinct()
        assertEquals(1, vehicleIds.size)
        val stored = repositories.first().tripRowsForVehicle(vehicleIds.single())
        assertEquals(16, stored.size)
        assertEquals(16, stored.map { it.id }.distinct().size)
        assertEquals((0..7).associate { it to 2 }, stored.groupingBy { requireNotNull(it.data.tripCount) }.eachCount())
        connection(path).use { db -> assertEquals(1, count(db, "vehicles")) }
    }

    @Test
    fun busyCommitRollsBackTheEntireBatchAndAllowsLaterWrites() {
        val path = databasePath()
        val repository = VehicleRepository(path)
        val request = UpsertApprovalsRequest(approvals = listOf(
            ApprovalInput("AB12345"), ApprovalInput("CD12345"),
        ))

        // A reader permits BEGIN IMMEDIATE and the writes, but blocks their commit.
        connection(path).use { reader ->
            reader.createStatement().use { it.execute("BEGIN") }
            try {
                assertEquals(0, count(reader, "vehicle_approvals"))
                assertFailsWith<VehicleStorageBusyException> {
                    repository.upsertApprovals(request, Instant.now())
                }
            } finally {
                reader.createStatement().use { it.execute("ROLLBACK") }
            }
        }

        connection(path).use { db ->
            assertEquals(0, count(db, "vehicles"))
            assertEquals(0, count(db, "vehicle_approvals"))
        }
        assertEquals(2, repository.upsertApprovals(request, Instant.now()).approvalCount)
    }

    private fun <T> concurrently(actions: List<() -> T>): List<T> {
        val executor = Executors.newFixedThreadPool(actions.size)
        val ready = CountDownLatch(actions.size)
        val start = CountDownLatch(1)
        try {
            val futures = actions.map { action ->
                executor.submit<T> {
                    ready.countDown()
                    check(start.await(5, TimeUnit.SECONDS)) { "Concurrent test did not start" }
                    action()
                }
            }
            assertTrue(ready.await(5, TimeUnit.SECONDS))
            start.countDown()
            return futures.map { it.get(15, TimeUnit.SECONDS) }
        } finally {
            start.countDown()
            executor.shutdownNow()
            check(executor.awaitTermination(15, TimeUnit.SECONDS)) { "Concurrent test workers did not stop" }
        }
    }

    private fun databasePath(): Path = Path.of("build", "test-data", "${UUID.randomUUID()}.db")

    private fun connection(path: Path): Connection = DriverManager.getConnection("jdbc:sqlite:${path.toAbsolutePath()}")

    private fun count(db: Connection, table: String): Int = db.createStatement().use { statement ->
        statement.executeQuery("SELECT COUNT(*) FROM $table").use { rows ->
            check(rows.next())
            rows.getInt(1)
        }
    }
}
