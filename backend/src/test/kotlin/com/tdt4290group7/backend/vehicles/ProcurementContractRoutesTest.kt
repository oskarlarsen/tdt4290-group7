package com.tdt4290group7.backend.vehicles

import com.tdt4290group7.backend.adminClient
import com.tdt4290group7.backend.module
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import java.nio.file.Path
import java.time.Duration
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

class ProcurementContractRoutesTest {
    @Test
    fun administratorCanPreviewImportAndListContracts() = testApplication {
        val vehicleRepository = VehicleRepository(databasePath())
        application { module(vehicleRepository, null, Duration.ofDays(14)) }
        val adminClient = adminClient()
        val supplierResponse = adminClient.post("/api/vehicle-fleet/suppliers") {
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Example Supplier","orgNumber":"123456789"}""")
        }
        assertEquals(HttpStatusCode.Created, supplierResponse.status, supplierResponse.bodyAsText())
        val supplierId = Json.parseToJsonElement(supplierResponse.bodyAsText()).jsonObject
            .getValue("id").jsonPrimitive.content
        val request = """{"supplierId":"$supplierId","csv":"contractName,contractReference,startDate,endDate\nWaste,WS-2026,2026-01-01,2026-12-31"}"""

        val preview = adminClient.post("/api/procurement/contracts/preview") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }
        assertEquals(HttpStatusCode.OK, preview.status, preview.bodyAsText())
        assertEquals(0, Json.parseToJsonElement(preview.bodyAsText()).jsonObject.getValue("issues").jsonArray.size)

        val imported = adminClient.post("/api/procurement/contracts/import") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }
        assertEquals(HttpStatusCode.Created, imported.status, imported.bodyAsText())
        assertEquals(1, Json.parseToJsonElement(imported.bodyAsText()).jsonObject.getValue("imported").jsonPrimitive.content.toInt())

        val listed = adminClient.get("/api/procurement/contracts")
        assertEquals(HttpStatusCode.OK, listed.status)
        assertEquals(1, Json.parseToJsonElement(listed.bodyAsText()).jsonArray.size)

        val duplicate = adminClient.post("/api/procurement/contracts/import") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }
        assertEquals(HttpStatusCode.Conflict, duplicate.status)
        assertEquals(1, vehicleRepository.fleet.procurementContracts(supplierId).size)
    }

    private fun databasePath() = Path.of("build", "test-data", "procurement-api-${UUID.randomUUID()}.db")
}
