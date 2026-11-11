plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "online.havkar.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "online.havkar.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 3
        versionName = "1.0.1"
    }

    signingConfigs {
        create("release") {
            val storeFilePath = System.getenv("HAVKAR_UPLOAD_STORE_FILE")
            val storePasswordValue = System.getenv("HAVKAR_UPLOAD_STORE_PASSWORD")
            val keyAliasValue = System.getenv("HAVKAR_UPLOAD_KEY_ALIAS")
            val keyPasswordValue = System.getenv("HAVKAR_UPLOAD_KEY_PASSWORD")

            if (
                !storeFilePath.isNullOrBlank() &&
                !storePasswordValue.isNullOrBlank() &&
                !keyAliasValue.isNullOrBlank() &&
                !keyPasswordValue.isNullOrBlank()
            ) {
                storeFile = file(storeFilePath)
                storePassword = storePasswordValue
                keyAlias = keyAliasValue
                keyPassword = keyPasswordValue
            }
        }
    }

    buildTypes {
        release {
            // Explicit Play release posture — never ship a debuggable AAB.
            isDebuggable = false
            isMinifyEnabled = false
            isShrinkResources = false
            val releaseSigning = signingConfigs.findByName("release")
            if (
                releaseSigning != null &&
                releaseSigning.storeFile != null
            ) {
                signingConfig = releaseSigning
            }
        }
        debug {
            isDebuggable = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    testImplementation("junit:junit:4.13.2")
}
