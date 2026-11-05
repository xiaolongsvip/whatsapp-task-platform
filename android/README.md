# Android app

Native Android application built with Kotlin and Jetpack Compose.

## Requirements

- Android Studio Ladybug (2024.2.1) or newer
- JDK 17
- Android SDK Platform 35
- Android Gradle Plugin 8.7.3 (downloaded by Android Studio/Gradle)
- An Android device or emulator (Android 8.0 / API 26 or newer)

## Open and run

1. Open Android Studio.
2. Choose **Open** and select the repository's `android/` folder.
3. Allow Android Studio to sync the Gradle project and download the Android Gradle Plugin and dependencies.
4. Connect an Android phone with USB debugging enabled, or create an emulator.
5. Select the `app` run configuration and press **Run**.

## Current scope (0.1.0)

- Native Activity and Jetpack Compose setup
- Green Material 3 theme
- Five-tab navigation shell
- Home screen foundation and module placeholders

Authentication, API integration, screenshot capture, overlay permission, and task workflows are intentionally not implemented in this foundation stage.


## User-authorized continuous screenshot session

- The member taps **Start capture session** after login. Android then displays its own screen-sharing consent UI.
- On Android 13+, notification permission is requested so the foreground-service notification can expose the **Capture current screen** and **Stop service** actions.
- After consent, `ScreenCaptureService` runs as a visible `mediaProjection` foreground service and creates one `VirtualDisplay` for that authorized session.
- Multiple manual screenshot requests reuse that same running session. The user can switch to the task app and use the ongoing notification's **Capture current screen** action.
- The service drains incoming ImageReader frames, but only encodes and saves a JPEG after the user explicitly requests a capture.
- Captures are stored in the app-private `filesDir/task-evidence/` directory. Uploading evidence to the task API is not implemented yet.
- The notification and in-app control can stop the session. Logout stops the service as well.
- Android may end a projection when the user stops it, the device locks, another projection begins, or the app process is killed. A new projection session then requires fresh Android consent; the app never persists or reuses the one-time consent token.
- If tasks only use WhatsApp, choose WhatsApp in Android's app-sharing picker. Choose **Share entire screen** only when a task genuinely requires capturing transitions across multiple apps.
