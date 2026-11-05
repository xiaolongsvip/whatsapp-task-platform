package com.wtp.app.capture

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.widget.TextView
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.wtp.app.MainActivity
import com.wtp.app.data.AuthRepository
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import java.util.UUID

/**
 * One foreground MediaProjection session is shared across multiple explicit
 * capture requests. The user starts/stops it from the app; the ongoing
 * notification also exposes Capture and Stop actions while another app is open.
 *
 * No screenshot is saved unless the user explicitly taps Capture.
 */
class ScreenCaptureService : Service() {
    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var workerThread: HandlerThread? = null
    private var workerHandler: Handler? = null
    private val captureRequested = AtomicBoolean(false)
    private var sessionStopped = false
    private var floatingAction: TextView? = null
    private var floatingParams: WindowManager.LayoutParams? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    private val projectionCallback = object : MediaProjection.Callback() {
        override fun onStop() {
            stopSession(stopProjection = false)
        }

        override fun onCapturedContentResize(width: Int, height: Int) {
            if (Build.VERSION.SDK_INT >= 34 && width > 0 && height > 0) {
                resizeCaptureTarget(width, height)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        workerThread = HandlerThread("wtp-screen-capture").apply { start() }
        workerHandler = Handler(workerThread!!.looper)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startSession(intent)
            ACTION_CAPTURE -> requestCapture()
            ACTION_SHOW_FLOATING -> mainHandler.post { showFloatingAction() }
            ACTION_HIDE_FLOATING -> mainHandler.post { removeFloatingAction() }
            ACTION_STOP -> stopSession(stopProjection = true)
            else -> {
                if (projection == null) stopSelf(startId)
            }
        }
        return START_NOT_STICKY
    }

    private fun startSession(intent: Intent) {
        if (projection != null) {
            updateNotification("截图会话已运行，可继续提交截图")
            CaptureSessionState.setActive(true)
            return
        }

        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val resultData = readProjectionResult(intent)
        if (resultCode != android.app.Activity.RESULT_OK || resultData == null) {
            CaptureSessionState.setError("没有取得有效的系统截图授权，请重新授权。")
            stopSelf()
            return
        }

        // Android 14+ requires the mediaProjection foreground service to be
        // active before getMediaProjection() is called.
        startProjectionForeground()
        try {
            val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val mediaProjection = manager.getMediaProjection(resultCode, resultData)
                ?: throw IllegalStateException("Android 没有返回屏幕捕获会话。")
            projection = mediaProjection
            mediaProjection.registerCallback(projectionCallback, Handler(Looper.getMainLooper()))

            val (width, height) = initialDisplaySize()
            val density = resources.displayMetrics.densityDpi
            imageReader = createReader(width, height)
            virtualDisplay = mediaProjection.createVirtualDisplay(
                "WTP task evidence capture",
                width,
                height,
                density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader!!.surface,
                null,
                workerHandler
            )

            sessionStopped = false
            CaptureSessionState.setError(null)
            CaptureSessionState.setActive(true)
            updateNotification("截图会话运行中；可使用悬浮按钮提交当前任务截图")
            mainHandler.post { showFloatingAction() }
        } catch (security: SecurityException) {
            CaptureSessionState.setError("Android 拒绝启动截图会话：${security.message ?: "权限已失效"}")
            stopSession(stopProjection = true)
        } catch (error: Exception) {
            CaptureSessionState.setError("截图服务启动失败：${error.message ?: "未知错误"}")
            stopSession(stopProjection = true)
        }
    }

    private fun readProjectionResult(intent: Intent): Intent? {
        return if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(EXTRA_RESULT_DATA)
        }
    }

    private fun initialDisplaySize(): Pair<Int, Int> {
        val windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        return if (Build.VERSION.SDK_INT >= 30) {
            val bounds = windowManager.maximumWindowMetrics.bounds
            Pair(bounds.width().coerceAtLeast(1), bounds.height().coerceAtLeast(1))
        } else {
            @Suppress("DEPRECATION")
            val metrics = DisplayMetrics().also { windowManager.defaultDisplay.getRealMetrics(it) }
            Pair(metrics.widthPixels.coerceAtLeast(1), metrics.heightPixels.coerceAtLeast(1))
        }
    }

    private fun createReader(width: Int, height: Int): ImageReader {
        return ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2).also { reader ->
            reader.setOnImageAvailableListener({ source -> onImageAvailable(source) }, workerHandler)
        }
    }

    private fun resizeCaptureTarget(width: Int, height: Int) {
        val display = virtualDisplay ?: return
        val oldReader = imageReader
        try {
            val replacement = createReader(width, height)
            display.resize(width, height, resources.displayMetrics.densityDpi)
            display.setSurface(replacement.surface)
            imageReader = replacement
            oldReader?.setOnImageAvailableListener(null, null)
            oldReader?.close()
        } catch (error: Exception) {
            CaptureSessionState.setError("调整截图尺寸失败：${error.message ?: "未知错误"}")
        }
    }

    private fun requestCapture() {
        if (projection == null || virtualDisplay == null || sessionStopped) {
            CaptureSessionState.setError("截图会话没有运行，请先在 APP 内开启。")
            stopSelf()
            return
        }
        if (!captureRequested.compareAndSet(false, true)) {
            updateNotification("正在处理上一张截图，请稍候")
            return
        }
        CaptureSessionState.setError(null)
        updateNotification("已请求截图，正在获取当前画面…")
    }

    private fun onImageAvailable(reader: ImageReader) {
        val image = try { reader.acquireLatestImage() } catch (_: Exception) { null } ?: return
        if (!captureRequested.get()) {
            image.close()
            return
        }
        try {
            val file = saveImage(image)
            CaptureSessionState.setLastCapture(file.name, file.absolutePath)

            val activeClaimId = CaptureSessionState.activeClaimId.value
            if (!activeClaimId.isNullOrBlank()) {
                try {
                    AuthRepository.submitTaskEvidence(
                        claimId = activeClaimId,
                        filePath = file.absolutePath,
                        note = "",
                        idempotencyKey = UUID.randomUUID().toString()
                    )
                    CaptureSessionState.markLastCaptureUploaded("截图已自动上传并提交审核")
                    updateNotification("截图已自动上传并提交审核")
                    mainHandler.post { removeFloatingAction() }
                } catch (uploadError: Exception) {
                    CaptureSessionState.setError("自动上传失败，截图已保存在本机，请检查网络后再次点击蓝色水球：${uploadError.message ?: "网络或存储错误"}")
                    updateNotification("上传失败；截图已保存在本机，可再次点击水球重试")
                    mainHandler.postDelayed({ showFloatingAction() }, 700)
                }
            } else {
                updateNotification("截图已保存：${file.name}；选择当前任务后可提交审核")
                mainHandler.postDelayed({ showFloatingAction() }, 700)
            }
        } catch (error: Exception) {
            CaptureSessionState.setError("保存截图失败：${error.message ?: "未知错误"}")
            updateNotification("截图保存失败；截图会话仍在运行")
            mainHandler.postDelayed({ showFloatingAction() }, 700)
        } finally {
            captureRequested.set(false)
            image.close()
        }
    }

    private fun showFloatingAction() {
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(this)) return
        if (projection == null || sessionStopped) return
        if (CaptureSessionState.activeClaimId.value.isNullOrBlank()) return
        if (floatingAction != null) return
        val manager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val density = resources.displayMetrics.density
        fun dp(value: Int) = (value * density).toInt()
        val waterBallBase = GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(
                android.graphics.Color.argb(178, 193, 245, 255),
                android.graphics.Color.argb(145, 49, 177, 245),
                android.graphics.Color.argb(112, 0, 111, 211),
                android.graphics.Color.argb(138, 0, 73, 166)
            )
        ).apply {
            shape = GradientDrawable.OVAL
            setStroke(dp(1), android.graphics.Color.argb(205, 220, 249, 255))
            setGradientType(GradientDrawable.RADIAL_GRADIENT)
            setGradientRadius(dp(42).toFloat())
            setGradientCenter(0.30f, 0.24f)
        }
        val waterBallReflection = GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(
                android.graphics.Color.argb(205, 255, 255, 255),
                android.graphics.Color.argb(92, 226, 249, 255),
                android.graphics.Color.argb(0, 255, 255, 255)
            )
        ).apply {
            shape = GradientDrawable.OVAL
        }
        val glassWaterBall = android.graphics.drawable.LayerDrawable(
            arrayOf(waterBallBase, waterBallReflection)
        ).apply {
            setLayerInset(1, dp(9), dp(5), dp(29), dp(35))
        }
        val button = TextView(this).apply {
            text = "已发送\n提交任务"
            textSize = 9f
            setTextColor(android.graphics.Color.WHITE)
            gravity = Gravity.CENTER
            setLineSpacing(0f, 0.92f)
            setPadding(dp(3), dp(3), dp(3), dp(3))
            contentDescription = "蓝色透明水球：已发送，点击截图并自动上传审核"
            background = glassWaterBall
            elevation = dp(10).toFloat()
        }
        val windowType = if (Build.VERSION.SDK_INT >= 26) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        val params = WindowManager.LayoutParams(
            dp(54),
            dp(54),
            windowType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.END
            x = dp(16)
            y = dp(210)
        }
        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        var dragged = false
        button.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    downX = event.rawX
                    downY = event.rawY
                    startX = params.x
                    startY = params.y
                    dragged = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - downX).toInt()
                    val dy = (event.rawY - downY).toInt()
                    if (kotlin.math.abs(dx) + kotlin.math.abs(dy) > dp(6)) dragged = true
                    params.x = (startX - dx).coerceAtLeast(0)
                    params.y = (startY - dy).coerceAtLeast(0)
                    runCatching { manager.updateViewLayout(button, params) }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!dragged) {
                        removeFloatingAction()
                        mainHandler.postDelayed({ requestCapture() }, 300)
                    }
                    true
                }
                else -> true
            }
        }
        try {
            manager.addView(button, params)
            floatingAction = button
            floatingParams = params
        } catch (_: Exception) {
            floatingAction = null
            floatingParams = null
        }
    }

    private fun removeFloatingAction() {
        val view = floatingAction ?: return
        floatingAction = null
        floatingParams = null
        val manager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        runCatching { manager.removeView(view) }
    }

    private fun saveImage(image: Image): File {
        val plane = image.planes.firstOrNull()
            ?: throw IllegalStateException("截图没有可读取的图像平面。")
        val buffer = plane.buffer
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        val paddedWidth = rowStride / pixelStride
        val padded = Bitmap.createBitmap(paddedWidth, image.height, Bitmap.Config.ARGB_8888)
        buffer.rewind()
        padded.copyPixelsFromBuffer(buffer)
        val cropped = if (paddedWidth == image.width) padded else {
            Bitmap.createBitmap(padded, 0, 0, image.width, image.height).also { padded.recycle() }
        }

        val directory = File(filesDir, "task-evidence").apply { mkdirs() }
        val file = File(directory, "capture_${System.currentTimeMillis()}.jpg")
        FileOutputStream(file).use { output ->
            if (!cropped.compress(Bitmap.CompressFormat.JPEG, 90, output)) {
                throw IllegalStateException("JPEG 编码失败。")
            }
            output.flush()
        }
        cropped.recycle()
        return file
    }

    private fun startProjectionForeground() {
        val notification = buildNotification("正在准备屏幕截图会话")
        if (Build.VERSION.SDK_INT >= 29) {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification(message: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(message))
    }

    private fun buildNotification(message: String): Notification {
        val openApp = PendingIntent.getActivity(
            this,
            REQUEST_OPEN_APP,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val capture = PendingIntent.getService(
            this,
            REQUEST_CAPTURE,
            Intent(this, ScreenCaptureService::class.java).setAction(ACTION_CAPTURE),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stop = PendingIntent.getService(
            this,
            REQUEST_STOP,
            Intent(this, ScreenCaptureService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentTitle("Task Platform 屏幕截图服务")
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setContentIntent(openApp)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(android.R.drawable.ic_menu_camera, "截图当前屏幕", capture)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "停止服务", stop)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "屏幕截图会话",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "在用户明确授权期间保持截图会话，并提供手动截图与停止操作。"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun stopSession(stopProjection: Boolean) {
        if (sessionStopped) {
            stopSelf()
            return
        }
        sessionStopped = true
        captureRequested.set(false)

        val currentProjection = projection
        projection = null
        if (currentProjection != null) {
            runCatching { currentProjection.unregisterCallback(projectionCallback) }
            if (stopProjection) runCatching { currentProjection.stop() }
        }

        virtualDisplay?.release()
        virtualDisplay = null
        imageReader?.setOnImageAvailableListener(null, null)
        imageReader?.close()
        imageReader = null

        mainHandler.post { removeFloatingAction() }
        CaptureSessionState.setActive(false)
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    override fun onDestroy() {
        removeFloatingAction()
        if (!sessionStopped) stopSession(stopProjection = true)
        workerThread?.quitSafely()
        workerThread = null
        workerHandler = null
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Keep the explicitly authorized foreground session alive while the
        // user switches apps or removes the task from Recents. Android/system
        // termination still ends the projection and requires fresh consent.
        super.onTaskRemoved(rootIntent)
    }

    companion object {
        const val ACTION_START = "com.wtp.app.capture.START"
        const val ACTION_CAPTURE = "com.wtp.app.capture.CAPTURE"
        const val ACTION_SHOW_FLOATING = "com.wtp.app.capture.SHOW_FLOATING"
        const val ACTION_HIDE_FLOATING = "com.wtp.app.capture.HIDE_FLOATING"
        const val ACTION_STOP = "com.wtp.app.capture.STOP"
        const val EXTRA_RESULT_CODE = "projection_result_code"
        const val EXTRA_RESULT_DATA = "projection_result_data"

        private const val CHANNEL_ID = "wtp_screen_capture"
        private const val NOTIFICATION_ID = 7401
        private const val REQUEST_OPEN_APP = 7402
        private const val REQUEST_CAPTURE = 7403
        private const val REQUEST_STOP = 7404
    }
}
