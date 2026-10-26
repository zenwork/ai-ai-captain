plugins {
    kotlin("jvm") version "2.4.0"
    id("org.jetbrains.intellij.platform") version "2.19.0"
}

group = "com.local.aiaicaptain"
version = "0.1.0"

val localIdePath = providers.environmentVariable("AI_AI_CAPTAIN_IDEA_HOME").orNull

repositories {
    mavenCentral()
    intellijPlatform { defaultRepositories() }
}

dependencies {
    intellijPlatform {
        if (localIdePath.isNullOrBlank()) intellijIdeaCommunity("2025.1") else local(localIdePath)
        bundledPlugin("com.intellij.java")
    }
}

kotlin { jvmToolchain(21) }

intellijPlatform {
    pluginConfiguration {
        id = "com.local.aiaicaptain.bridge"
        name = "AI AI Captain Bridge"
        version = project.version.toString()
        ideaVersion { sinceBuild = "251" }
    }
}
