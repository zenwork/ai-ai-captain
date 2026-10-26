package com.local.aiaicaptain.bridge

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets

@Service(Service.Level.PROJECT)
class AiAiCaptainProjectService(private val project: Project) {
    private val client = HttpClient.newHttpClient()
    private val baseUrl = System.getenv("AI_AI_CAPTAIN_URL") ?: "http://127.0.0.1:43681"
    private val sessionId = "intellij:${project.locationHash}"
    private var active = false

    fun report(label: String, model: String?, state: String) {
        val fields = mutableListOf(
            "\"id\":${quote(sessionId)}",
            "\"source\":\"intellij-idea\"",
            "\"harness\":\"intellij-bridge\"",
            "\"label\":${quote(label)}",
            "\"state\":${quote(state)}",
            "\"project\":${quote(project.basePath ?: project.name)}",
            "\"focusTarget\":{\"appName\":\"IntelliJ IDEA\"}"
        )
        if (!model.isNullOrBlank()) fields.add("\"model\":${quote(model)}")
        val body = "{${fields.joinToString(",")}}"
        val request = HttpRequest.newBuilder(URI.create("$baseUrl/api/sessions/${encode(sessionId)}"))
            .header("Content-Type", "application/json")
            .PUT(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
            .build()
        client.sendAsync(request, HttpResponse.BodyHandlers.discarding()).thenAccept { response ->
            if (response.statusCode() !in 200..299) System.err.println("AI AI Captain returned ${response.statusCode()}")
        }.exceptionally { error ->
            System.err.println("Could not reach AI AI Captain: ${error.message}")
            null
        }
        active = state != "done" && state != "failed"
    }

    fun end() {
        if (!active) return
        report(project.name + " AI session", null, "done")
        active = false
    }

    private fun quote(value: String): String = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\""
    private fun encode(value: String): String = java.net.URLEncoder.encode(value, StandardCharsets.UTF_8)
}
