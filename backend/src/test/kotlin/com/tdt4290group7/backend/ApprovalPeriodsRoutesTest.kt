package com.tdt4290group7.backend

import com.tdt4290group7.backend.vehicles.*
import io.ktor.client.request.*
import io.ktor.client.statement.bodyAsText
import io.ktor.http.*
import io.ktor.server.testing.testApplication
import java.nio.file.Path
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import kotlin.test.*

class ApprovalPeriodsRoutesTest {
    @Test fun creatingUpdatingAndRevokingTargetsOnePeriodAndRejectsStaleEdits() = testApplication {
        val repo = VehicleRepository(Path.of("build", "test-data", "period-api-${UUID.randomUUID()}.db"))
        application { module(repo, null, Duration.ofDays(14)) }
        suspend fun append() = client.post("/api/vehicle-approvals") {
            contentType(ContentType.Application.Json)
            setBody(Json.encodeToString(AppendApprovalsRequest(approvals = listOf(syntheticApproval()))))
        }
        assertEquals(HttpStatusCode.Created, append().status)
        assertEquals(HttpStatusCode.Created, append().status)
        val periods = repo.approvalsForVehicle("AB12345")
        assertEquals(2, periods.size); assertNotEquals(periods[0].id, periods[1].id)
        assertEquals(LocalDate.now(ZoneId.of("Europe/Oslo")).toString(), periods[0].data.startDate)
        val request = UpdateApprovalRequest(periods[0].data.copy(expiryDate = "2099-12-31"), periods[0].updatedAt, "Synthetic reference")
        suspend fun update() = client.put("/api/vehicle-approvals/${periods[0].id}") {
            contentType(ContentType.Application.Json); setBody(Json.encodeToString(request))
        }
        assertEquals(HttpStatusCode.OK, update().status)
        assertEquals(HttpStatusCode.Conflict, update().status)
        assertEquals(periods[1], repo.approvalsForVehicle("AB12345").single { it.id == periods[1].id })
        assertEquals(HttpStatusCode.NotFound, client.post("/api/vehicle-approvals/AB12345/revoke").status)
        assertEquals(HttpStatusCode.OK, client.post("/api/vehicle-approvals/${periods[0].id}/revoke").status)
        assertEquals(HttpStatusCode.NotFound, client.post("/api/vehicle-approvals/${periods[0].id}/revoke").status)
        assertEquals(HttpStatusCode.Conflict, update().status)
        val detail = Json.parseToJsonElement(client.get("/api/vehicles/AB12345").bodyAsText()).jsonObject
        assertEquals("ACTIVE", detail.getValue("approvalStatus").jsonPrimitive.content)
        assertEquals(2, detail.getValue("approvals").jsonArray.size)
    }
    @Test fun futureRecertificationDoesNotHideCurrentApprovalOrCauseWrongDirectoryFilter() = testApplication {
        val repo = VehicleRepository(Path.of("build", "test-data", "period-list-${UUID.randomUUID()}.db"))
        val today = LocalDate.now(ZoneId.of("Europe/Oslo"))
        repo.appendApprovals(AppendApprovalsRequest(approvals = listOf(syntheticApproval(), syntheticApproval(startDate = today.plusYears(1).toString()))), Instant.now())
        application { module(repo, null, Duration.ofDays(14)) }
        val active = Json.parseToJsonElement(client.get("/api/vehicles?approvalStatus=ACTIVE").bodyAsText()).jsonObject
        assertEquals(1, active.getValue("total").jsonPrimitive.int)
        val future = Json.parseToJsonElement(client.get("/api/vehicles?approvalStatus=NOT_YET_ACTIVE").bodyAsText()).jsonObject
        assertEquals(0, future.getValue("total").jsonPrimitive.int)
    }
}
