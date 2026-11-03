package com.tdt4290group7.backend.certificates

import com.tdt4290group7.backend.adminClient
import com.tdt4290group7.backend.module
import com.tdt4290group7.backend.vehicles.VehicleRepository
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.delete
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
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

class CertificateRoutesTest {
    @Test
    fun administratorCanUploadParseAndRetrieveCertificateMetadata() = testApplication {
        val certificateDatabase = databasePath()
        application {
            module(
                VehicleRepository(databasePath()),
                null,
                Duration.ofDays(14),
                CertificateRepository(certificateDatabase),
            )
        }

        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/certificates").status)

        val adminClient = adminClient()
        val pdf = javaClass.classLoader
            .getResourceAsStream("test-pdf/test-certificate-iso14001.pdf")!!
            .use { it.readBytes() }
        val response = adminClient.post("/api/certificates") {
            setBody(
                MultiPartFormDataContent(
                    formData {
                        append("supplierName", "Example Transport AS")
                        append("contractId", "sup-a")
                        append(
                            "file",
                            pdf,
                            Headers.build {
                                append(HttpHeaders.ContentType, "application/pdf")
                                append(HttpHeaders.ContentDisposition, """filename="iso-14001.pdf"""")
                            },
                        )
                    },
                ),
            )
        }

        assertEquals(HttpStatusCode.Created, response.status, response.bodyAsText())
        val uploaded = Json.parseToJsonElement(response.bodyAsText()).jsonObject
        assertEquals("Example Transport AS", uploaded.getValue("supplierName").jsonPrimitive.content)
        assertEquals("ISO 14001", uploaded.getValue("certificateType").jsonPrimitive.content)
        assertEquals("sup-a", uploaded.getValue("contractId").jsonPrimitive.content)

        val listed = adminClient.get("/api/certificates")
        assertEquals(HttpStatusCode.OK, listed.status)
        val records = Json.parseToJsonElement(listed.bodyAsText()).jsonArray
        assertEquals(1, records.size)
        assertEquals(
            uploaded.getValue("id").jsonPrimitive.content,
            records.single().jsonObject.getValue("id").jsonPrimitive.content,
        )
        val certificateId = uploaded.getValue("id").jsonPrimitive.content
        val edited = adminClient.put("/api/certificates/$certificateId") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"supplierName":"Updated Transport AS","certificateType":"ISO 14001","issueDate":"2025-01-15","expiryDate":"2028-12-31","contractId":"CONTRACT-42"}""",
            )
        }
        assertEquals(HttpStatusCode.OK, edited.status, edited.bodyAsText())
        val editedRecord = Json.parseToJsonElement(edited.bodyAsText()).jsonObject
        assertEquals("Updated Transport AS", editedRecord.getValue("supplierName").jsonPrimitive.content)
        assertEquals("2025-01-15", editedRecord.getValue("issueDate").jsonPrimitive.content)
        assertEquals("CONTRACT-42", editedRecord.getValue("contractId").jsonPrimitive.content)
        assertEquals("iso-14001.pdf", CertificateRepository(certificateDatabase).getById(certificateId)?.sourceFile)

        val invalidEdit = adminClient.put("/api/certificates/$certificateId") {
            contentType(ContentType.Application.Json)
            setBody(
                """{"supplierName":"Updated Transport AS","certificateType":"ISO 14001","issueDate":"2029-01-01","expiryDate":"2028-12-31"}""",
            )
        }
        assertEquals(HttpStatusCode.BadRequest, invalidEdit.status)

        assertEquals(HttpStatusCode.NoContent, adminClient.delete("/api/certificates/$certificateId").status)
        assertEquals(0, CertificateRepository(certificateDatabase).getAll().size)
    }

    private fun databasePath() = Path.of("build", "test-data", "certificate-${UUID.randomUUID()}.db")
}
