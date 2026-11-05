package com.wtp.app.ui

import android.content.ActivityNotFoundException
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.HeadsetMic
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.wtp.app.capture.CaptureSessionState
import com.wtp.app.capture.ScreenCaptureService
import com.wtp.app.data.AuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

private val WtpGreen = Color(0xFF27BD68)
private val WtpDarkGreen = Color(0xFF176B8A)
private val WtpPaleGreen = Color(0xFFE4F4EC)
private val WtpPage = Color(0xFFF0F7FB)
private val WtpSky = Color(0xFFE6F3FA)
private val WtpSkyBorder = Color(0xFFD5E9F4)
private val WtpText = Color(0xFF17212F)
private val WtpMuted = Color(0xFF647987)

private enum class TaskMainTab { HALL, RECORDS }
private enum class HallFilter { AVAILABLE, IN_PROGRESS, EXPIRED, REJECTED, SETTLED }
private enum class RecordFilter { ALL, IN_PROGRESS, COMPLETED, NEED_ACTION, INCOMPLETE }

@Composable
fun TaskHallScreen(
    modifier: Modifier = Modifier,
    language: String,
    onLanguageChanged: (String) -> Unit = {},
) {
    val isEnglish = language == "en"
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val activeClaimId by CaptureSessionState.activeClaimId.collectAsState()
    val uploadMessage by CaptureSessionState.uploadMessage.collectAsState()
    val captureError by CaptureSessionState.error.collectAsState()
    val lastCaptureName by CaptureSessionState.lastCaptureName.collectAsState()
    val lastCapturePath by CaptureSessionState.lastCapturePath.collectAsState()
    val lastCaptureClaimId by CaptureSessionState.lastCaptureClaimId.collectAsState()

    var tasks by remember { mutableStateOf(emptyList<JSONObject>()) }
    var claims by remember { mutableStateOf(emptyList<JSONObject>()) }
    var dashboard by remember { mutableStateOf(JSONObject()) }
    var loading by remember { mutableStateOf(true) }
    var busyId by remember { mutableStateOf<String?>(null) }
    var abandoningId by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var mainTab by remember { mutableStateOf(TaskMainTab.HALL) }
    var hallFilter by remember { mutableStateOf(HallFilter.AVAILABLE) }
    var recordFilter by remember { mutableStateOf(RecordFilter.ALL) }
    var selectedClaimId by remember { mutableStateOf<String?>(null) }
    var languageMenuOpen by remember { mutableStateOf(false) }
    var supportDialogOpen by remember { mutableStateOf(false) }

    fun refresh() {
        scope.launch {
            loading = true
            error = null
            try {
                val result = withContext(Dispatchers.IO) {
                    Triple(
                        AuthRepository.publishedTasks(),
                        AuthRepository.myTaskClaims(),
                        AuthRepository.dashboard()
                    )
                }
                tasks = result.first.optJSONArray("tasks").asObjectList()
                claims = result.second.optJSONArray("claims").asObjectList()
                dashboard = result.third
            } catch (e: Exception) {
                error = e.message ?: if (isEnglish) "Could not load tasks." else "任务加载失败。"
            } finally {
                loading = false
            }
        }
    }

    fun startAndOpenWhatsApp(claim: JSONObject) {
        // Do not start the task or leave the app until both required permissions
        // are ready. The overlay hosts the screenshot control; the active
        // MediaProjection session enables screenshot evidence capture.
        if (!android.provider.Settings.canDrawOverlays(context)) {
            Toast.makeText(
                context,
                if (isEnglish) "Enable overlay permission on the Home page before opening WhatsApp."
                else "请先在首页开启悬浮窗权限，再前往 WhatsApp。",
                Toast.LENGTH_LONG
            ).show()
            runCatching {
                context.startActivity(
                    Intent(
                        android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:${context.packageName}")
                    )
                )
            }
            return
        }
        if (!CaptureSessionState.active.value) {
            Toast.makeText(
                context,
                if (isEnglish) "Start the screenshot session on the Home page before opening WhatsApp."
                else "请先在首页开启持续截图会话，再前往 WhatsApp。",
                Toast.LENGTH_LONG
            ).show()
            return
        }

        val claimId = claim.optString("id")
        scope.launch {
            busyId = claimId
            error = null
            try {
                val started = withContext(Dispatchers.IO) {
                    AuthRepository.startTaskClaim(claimId)
                }
                claims = claims.map { existing ->
                    if (existing.optString("id") == claimId) started else existing
                }
                CaptureSessionState.setActiveClaim(claimId)
                // Permissions were checked before the claim was started.
                context.startService(
                    Intent(context, ScreenCaptureService::class.java)
                        .setAction(ScreenCaptureService.ACTION_SHOW_FLOATING)
                )
                openWhatsApp(context, started, isEnglish)
            } catch (e: Exception) {
                error = e.message ?: if (isEnglish) "Could not start the task." else "启动任务失败，请重试。"
            } finally {
                busyId = null
            }
        }
    }

    LaunchedEffect(Unit) { refresh() }
    LaunchedEffect(uploadMessage) {
        if (!lastCaptureName.isNullOrBlank()) {
            val evidenceClaim = claims.firstOrNull { it.optString("id") == lastCaptureClaimId }
            val evidenceTaskTitle = evidenceClaim?.optJSONObject("task")?.optString("title")
                ?.takeIf { it.isNotBlank() && it != "null" }
            Surface(
                color = if (lastCapturePath.isNullOrBlank() && !uploadMessage.isNullOrBlank()) WtpPaleGreen else Color(0xFFEAF4FF),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
                shape = RoundedCornerShape(10.dp)
            ) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        if (isEnglish) "Latest screenshot evidence" else "最近一次截图凭证",
                        color = WtpText,
                        fontWeight = FontWeight.Bold
                    )
                    if (evidenceTaskTitle != null) {
                        Text(
                            (if (isEnglish) "Task: " else "所属任务：") + evidenceTaskTitle,
                            color = WtpText
                        )
                    }
                    Text(
                        (if (isEnglish) "File: " else "截图文件：") + lastCaptureName.orEmpty(),
                        color = WtpMuted,
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(
                        when {
                            !lastCapturePath.isNullOrBlank() && !captureError.isNullOrBlank() ->
                                if (isEnglish) "Upload failed — original screenshot retained; tap the floating bubble to retry." else "上传失败，原截图已保留；点击悬浮水球可重传。"
                            !lastCapturePath.isNullOrBlank() ->
                                if (isEnglish) "Screenshot saved; upload is pending." else "截图已保存，正在等待上传或重传。"
                            !uploadMessage.isNullOrBlank() ->
                                if (isEnglish) "Uploaded successfully and submitted for review." else "已上传成功并提交审核。"
                            else -> if (isEnglish) "Screenshot saved locally." else "截图已保存在本机。"
                        },
                        color = if (lastCapturePath.isNullOrBlank() && !uploadMessage.isNullOrBlank()) WtpDarkGreen else WtpMuted,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
        if (!uploadMessage.isNullOrBlank()) {
            // A successful evidence upload changes the server-side claim state.
            // Refresh all task data so the hall and records never keep stale status.
            refresh()
            mainTab = TaskMainTab.RECORDS
            recordFilter = RecordFilter.ALL
        }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { refresh() }

    val inProgressClaims = claims.filter { it.optString("status") in IN_PROGRESS_STATUSES }
    val expiredClaims = claims.filter { it.optString("status") in setOf("EXPIRED", "CANCELLED") }
    val rejectedClaims = claims.filter { it.optString("status") == "REJECTED" }
    val settledClaims = claims.filter { it.optString("status") == "APPROVED" }
    // API supplies one independent card for every available authorized number slot.
    val availableTasks = tasks

    val selectedClaim = claims.firstOrNull { it.optString("id") == selectedClaimId }

    val claimedLastSevenDays = claims.count { it.isWithinLastSevenDays() }
    val approvedLastSevenDays = claims.count {
        it.optString("status") == "APPROVED" && it.isWithinLastSevenDays()
    }
    val rejectedLastSevenDays = claims.count {
        it.optString("status") == "REJECTED" && it.isWithinLastSevenDays()
    }
    val claimedToday = dashboard.optJSONObject("stats")?.optInt("claimedToday") ?: 0
    val dailyLimit = dashboard.optInt("dailyTaskLimit", 20).coerceAtLeast(1)
    val remainingToday = (dailyLimit - claimedToday).coerceAtLeast(0)
    val withdrawable = dashboard.optJSONArray("balances").asObjectList().firstOrNull()
    val balanceCurrency = withdrawable?.optString("currency", "USD") ?: "USD"
    val balanceAmount = withdrawable?.optString("amountMinor", "0") ?: "0"

    val displayedClaims = when (hallFilter) {
        HallFilter.AVAILABLE -> emptyList()
        HallFilter.IN_PROGRESS -> inProgressClaims
        HallFilter.EXPIRED -> expiredClaims
        HallFilter.REJECTED -> rejectedClaims
        HallFilter.SETTLED -> settledClaims
    }

    val displayedRecords = when (recordFilter) {
        RecordFilter.ALL -> claims
        RecordFilter.IN_PROGRESS -> inProgressClaims
        RecordFilter.COMPLETED -> settledClaims
        RecordFilter.NEED_ACTION -> rejectedClaims
        RecordFilter.INCOMPLETE -> expiredClaims
    }

    Column(
        modifier.fillMaxSize().background(WtpPage).padding(bottom = 2.dp),
        verticalArrangement = Arrangement.spacedBy(0.dp)
    ) {
        Row(
            Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (selectedClaim != null) {
                OutlinedButton(
                    onClick = {
                        selectedClaimId = null
                        mainTab = TaskMainTab.HALL
                        hallFilter = HallFilter.IN_PROGRESS
                        refresh()
                    },
                    shape = RoundedCornerShape(24.dp)
                ) {
                    androidx.compose.material3.Icon(Icons.Default.ArrowBack, contentDescription = if (isEnglish) "Back" else "返回", tint = Color(0xFF526B60))
                }
            } else {
                Surface(color = Color.White, shape = RoundedCornerShape(24.dp), border = androidx.compose.foundation.BorderStroke(1.dp, WtpSkyBorder)) {
                    Row(Modifier.padding(start = 5.dp, end = 12.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Surface(color = WtpGreen, shape = RoundedCornerShape(18.dp)) {
                            Text(if (isEnglish) "Withdraw" else "提现", Modifier.padding(horizontal = 7.dp, vertical = 3.dp), color = Color.White, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                        Spacer(Modifier.width(8.dp))
                        Text(formatCompactBalance(balanceAmount, balanceCurrency), color = WtpText, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Text(
                if (selectedClaim != null) { if (isEnglish) "Task" else "任务" }
                else if (mainTab == TaskMainTab.HALL) { if (isEnglish) "Task hall" else "任务大厅" }
                else { if (isEnglish) "Task records" else "任务记录" },
                color = Color(0xFF40594E),
                fontWeight = FontWeight.SemiBold
            )
            if (selectedClaim == null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.IconButton(onClick = {
                        val supportUrl = dashboard.optString("supportUrl").takeIf { it.isNotBlank() && it != "null" }
                        if (supportUrl == null) supportDialogOpen = true
                        else runCatching {
                            val uri = Uri.parse(supportUrl)
                            require(uri.scheme == "https" || uri.scheme == "http")
                            context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                        }.onFailure { supportDialogOpen = true }
                    }) {
                        androidx.compose.material3.Icon(Icons.Default.HeadsetMic, contentDescription = if (isEnglish) "Customer support" else "客服", tint = Color(0xFF58786A))
                    }
                    Box {
                        androidx.compose.material3.IconButton(onClick = { languageMenuOpen = true }) {
                            androidx.compose.material3.Icon(Icons.Default.Language, contentDescription = if (isEnglish) "Language" else "语言", tint = Color(0xFF58786A))
                        }
                        androidx.compose.material3.DropdownMenu(expanded = languageMenuOpen, onDismissRequest = { languageMenuOpen = false }) {
                            androidx.compose.material3.DropdownMenuItem(text = { Text("简体中文") }, onClick = {
                                languageMenuOpen = false
                                scope.launch {
                                    try {
                                        withContext(Dispatchers.IO) { AuthRepository.updateLocale("zh-CN") }
                                        onLanguageChanged("zh-CN")
                                    } catch (e: Exception) { error = e.message ?: "语言保存失败" }
                                }
                            })
                            androidx.compose.material3.DropdownMenuItem(text = { Text("English") }, onClick = {
                                languageMenuOpen = false
                                scope.launch {
                                    try {
                                        withContext(Dispatchers.IO) { AuthRepository.updateLocale("en") }
                                        onLanguageChanged("en")
                                    } catch (e: Exception) { error = e.message ?: "Could not save language" }
                                }
                            })
                        }
                    }
                }
            } else {
                Spacer(Modifier.width(80.dp))
            }
        }

        if (selectedClaim == null) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 8.dp)) {
            MainTab(
                text = if (isEnglish) "Task hall" else "任务大厅",
                selected = mainTab == TaskMainTab.HALL,
                modifier = Modifier.weight(1f),
                onClick = { mainTab = TaskMainTab.HALL }
            )
            MainTab(
                text = if (isEnglish) "Task records" else "任务记录",
                selected = mainTab == TaskMainTab.RECORDS,
                modifier = Modifier.weight(1f),
                onClick = { mainTab = TaskMainTab.RECORDS }
            )
        }

        if (!uploadMessage.isNullOrBlank()) {
            Surface(
                color = WtpPaleGreen,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    uploadMessage.orEmpty(),
                    Modifier.padding(12.dp),
                    color = WtpDarkGreen,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
        if (!captureError.isNullOrBlank()) {
            Surface(
                color = Color(0xFFFFF1E8),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text(
                    captureError.orEmpty(),
                    Modifier.padding(12.dp),
                    color = Color(0xFF9A3412),
                    fontWeight = FontWeight.Medium
                )
            }
        }
        if (notice != null) {
            Surface(
                color = Color(0xFFEAF4FF),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text(notice.orEmpty(), Modifier.padding(10.dp), color = Color(0xFF245987))
            }
        }
        if (error != null) {
            Surface(
                color = Color(0xFFFFEEEE),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
                shape = RoundedCornerShape(10.dp)
            ) {
                Column(Modifier.padding(12.dp)) {
                    Text(error.orEmpty(), color = Color(0xFFB42318))
                    TextButton(onClick = { refresh() }) {
                        Text(if (isEnglish) "Retry" else "重试")
                    }
                }
            }
        }

        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (mainTab == TaskMainTab.HALL) {
                HallFilterTabs(
                    selected = hallFilter,
                    isEnglish = isEnglish,
                    onSelect = { hallFilter = it }
                )

                when (hallFilter) {
                    HallFilter.AVAILABLE -> {
                        SummaryCard(
                            title = if (isEnglish) "Daily allowance" else "领取额度",
                            columns = listOf(
                                (if (isEnglish) "Claimed" else "已领取") to "$claimedToday / $dailyLimit",
                                (if (isEnglish) "Remaining" else "剩余") to remainingToday.toString(),
                                (if (isEnglish) "Available" else "可领取") to availableTasks.size.toString()
                            )
                        )
                        if (loading && tasks.isEmpty()) {
                            LoadingState()
                        } else if (availableTasks.isEmpty()) {
                            EmptyState(
                                title = if (isEnglish) "No available tasks" else "暂无可领取任务",
                                subtitle = if (isEnglish) "Please check again later." else "目前没有符合条件的任务，请稍后刷新查看。"
                            )
                        } else {
                            availableTasks.forEach { task ->
                                AvailableTaskCard(
                                    task = task,
                                    isEnglish = isEnglish,
                                    busy = busyId == task.optString("id") || busyId != null,
                                    onStart = {
                                        val taskId = task.optString("taskId")
                                        val slotId = task.optString("slotId")
                                        scope.launch {
                                            busyId = slotId
                                            error = null
                                            notice = null
                                            try {
                                                val result = withContext(Dispatchers.IO) {
                                                    AuthRepository.claimTask(taskId, slotId, UUID.randomUUID().toString())
                                                }
                                                val claimId = result.optString("id")
                                                if (claimId.isNotBlank()) {
                                                    CaptureSessionState.setActiveClaim(claimId)
                                                    claims = claims.filterNot { it.optString("id") == claimId } + result
                                                    selectedClaimId = claimId
                                                } else {
                                                    throw IllegalStateException(if (isEnglish) "The claim response did not include an ID." else "领取结果缺少任务编号，请刷新后重试。")
                                                }
                                                refresh()
                                            } catch (e: Exception) {
                                                error = e.message ?: if (isEnglish) "Could not start task." else "领取任务失败。"
                                            } finally {
                                                busyId = null
                                            }
                                        }
                                    }
                                )
                            }
                        }
                    }
                    HallFilter.IN_PROGRESS -> {
                        SummaryCard(
                            title = if (isEnglish) "In progress" else "进行中",
                            columns = listOf(
                                (if (isEnglish) "Executing" else "当前执行") to inProgressClaims.count {
                                    it.optString("status") in setOf("CLAIMED", "IN_PROGRESS")
                                }.toString(),
                                (if (isEnglish) "Under review" else "审核中") to inProgressClaims.count {
                                    it.optString("status") in setOf("SUBMITTED", "UNDER_REVIEW")
                                }.toString(),
                                (if (isEnglish) "Need action" else "待处理") to rejectedClaims.size.toString()
                            )
                        )
                        if (loading && claims.isEmpty()) LoadingState()
                        else if (inProgressClaims.isEmpty()) EmptyState(
                            if (isEnglish) "No tasks in progress" else "暂无进行中任务",
                            if (isEnglish) "Claim a task to see it here." else "当前没有符合条件的任务，请先领取任务。"
                        )
                        else inProgressClaims.forEach { claim ->
                            ClaimedTaskCard(
                                claim = claim,
                                isEnglish = isEnglish,
                                activeClaimId = activeClaimId,
                                busy = busyId != null,
                                onViewDetails = {
                                    if (activeClaimId != null) {
                                        CaptureSessionState.clearActiveClaim()
                                        if (CaptureSessionState.active.value) {
                                            context.startService(
                                                Intent(context, ScreenCaptureService::class.java)
                                                    .setAction(ScreenCaptureService.ACTION_HIDE_FLOATING)
                                            )
                                        }
                                    }
                                    selectedClaimId = claim.optString("id")
                                },
                                onGoWhatsApp = { startAndOpenWhatsApp(claim) },
                                onSelect = {
                                    CaptureSessionState.setActiveClaim(claim.optString("id"))
                                    notice = if (isEnglish) "This task is selected for evidence capture." else "已将该任务设为当前截图提交任务。"
                                }
                            )
                        }
                    }
                    HallFilter.EXPIRED -> {
                        SummaryCard(
                            title = if (isEnglish) "Expired" else "已过期",
                            columns = listOf(
                                (if (isEnglish) "Expired" else "已过期") to expiredClaims.count { it.optString("status") == "EXPIRED" }.toString(),
                                (if (isEnglish) "Cancelled" else "已取消") to expiredClaims.count { it.optString("status") == "CANCELLED" }.toString(),
                                (if (isEnglish) "Records" else "记录") to expiredClaims.size.toString()
                            )
                        )
                        if (expiredClaims.isEmpty()) EmptyState(
                            if (isEnglish) "No expired tasks" else "暂无过期任务",
                            if (isEnglish) "Expired task records will appear here." else "过期或取消的任务会显示在这里。"
                        ) else expiredClaims.forEach { ClaimRecordCard(it, isEnglish) }
                    }
                    HallFilter.REJECTED -> {
                        SummaryCard(
                            title = if (isEnglish) "Rejected" else "已拒绝",
                            columns = listOf((if (isEnglish) "Rejected" else "已拒绝") to rejectedClaims.size.toString())
                        )
                        if (rejectedClaims.isEmpty()) EmptyState(
                            if (isEnglish) "No rejected tasks" else "暂无已拒绝任务",
                            if (isEnglish) "Tasks requiring resubmission will appear here." else "审核未通过的任务会显示在这里。"
                        ) else rejectedClaims.forEach { claim ->
                            ClaimedTaskCard(
                                claim = claim,
                                isEnglish = isEnglish,
                                activeClaimId = activeClaimId,
                                busy = busyId != null,
                                onViewDetails = { selectedClaimId = claim.optString("id") },
                                onGoWhatsApp = { startAndOpenWhatsApp(claim) },
                                onSelect = {
                                    CaptureSessionState.setActiveClaim(claim.optString("id"))
                                    notice = if (isEnglish) "This task is selected for resubmission." else "已选择此任务，可返回 WhatsApp 重新处理。"
                                }
                            )
                        }
                    }
                    HallFilter.SETTLED -> {
                        SummaryCard(
                            title = if (isEnglish) "Settled" else "已结算",
                            columns = listOf((if (isEnglish) "Settled" else "已结算") to settledClaims.size.toString())
                        )
                        if (settledClaims.isEmpty()) EmptyState(
                            if (isEnglish) "No settled tasks" else "暂无已结算任务",
                            if (isEnglish) "Approved and settled tasks will appear in records." else "任务审核和奖励结算进度可在记录页查看。"
                        ) else settledClaims.forEach { ClaimRecordCard(it, isEnglish) }
                    }
                }
            } else {
                RecordFilterTabs(
                    selected = recordFilter,
                    isEnglish = isEnglish,
                    onSelect = { recordFilter = it }
                )
                SummaryCard(
                    title = if (isEnglish) "Last 7 days" else "近 7 天领取的任务",
                    columns = listOf(
                        (if (isEnglish) "Claimed" else "已领取") to claimedLastSevenDays.toString(),
                        (if (isEnglish) "Approved" else "已通过") to approvedLastSevenDays.toString(),
                        (if (isEnglish) "Returned" else "已驳回") to rejectedLastSevenDays.toString()
                    )
                )
                if (loading && claims.isEmpty()) LoadingState()
                else if (displayedRecords.isEmpty()) EmptyState(
                    if (isEnglish) "No matching records" else "暂无相关记录",
                    if (isEnglish) "Try another category or refresh." else "试试其他分类，或下拉刷新。"
                )
                else displayedRecords.sortedByDescending { it.optString("claimedAt") }.forEach { claim ->
                    ClaimRecordCard(claim, isEnglish)
                }
            }
        }
        } else {
            TaskExecutionScreen(
                claim = selectedClaim,
                isEnglish = isEnglish,
                activeClaimId = activeClaimId,
                errorMessage = error,
                abandoning = abandoningId == selectedClaim.optString("id"),
                starting = busyId == selectedClaim.optString("id"),
                onGoWhatsApp = { startAndOpenWhatsApp(selectedClaim) },
                onAbandon = {
                    val claimId = selectedClaim.optString("id")
                    scope.launch {
                        busyId = claimId
                        abandoningId = claimId
                        error = null
                        try {
                            withContext(Dispatchers.IO) { AuthRepository.cancelTaskClaim(claimId) }
                            if (activeClaimId == claimId) {
                                CaptureSessionState.clearActiveClaim()
                                if (CaptureSessionState.active.value) {
                                    context.startService(
                                        Intent(context, ScreenCaptureService::class.java)
                                            .setAction(ScreenCaptureService.ACTION_HIDE_FLOATING)
                                    )
                                }
                            }
                            selectedClaimId = null
                            mainTab = TaskMainTab.HALL
                            hallFilter = HallFilter.IN_PROGRESS
                            notice = if (isEnglish) "Task abandoned. The assigned contact has been returned to the pool." else "任务已放弃，分配的号码已按规则释放。"
                            refresh()
                        } catch (e: Exception) {
                            error = e.message ?: if (isEnglish) "Could not abandon this task." else "放弃任务失败，请重试。"
                        } finally {
                            busyId = null
                            abandoningId = null
                        }
                    }
                }
            )
        }
    }

    if (supportDialogOpen) {
        AlertDialog(
            onDismissRequest = { supportDialogOpen = false },
            title = { Text(if (isEnglish) "Customer support" else "联系客服") },
            text = { Text(if (isEnglish) "The support link has not been configured yet. Please contact the administrator." else "客服入口暂未配置，请联系管理员获取帮助。") },
            confirmButton = {
                TextButton(onClick = { supportDialogOpen = false }) {
                    Text(if (isEnglish) "OK" else "知道了")
                }
            }
        )
    }
}

@Composable
private fun TaskExecutionScreen(
    claim: JSONObject,
    isEnglish: Boolean,
    activeClaimId: String?,
    errorMessage: String?,
    abandoning: Boolean,
    starting: Boolean,
    onGoWhatsApp: () -> Unit,
    onAbandon: () -> Unit
) {
    val task = claim.optJSONObject("task") ?: JSONObject()
    val status = claim.optString("status")
    val phone = claim.optString("assignedPhoneNumber")
    val previewTitle = task.optString("previewTitle").takeUnless { it == "null" }.orEmpty()
    val previewDescription = task.optString("previewDescription").takeUnless { it == "null" }.orEmpty()
    val previewImageUrl = task.optString("previewImageUrl").takeUnless { it == "null" }.orEmpty()
    val link = task.optString("linkUrl").takeUnless { it == "null" }.orEmpty()
    val message = task.optString("messageTemplate").takeUnless { it == "null" }.orEmpty()
    val expiryValue = claim.optString("expiresAt")
    val timerStarted = expiryValue.isNotBlank() && expiryValue != "null"
    val expiryMillis = remember(expiryValue) {
        if (timerStarted) runCatching { Instant.parse(expiryValue).toEpochMilli() }.getOrDefault(0L) else 0L
    }
    var remainingSeconds by remember(expiryMillis, timerStarted) {
        mutableStateOf(if (timerStarted) ((expiryMillis - System.currentTimeMillis()) / 1000).coerceAtLeast(0) else 180L)
    }
    var showAbandonDialog by remember { mutableStateOf(false) }
    val canAbandon = status in setOf("CLAIMED", "IN_PROGRESS", "REJECTED", "EXPIRED")
    val reward = formatTaskReward(task.optString("rewardMinor"), task.optString("currency", "USD"))

    LaunchedEffect(expiryMillis, timerStarted) {
        while (timerStarted && remainingSeconds > 0) {
            remainingSeconds = ((expiryMillis - System.currentTimeMillis()) / 1000).coerceAtLeast(0)
            if (remainingSeconds > 0) delay(1000)
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                Text(if (isEnglish) "WhatsApp private message task" else "WhatsApp 私信任务", color = WtpText, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatusPill(claimStatus(status, isEnglish), WtpPaleGreen, WtpDarkGreen)
                    StatusPill("WhatsApp", WtpSky, WtpDarkGreen)
                    if (activeClaimId == claim.optString("id")) {
                        Text(if (isEnglish) "Evidence task" else "截图任务", color = WtpDarkGreen, style = MaterialTheme.typography.labelSmall)
                    }
                }
                Text(
                    if (isEnglish) "Manually send the specified message, then submit a screenshot for review." else "手动发送指定信息，提交截图审核",
                    color = WtpMuted,
                    style = MaterialTheme.typography.bodySmall
                )
                val latestSubmission = claim.optJSONObject("latestSubmission")
                val reviewReason = latestSubmission?.optString("reviewReason")
                    ?.takeUnless { it.isNullOrBlank() || it == "null" }
                if (status == "REJECTED") {
                    Surface(
                        color = Color(0xFFFFF4E8),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Text(
                                if (isEnglish) "Resubmission required" else "本次审核未通过，请按原因修正后重新提交",
                                color = Color(0xFF9A3412),
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                if (reviewReason != null) {
                                    (if (isEnglish) "Reviewer feedback: " else "驳回原因：") + reviewReason
                                } else {
                                    if (isEnglish) "No reviewer note was provided. Check the task requirements and submit a clear new screenshot." else "管理员没有填写具体原因，请重新核对任务要求，并提交清晰完整的新截图。"
                                },
                                color = Color(0xFF7C2D12),
                                style = MaterialTheme.typography.bodySmall
                            )
                            Text(
                                if (isEnglish) "After correcting the issue, return here and tap the floating capture button to upload a new screenshot. The previous submission remains in your records." else "修正后返回本页，点击悬浮水球重新截图并上传。旧截图记录会保留。",
                                color = Color(0xFF7C2D12),
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                }
                Row(
                    Modifier.fillMaxWidth().background(Color(0xFFF3F8F5), RoundedCornerShape(10.dp))
                        .padding(horizontal = 12.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(if (isEnglish) "Reward" else "单次奖励", color = WtpMuted, style = MaterialTheme.typography.bodySmall)
                        Text(reward, color = WtpDarkGreen, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    }
                    Surface(Modifier.width(1.dp).height(34.dp), color = WtpSkyBorder) {}
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(if (isEnglish) "Time remaining" else "剩余时间", color = WtpMuted, style = MaterialTheme.typography.bodySmall)
                        Text(
                            String.format(Locale.ROOT, "%02d:%02d", remainingSeconds / 60, remainingSeconds % 60),
                            color = if (remainingSeconds <= 30) Color(0xFFD14343) else WtpDarkGreen,
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleMedium
                        )
                    }
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(if (isEnglish) "Task steps" else "任务步骤", color = WtpText, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                    StepNumber(1)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        Text(if (isEnglish) "Open WhatsApp" else "打开 WhatsApp", color = WtpText, fontWeight = FontWeight.SemiBold)
                        Text(if (isEnglish) "Check the assigned contact and prepared message before sending." else "核对后台分配的号码和预设内容，确认无误后再发送。", color = WtpMuted, style = MaterialTheme.typography.bodySmall)
                        Button(
                            onClick = onGoWhatsApp,
                            enabled = !starting && phone.isNotBlank() && phone != "null" && status in setOf("CLAIMED", "IN_PROGRESS", "REJECTED") && (!timerStarted || remainingSeconds > 0),
                            modifier = Modifier.height(44.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = WtpGreen),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text(
                                when {
                                    starting -> if (isEnglish) "Opening…" else "正在打开…"
                                    status == "REJECTED" -> if (isEnglish) "Correct & reopen WhatsApp" else "修改后重新前往 WhatsApp"
                                    else -> if (isEnglish) "Go to WhatsApp" else "前往 WhatsApp"
                                },
                                color = Color.White,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                    StepNumber(2)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text(if (isEnglish) "Complete the task in WhatsApp" else "在 WhatsApp 中完成任务", color = WtpText, fontWeight = FontWeight.SemiBold)
                        Text(if (isEnglish) "Review the contact, message and link preview. Send manually only after confirming the recipient has consented to receive the message." else "使用已分配号码和预设内容，检查链接预览；确认收件人同意接收后，由你本人点击发送。", color = WtpMuted, style = MaterialTheme.typography.bodySmall)
                        if (phone.isNotBlank() && phone != "null") {
                            Surface(color = WtpSky, shape = RoundedCornerShape(8.dp)) {
                                Text((if (isEnglish) "Assigned contact: " else "后台分配号码：") + maskPhoneNumber(phone), Modifier.fillMaxWidth().padding(9.dp), color = WtpDarkGreen, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                    StepNumber(3)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text(if (isEnglish) "Submit screenshot" else "通过悬浮窗提交截图", color = WtpText, fontWeight = FontWeight.SemiBold)
                        Text(if (isEnglish) "After sending, return to this app and tap the floating capture button. The screenshot will be uploaded to review." else "完成后返回本页，点击右侧悬浮球的截图按钮，系统会自动截图并上传审核。", color = WtpMuted, style = MaterialTheme.typography.bodySmall)
                    }
                }

                if (message.isNotBlank()) {
                    Text(if (isEnglish) "Prepared message" else "预设消息内容", color = WtpMuted, style = MaterialTheme.typography.labelMedium)
                    Surface(color = WtpPage, shape = RoundedCornerShape(9.dp)) {
                        Text(message, Modifier.fillMaxWidth().padding(12.dp), color = WtpText)
                    }
                }
                if (link.isNotBlank()) {
                    Text(if (isEnglish) "Link preview" else "链接预览", color = WtpMuted, style = MaterialTheme.typography.labelMedium)
                    Surface(color = WtpSky, shape = RoundedCornerShape(10.dp), border = androidx.compose.foundation.BorderStroke(1.dp, WtpSkyBorder)) {
                        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            if (previewTitle.isNotBlank()) Text(previewTitle, color = WtpText, fontWeight = FontWeight.Bold)
                            if (previewDescription.isNotBlank()) Text(previewDescription, color = WtpMuted, style = MaterialTheme.typography.bodySmall)
                            Text(link, color = WtpDarkGreen, style = MaterialTheme.typography.bodySmall)
                            if (previewImageUrl.isNotBlank()) TaskPreviewImage(previewImageUrl, isEnglish)
                        }
                    }
                }
                Text(
                    if (isEnglish) "Up to 3 unfinished tasks can be held at once. Default task time limit: 3 minutes." else "最多可保留 3 个未完成任务。默认时限 3 分钟；请以任务页显示的最新状态为准。",
                    color = WtpMuted,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }

        if (!errorMessage.isNullOrBlank()) {
            Surface(color = Color(0xFFFFEEEE), shape = RoundedCornerShape(9.dp)) {
                Text(errorMessage, Modifier.fillMaxWidth().padding(11.dp), color = Color(0xFFB42318), style = MaterialTheme.typography.bodySmall)
            }
        }
        if (canAbandon) {
            TextButton(
                onClick = { showAbandonDialog = true },
                enabled = !abandoning,
                modifier = Modifier.fillMaxWidth().height(46.dp)
            ) {
                Text(if (abandoning) { if (isEnglish) "Cancelling…" else "正在放弃…" } else { if (isEnglish) "Abandon task" else "放弃任务" }, color = Color(0xFFD92D20), fontWeight = FontWeight.SemiBold)
            }
        }
    }

    if (showAbandonDialog) {
        AlertDialog(
            onDismissRequest = { showAbandonDialog = false },
            title = { Text(if (isEnglish) "Abandon this task?" else "确定放弃当前任务？") },
            text = { Text(if (isEnglish) "The task will be cancelled and its assigned contact may be returned to the available pool." else "放弃后任务将被取消，已分配号码会按后台规则释放，之后需要重新领取。") },
            confirmButton = {
                TextButton(onClick = {
                    showAbandonDialog = false
                    onAbandon()
                }) { Text(if (isEnglish) "Confirm abandon" else "确认放弃", color = Color(0xFFD92D20)) }
            },
            dismissButton = {
                TextButton(onClick = { showAbandonDialog = false }) { Text(if (isEnglish) "Keep task" else "继续任务") }
            }
        )
    }
}

@Composable
private fun StepNumber(number: Int) {
    Surface(color = WtpSky, shape = RoundedCornerShape(50)) {
        Text(number.toString(), Modifier.padding(horizontal = 11.dp, vertical = 7.dp), color = WtpDarkGreen, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun TaskPreviewImage(url: String, isEnglish: Boolean) {
    val bitmap by produceState<Bitmap?>(initialValue = null, key1 = url) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                val parsed = URL(url)
                require(parsed.protocol == "https") { "Only HTTPS preview images are allowed" }
                val connection = parsed.openConnection() as HttpURLConnection
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                connection.instanceFollowRedirects = true
                try {
                    connection.connect()
                    require(connection.responseCode in 200..299)
                    val bytes = connection.inputStream.use { it.readBytes() }
                    require(bytes.isNotEmpty() && bytes.size <= 3 * 1024 * 1024)
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                } finally {
                    connection.disconnect()
                }
            }.getOrNull()
        }
    }
    if (bitmap != null) {
        Image(
            bitmap = bitmap!!.asImageBitmap(),
            contentDescription = if (isEnglish) "Configured link preview image" else "链接预览图片",
            modifier = Modifier.fillMaxWidth().height(148.dp),
            contentScale = ContentScale.Crop
        )
    } else {
        Text(
            if (isEnglish) "Link preview image will be loaded by WhatsApp when available." else "预览图会在 WhatsApp 根据目标网页信息生成；如果未显示，请检查网页分享元数据。",
            color = WtpMuted,
            style = MaterialTheme.typography.bodySmall
        )
    }
}

@Composable
private fun TaskStep(number: Int, title: String, description: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        Surface(color = WtpSky, shape = RoundedCornerShape(50)) {
            Text(number.toString(), Modifier.padding(horizontal = 11.dp, vertical = 7.dp), color = WtpDarkGreen, fontWeight = FontWeight.Bold)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, color = WtpText, fontWeight = FontWeight.SemiBold)
            Text(description, color = WtpMuted, style = MaterialTheme.typography.bodySmall)
        }
    }
}

private fun maskPhoneNumber(value: String): String {
    val digits = value.filter { it.isDigit() }
    if (digits.length <= 4) return "****"
    return "******" + digits.takeLast(6)
}

private fun displayTaskTitle(value: String): String {
    val digits = value.filter { it.isDigit() }
    return if (digits.length >= 8) maskPhoneNumber(value) else value
}

@Composable
private fun MainTab(
    text: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Column(
        modifier.clickable(onClick = onClick).padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text,
            color = if (selected) Color(0xFF258765) else WtpMuted,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium
        )
        Surface(
            color = if (selected) Color(0xFF258765) else Color.Transparent,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 2.dp).height(2.dp)
        ) {}
    }
}

@Composable
private fun HallFilterTabs(
    selected: HallFilter,
    isEnglish: Boolean,
    onSelect: (HallFilter) -> Unit
) {
    val entries = listOf(
        HallFilter.AVAILABLE to (if (isEnglish) "Available" else "可领取"),
        HallFilter.IN_PROGRESS to (if (isEnglish) "In progress" else "进行中"),
        HallFilter.EXPIRED to (if (isEnglish) "Expired" else "已过期"),
        HallFilter.REJECTED to (if (isEnglish) "Rejected" else "已拒绝"),
        HallFilter.SETTLED to (if (isEnglish) "Settled" else "已结算")
    )
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        entries.forEach { (filter, label) ->
            Surface(
                color = if (selected == filter) WtpPaleGreen else Color.Transparent,
                shape = RoundedCornerShape(9.dp),
                modifier = Modifier.weight(1f).clickable { onSelect(filter) }
            ) {
                Text(
                    label,
                    Modifier.padding(horizontal = 2.dp, vertical = 11.dp),
                    color = if (selected == filter) WtpDarkGreen else WtpMuted,
                    fontWeight = if (selected == filter) FontWeight.Bold else FontWeight.Medium,
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1
                )
            }
        }
    }
}

@Composable
private fun RecordFilterTabs(
    selected: RecordFilter,
    isEnglish: Boolean,
    onSelect: (RecordFilter) -> Unit
) {
    val entries = listOf(
        RecordFilter.ALL to (if (isEnglish) "All" else "全部"),
        RecordFilter.IN_PROGRESS to (if (isEnglish) "In progress" else "进行中"),
        RecordFilter.COMPLETED to (if (isEnglish) "Completed" else "已完成"),
        RecordFilter.NEED_ACTION to (if (isEnglish) "Action" else "需处理"),
        RecordFilter.INCOMPLETE to (if (isEnglish) "Unfinished" else "未完成")
    )
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        entries.forEach { (filter, label) ->
            Column(
                Modifier.clickable { onSelect(filter) }.padding(horizontal = 4.dp, vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(7.dp)
            ) {
                Text(
                    label,
                    color = if (selected == filter) Color(0xFF258765) else WtpMuted,
                    fontWeight = if (selected == filter) FontWeight.Bold else FontWeight.Medium
                )
                Surface(
                    color = if (selected == filter) Color(0xFF258765) else Color.Transparent,
                    modifier = Modifier.width(48.dp).height(2.dp)
                ) {}
            }
        }
    }
}

@Composable
private fun SummaryCard(title: String, columns: List<Pair<String, String>>) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
        shape = RoundedCornerShape(13.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, color = WtpText, fontWeight = FontWeight.Bold)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                columns.forEach { (label, value) ->
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(label, color = WtpMuted, style = MaterialTheme.typography.bodySmall)
                        Text(value, color = WtpText, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun AvailableTaskCard(
    task: JSONObject,
    isEnglish: Boolean,
    busy: Boolean,
    onStart: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
        shape = RoundedCornerShape(13.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 13.dp),
            verticalArrangement = Arrangement.spacedBy(13.dp)
        ) {
            // Match the compact reference card: masked number as the headline.
            Text(
                task.optString("maskedPhoneNumber", "******"),
                color = WtpText,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleMedium
            )

            Surface(
                color = Color(0xFFF6FCF8),
                shape = RoundedCornerShape(9.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE1F0E7))
            ) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            if (isEnglish) "Reward per task" else "单次奖励",
                            color = WtpMuted,
                            style = MaterialTheme.typography.bodySmall
                        )
                        Text(
                            formatTaskReward(task.optString("rewardMinor"), task.optString("currency", "USD")),
                            color = WtpText,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Box(
                        Modifier.width(1.dp).height(34.dp).background(Color(0xFFDCEBE3))
                    )
                    Column(
                        Modifier.weight(1f).padding(start = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        Text(
                            if (isEnglish) "Task duration" else "任务用时",
                            color = WtpMuted,
                            style = MaterialTheme.typography.bodySmall
                        )
                        Text(
                            if (isEnglish) "3 minutes" else "3 分钟",
                            color = WtpText,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                StatusPill(
                    if (isEnglish) "● Available" else "● 可领取",
                    WtpPaleGreen,
                    WtpDarkGreen
                )
                Button(
                    onClick = onStart,
                    enabled = !busy,
                    colors = ButtonDefaults.buttonColors(containerColor = WtpGreen),
                    shape = RoundedCornerShape(9.dp)
                ) {
                    Text(
                        if (busy) {
                            if (isEnglish) "Starting…" else "处理中…"
                        } else {
                            if (isEnglish) "Start task  ▷" else "开始任务  ▷"
                        },
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

@Composable
private fun ClaimedTaskCard(
    claim: JSONObject,
    isEnglish: Boolean,
    activeClaimId: String?,
    busy: Boolean,
    onViewDetails: () -> Unit,
    onGoWhatsApp: () -> Unit,
    onSelect: () -> Unit
) {
    val task = claim.optJSONObject("task") ?: JSONObject()
    val status = claim.optString("status")
    val submission = claim.optJSONObject("latestSubmission")
    val phone = claim.optString("assignedPhoneNumber")
    val canOpen = status in setOf("CLAIMED", "IN_PROGRESS", "REJECTED") &&
        (submission == null || submission.optString("status") == "REJECTED")
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
        shape = RoundedCornerShape(13.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Text(task.optString("title"), color = WtpText, fontWeight = FontWeight.Bold)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (isEnglish) "Status: " else "状态：", color = WtpMuted, style = MaterialTheme.typography.bodySmall)
                Text(claimStatus(status, isEnglish), color = WtpDarkGreen, fontWeight = FontWeight.SemiBold)
            }
            if (phone.isNotBlank() && phone != "null") {
                Surface(color = WtpPaleGreen, shape = RoundedCornerShape(9.dp)) {
                    Column(Modifier.fillMaxWidth().padding(11.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(if (isEnglish) "Assigned WhatsApp number" else "本任务专属号码", color = WtpDarkGreen, style = MaterialTheme.typography.bodySmall)
                        Text(maskPhoneNumber(phone), color = WtpText, fontWeight = FontWeight.Bold)
                    }
                }
            }
            val messageTemplate = task.optString("messageTemplate")
            if (messageTemplate.isNotBlank() && messageTemplate != "null") {
                Text(
                    (if (isEnglish) "Message: " else "消息模板：") + messageTemplate,
                    color = WtpMuted,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 3
                )
            }
            val link = task.optString("linkUrl")
            if (link.isNotBlank() && link != "null") {
                Text(
                    (if (isEnglish) "Link: " else "任务链接：") + link,
                    color = WtpDarkGreen,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1
                )
            }
            if (submission != null) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        if (isEnglish) "Evidence review" else "凭证审核状态",
                        color = WtpMuted,
                        style = MaterialTheme.typography.bodySmall
                    )
                    StatusPill(
                        claimStatus(submission.optString("status"), isEnglish),
                        when (submission.optString("status")) {
                            "APPROVED" -> WtpPaleGreen
                            "REJECTED" -> Color(0xFFFFF1E5)
                            else -> Color(0xFFEAF4FF)
                        },
                        when (submission.optString("status")) {
                            "APPROVED" -> WtpDarkGreen
                            "REJECTED" -> Color(0xFFB45309)
                            else -> Color(0xFF245987)
                        }
                    )
                }
                val submittedAt = submission.optString("submittedAt")
                if (submittedAt.isNotBlank() && submittedAt != "null") {
                    Text(
                        (if (isEnglish) "Submitted: " else "提交时间：") + formatDate(submittedAt),
                        color = WtpMuted,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                val reviewReason = submission.optString("reviewReason").takeUnless { it.isNullOrBlank() || it == "null" }
                if (submission.optString("status") == "REJECTED" && reviewReason != null) {
                    Surface(
                        color = Color(0xFFFFF4E8),
                        shape = RoundedCornerShape(9.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(
                                if (isEnglish) "Reason for rejection" else "审核驳回原因",
                                color = Color(0xFF9A3412),
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.bodySmall
                            )
                            Text(reviewReason, color = Color(0xFF7C2D12), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
            if (activeClaimId == claim.optString("id")) {
                StatusPill(
                    if (isEnglish) "Current task selected" else "当前任务已选定",
                    WtpPaleGreen,
                    WtpDarkGreen
                )
            }
            if (canOpen) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    OutlinedButton(
                        onClick = onViewDetails,
                        modifier = Modifier.weight(1f),
                        enabled = !busy,
                        shape = RoundedCornerShape(9.dp)
                    ) {
                        Text(if (isEnglish) "View details" else "查看详情", color = WtpDarkGreen)
                    }
                    Button(
                        onClick = {
                            onSelect()
                            onGoWhatsApp()
                        },
                        modifier = Modifier.weight(1.35f),
                        enabled = !busy && phone.isNotBlank() && phone != "null",
                        colors = ButtonDefaults.buttonColors(containerColor = WtpGreen),
                        shape = RoundedCornerShape(9.dp)
                    ) {
                        Text(if (isEnglish) "Go to WhatsApp  ▷" else "前往 WhatsApp  ▷", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                }
                if (phone.isBlank() || phone == "null") {
                    Text(
                        if (isEnglish) "No assigned number was returned. Refresh or contact support." else "没有获取到分配号码，请刷新任务或联系管理员。",
                        color = Color(0xFFB45309),
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    }
}

@Composable
private fun ClaimRecordCard(claim: JSONObject, isEnglish: Boolean) {
    val task = claim.optJSONObject("task") ?: JSONObject()
    val status = claim.optString("status")
    val colorPair = when (status) {
        "APPROVED" -> WtpPaleGreen to WtpDarkGreen
        "REJECTED" -> Color(0xFFFFF1E5) to Color(0xFFB45309)
        "EXPIRED", "CANCELLED" -> Color(0xFFF0F2F3) to Color(0xFF6B7280)
        else -> Color(0xFFEAF4EF) to WtpDarkGreen
    }
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
        shape = RoundedCornerShape(13.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(task.optString("title"), color = WtpText, fontWeight = FontWeight.SemiBold)
                StatusPill(claimStatus(status, isEnglish), colorPair.first, colorPair.second)
            }
            Text(
                formatTaskReward(task.optString("rewardMinor"), task.optString("currency", "USD")),
                color = WtpMuted,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                formatDate(claim.optString("claimedAt")),
                color = WtpMuted,
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}

@Composable
private fun StatusPill(text: String, background: Color, foreground: Color) {
    Surface(color = background, shape = RoundedCornerShape(6.dp)) {
        Text(
            text,
            Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
            color = foreground,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun EmptyState(title: String, subtitle: String) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(title, color = Color(0xFF4E6459), fontWeight = FontWeight.Bold)
            Text(subtitle, color = WtpMuted, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun LoadingState() {
    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator(color = WtpGreen)
    }
}

private fun JSONArray?.asObjectList(): List<JSONObject> {
    if (this == null) return emptyList()
    return (0 until length()).mapNotNull { optJSONObject(it) }
}

private fun JSONObject.isWithinLastSevenDays(): Boolean {
    val value = optString("claimedAt")
    val instant = runCatching { Instant.parse(value) }.getOrNull() ?: return false
    return instant.isAfter(Instant.now().minus(7, ChronoUnit.DAYS))
}

private fun formatDate(value: String): String {
    val instant = runCatching { Instant.parse(value) }.getOrNull() ?: return "—"
    return java.time.format.DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm")
        .withZone(java.time.ZoneId.systemDefault())
        .format(instant)
}

private fun formatTaskReward(minor: String, currency: String): String {
    val digits = runCatching { java.util.Currency.getInstance(currency).defaultFractionDigits }
        .getOrDefault(2).coerceAtLeast(0)
    val amount = runCatching {
        BigDecimal(minor).movePointLeft(digits).setScale(3, RoundingMode.DOWN).toPlainString()
    }.getOrDefault("0.000")
    return "$amount $currency"
}

private fun formatCompactBalance(minor: String, currency: String): String {
    val digits = runCatching { java.util.Currency.getInstance(currency).defaultFractionDigits }
        .getOrDefault(2).coerceAtLeast(0)
    return runCatching {
        BigDecimal(minor).movePointLeft(digits).setScale(3, RoundingMode.DOWN).toPlainString()
    }.getOrDefault("0.000")
}

private fun openWhatsApp(context: android.content.Context, claim: JSONObject, isEnglish: Boolean) {
    val task = claim.optJSONObject("task") ?: JSONObject()
    val phone = claim.optString("assignedPhoneNumber")
        .filter { it.isDigit() }
    if (phone.length < 8) {
        Toast.makeText(context, if (isEnglish) "Assigned WhatsApp number is invalid." else "分配的 WhatsApp 号码无效。", Toast.LENGTH_LONG).show()
        return
    }

    val template = task.optString("messageTemplate").takeUnless { it == "null" }.orEmpty().trim()
    val link = task.optString("linkUrl").takeUnless { it == "null" }.orEmpty().trim()
    val message = when {
        template.isBlank() -> link
        link.isBlank() || template.contains(link) -> template
        else -> "$template\n$link"
    }
    val uri = Uri.parse("https://wa.me/$phone").buildUpon()
        .appendQueryParameter("text", message)
        .build()

    val targetApps = listOf("com.whatsapp", "com.whatsapp.w4b")
    var opened = false
    for (packageName in targetApps) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                setPackage(packageName)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            opened = true
            break
        } catch (_: ActivityNotFoundException) {
            // Try the next supported WhatsApp app, then use Android's default handler.
        } catch (_: Exception) {
            // Continue to the generic URL fallback.
        }
    }
    if (!opened) {
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
            Toast.makeText(context, if (isEnglish) "WhatsApp could not be opened on this device." else "无法打开 WhatsApp，请检查是否已安装。", Toast.LENGTH_LONG).show()
        }
    }
}

private fun claimStatus(value: String, isEnglish: Boolean): String {
    return when (value) {
        "CLAIMED" -> if (isEnglish) "Claimed" else "已领取"
        "IN_PROGRESS" -> if (isEnglish) "In progress" else "进行中"
        "SUBMITTED" -> if (isEnglish) "Submitted" else "已提交"
        "UNDER_REVIEW" -> if (isEnglish) "Under review" else "审核中"
        "APPROVED" -> if (isEnglish) "Settled" else "已结算"
        "REJECTED" -> if (isEnglish) "Rejected" else "已拒绝"
        "EXPIRED" -> if (isEnglish) "Expired" else "已过期"
        "CANCELLED" -> if (isEnglish) "Cancelled" else "已取消"
        else -> value
    }
}

private val IN_PROGRESS_STATUSES = setOf("CLAIMED", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW")
