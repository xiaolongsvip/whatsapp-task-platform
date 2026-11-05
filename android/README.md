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

## Current scope (0.3.0)

- Kotlin + Jetpack Compose native member app
- Phone login with the shared platform account and encrypted session-cookie storage
- Sky-blue member dashboard connected to the shared dashboard API
- Five-tab navigation shell
- User-authorized MediaProjection foreground session with multiple manual screenshot captures per active session
- Ongoing notification actions for capture and stop
- Overlay permission status check (the floating overlay UI itself remains a separate module)
- Screenshots stored in app-private local storage; server evidence upload and task submission are not implemented yet


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


## Task screenshot evidence submission

1. In the Task Hall, claim a published task.
2. In **My tasks**, select the task as the current task.
3. Start the user-authorized screenshot session from the Home page if it is not already running.
4. Switch to the task app (for example, WhatsApp) and tap **Capture current screen** in the ongoing Android notification.
5. When a current task is selected, that one manually requested screenshot is uploaded to the authenticated task-submission endpoint and recorded as pending review. If no task is selected, the screenshot remains in app-private storage until the user chooses a task and submits it.
6. If upload fails, the JPEG remains locally available for manual retry from the Task Hall.

The API requires a private S3-compatible bucket. Set `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, and `STORAGE_REGION` in the API environment. Cloudflare R2 uses an S3-compatible endpoint and typically `STORAGE_REGION=auto`. Never put production credentials in source control.

After pulling database schema changes, run `pnpm db:push` and `pnpm db:generate` before starting the API.
