plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val releaseApiBaseUrl = providers.gradleProperty("wtpApiBaseUrl")
    .orElse(providers.environmentVariable("WTP_API_BASE_URL"))
    .orNull

fun String.toBuildConfigString(): String =
    "\"" + replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "com.wtp.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.wtp.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 145
        versionName = "1.4.5"
        // Emulator-only default. Release variants override this with an injected HTTPS URL.
        buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:3002/api/v1/\"")
    }

    buildTypes {
        getByName("release") {
            buildConfigField(
                "String",
                "API_BASE_URL",
                (releaseApiBaseUrl ?: "https://api.example.invalid/api/v1/").toBuildConfigString(),
            )
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

val verifyReleaseApiBaseUrl by tasks.registering {
    group = "verification"
    description = "Requires a real HTTPS API base URL before building a release APK or bundle."
    doLast {
        val raw = releaseApiBaseUrl
            ?: throw GradleException("Release builds require -PwtpApiBaseUrl=https://your-api-host/api/v1/ or WTP_API_BASE_URL.")
        val uri = try {
            java.net.URI(raw)
        } catch (error: Exception) {
            throw GradleException("WTP release API URL is invalid: $raw", error)
        }
        if (uri.scheme != "https" || uri.host.isNullOrBlank() || uri.host == "api.example.invalid" || uri.userInfo != null) {
            throw GradleException("WTP release API URL must be a real HTTPS URL without embedded credentials: $raw")
        }
    }
}

tasks.configureEach {
    if (name in setOf("assembleRelease", "bundleRelease")) {
        dependsOn(verifyReleaseApiBaseUrl)
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.zxing:core:3.5.3")
    testImplementation("junit:junit:4.13.2")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
