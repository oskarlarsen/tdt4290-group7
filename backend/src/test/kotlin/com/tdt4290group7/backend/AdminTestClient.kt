package com.tdt4290group7.backend

import com.tdt4290group7.backend.auth.AuthCookie
import com.tdt4290group7.backend.auth.JwtConfig
import com.tdt4290group7.backend.repository.UserRepository
import io.ktor.client.HttpClient
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.cookie
import io.ktor.server.testing.ApplicationTestBuilder

/** Use a signed real user cookie, keeping route tests independent of login rate limits. */
suspend fun ApplicationTestBuilder.adminClient(): HttpClient {
    startApplication()
    val user = UserRepository.findByEmail("advisor.hansen@kommune.no")!!
    val token = JwtConfig.generateToken(user, false).first
    return createClient { defaultRequest { cookie(AuthCookie.NAME, token) } }
}
