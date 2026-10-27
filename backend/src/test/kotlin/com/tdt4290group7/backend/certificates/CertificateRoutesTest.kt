package com.tdt4290group7.backend.certificates

import com.tdt4290group7.backend.module
import com.tdt4290group7.backend.vehicles.VehicleRepository
import io.ktor.client.request.cookie
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.get
import io.ktor.client.request.delete
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.parseServerSetCookieHeader
import io.ktor.server.testing.testApplication
import java.io.ByteArrayOutputStream
import java.nio.file.Path
import java.time.Duration
import java.util.UUID
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

class CertificateRoutesTest {
    @Test
    fun certificatesRequireAnAdministratorSession() = testApplication {
        val path = databasePath()
        val repository = CertificateRepository(path)
        application {
            module(VehicleRepository(databasePath()), null, Duration.ofDays(14), repository)
        }

        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/certificates").status)

        val supplierCookie = login("supplier@nordvik.no")
        val response = client.get("/api/certificates") {
            cookie(supplierCookie.name, supplierCookie.value)
        }
        assertEquals(HttpStatusCode.Forbidden, response.status)
        assertEquals(
            HttpStatusCode.Forbidden,
            client.put("/api/certificates/unknown") {
                cookie(supplierCookie.name, supplierCookie.value)
                contentType(ContentType.Application.Json)
                setBody("""{"supplierName":"Example","certificateType":"ISO 14001"}""")
            }.status,
        )
        assertEquals(
            HttpStatusCode.Forbidden,
            client.delete("/api/certificates/unknown") {
                cookie(supplierCookie.name, supplierCookie.value)
            }.status,
        )
    }

    @Test
    fun administratorCanUploadParseAndRetrieveCertificateMetadata() = testApplication {
        val path = databasePath()
        val repository = CertificateRepository(path)
        application {
            module(VehicleRepository(databasePath()), null, Duration.ofDays(14), repository)
        }

        val authCookie = login("advisor.hansen@kommune.no")
        val response = client.post("/api/certificates") {
            cookie(authCookie.name, authCookie.value)
            setBody(
                MultiPartFormDataContent(
                    formData {
                        append("supplierName", "Example Transport AS")
                        append(
                            "file",
                            certificatePdf(),
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
        assertEquals("2028-12-31", uploaded.getValue("expiryDate").jsonPrimitive.content)

        val listed = client.get("/api/certificates") {
            cookie(authCookie.name, authCookie.value)
        }
        assertEquals(HttpStatusCode.OK, listed.status)
        val listedCertificate = Json.parseToJsonElement(listed.bodyAsText()).jsonArray.single().jsonObject
        assertEquals(uploaded.getValue("id").jsonPrimitive.content, listedCertificate.getValue("id").jsonPrimitive.content)

        val certificateId = uploaded.getValue("id").jsonPrimitive.content
        val edited = client.put("/api/certificates/$certificateId") {
            cookie(authCookie.name, authCookie.value)
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
        val persisted = CertificateRepository(path).getById(certificateId)!!
        assertEquals("Updated Transport AS", persisted.supplierName)
        assertEquals("CONTRACT-42", persisted.contractId)

        val invalidEdit = client.put("/api/certificates/$certificateId") {
            cookie(authCookie.name, authCookie.value)
            contentType(ContentType.Application.Json)
            setBody(
                """{"supplierName":"Updated Transport AS","certificateType":"ISO 14001","issueDate":"2029-01-01","expiryDate":"2028-12-31"}""",
            )
        }
        assertEquals(HttpStatusCode.BadRequest, invalidEdit.status)

        val deleteResponse = client.delete("/api/certificates/$certificateId") {
            cookie(authCookie.name, authCookie.value)
        }
        assertEquals(HttpStatusCode.NoContent, deleteResponse.status)
        assertEquals(
            HttpStatusCode.NotFound,
            client.delete("/api/certificates/$certificateId") {
                cookie(authCookie.name, authCookie.value)
            }.status,
        )
        assertEquals(0, CertificateRepository(path).getAll().size)

        assertEquals(0, CertificateRepository(path).getAll().size)
    }

    private suspend fun io.ktor.server.testing.ApplicationTestBuilder.login(email: String) =
        client.post("/api/auth/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"email":"$email","password":"test-only-${if (email.startsWith("advisor")) "admin" else "supplier"}-password"}""")
        }.let { response ->
            assertEquals(HttpStatusCode.OK, response.status)
            parseServerSetCookieHeader(response.headers.getAll(HttpHeaders.SetCookie)!!.single())
        }

    private fun databasePath() = Path.of("build", "test-data", "certificate-${UUID.randomUUID()}.db")

    private fun certificatePdf(): ByteArray {
        val output = ByteArrayOutputStream()
        org.apache.pdfbox.pdmodel.PDDocument().use { document ->
            val page = org.apache.pdfbox.pdmodel.PDPage()
            document.addPage(page)
            org.apache.pdfbox.pdmodel.PDPageContentStream(document, page).use { content ->
                content.beginText()
                content.setFont(
                    org.apache.pdfbox.pdmodel.font.PDType1Font(
                        org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName.HELVETICA,
                    ),
                    12f,
                )
                content.newLineAtOffset(50f, 700f)
                content.showText("ISO 14001 Environmental Certificate")
                content.newLineAtOffset(0f, -20f)
                content.showText("Expiry date: 31 December 2028")
                content.endText()
            }
            document.save(output)
        }
        return output.toByteArray()
    }
}
