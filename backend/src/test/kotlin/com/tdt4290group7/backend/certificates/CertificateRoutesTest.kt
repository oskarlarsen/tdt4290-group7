package com.tdt4290group7.backend.certificates

import com.tdt4290group7.backend.adminClient
import com.tdt4290group7.backend.module
import com.tdt4290group7.backend.vehicles.VehicleRepository
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
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
        assertEquals(1, CertificateRepository(certificateDatabase).getAll().size)
    }

    private fun databasePath() = Path.of("build", "test-data", "certificate-${UUID.randomUUID()}.db")
}
