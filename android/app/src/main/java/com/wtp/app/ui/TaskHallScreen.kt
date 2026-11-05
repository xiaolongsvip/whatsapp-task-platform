package com.wtp.app.ui

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.wtp.app.capture.CaptureSessionState
import com.wtp.app.data.AuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

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
) {
    val isEnglish = language == "en"
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val activeClaimId by CaptureSessionState.activeClaimId.collectAsState()
    val uploadMessage by CaptureSessionState.uploadMessage.collectAsState()

    var tasks by remember { mutableStateOf(emptyList<JSONObject>()) }
    var claims by remember { mutableStateOf(emptyList<JSONObject>()) }
    var dashboard by remember { mutableStateOf(JSONObject()) }
    var loading by remember { mutableStateOf(true) }
    var busyId by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var mainTab by remember { mutableStateOf(TaskMainTab.HALL) }
    var hallFilter by remember { mutableStateOf(HallFilter.AVAILABLE) }
    var recordFilter by remember { mutableStateOf(RecordFilter.ALL) }
    var selectedClaimId by remember { mutableStateOf<String?>(null) }

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

    LaunchedEffect(Unit) { refresh() }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { refresh() }

    val claimsByTask = claims.associateBy { it.optString("taskId") }
    val inProgressClaims = claims.filter { it.optString("status") in IN_PROGRESS_STATUSES }
    val expiredClaims = claims.filter { it.optString("status") in setOf("EXPIRED", "CANCELLED") }
    val rejectedClaims = claims.filter { it.optString("status") == "REJECTED" }
    val settledClaims = claims.filter { it.optString("status") == "APPROVED" }
    val availableTasks = tasks.filter { task ->
        val taskId = task.optString("id")
        val remaining = if (task.isNull("remainingCapacity")) -1 else task.optInt("remainingCapacity", -1)
        claimsByTask[taskId] == null && (remaining == -1 || remaining > 0)
    }

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
        // Compact header modeled on the reference design.
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
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
                    androidx.compose.material3.Icon(Icons.Default.ArrowBack, contentDescription = if (isEnglish) "Back" else "返回", tint = WtpDarkGreen)
                }
            } else {
                Surface(
                    color = Color.White,
                    shape = RoundedCornerShape(24.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, WtpSkyBorder)
                ) {
                    Row(
                        Modifier.padding(start = 5.dp, end = 12.dp, top = 4.dp, bottom = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(color = WtpGreen, shape = RoundedCornerShape(18.dp)) {
                            Text(
                                if (isEnglish) "Withdraw" else "提现",
                                Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                                color = Color.White,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Spacer(Modifier.width(8.dp))
                        Text(
                            formatCompactBalance(balanceAmount, balanceCurrency),
                            color = WtpText,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
            Text(
                if (selectedClaim != null) {
                    if (isEnglish) "Task" else "任务"
                } else if (mainTab == TaskMainTab.HALL) {
                    if (isEnglish) "Task hall" else "任务大厅"
                } else {
                    if (isEnglish) "Task records" else "任务记录"
                },
                color = Color(0xFF496257),
                fontWeight = FontWeight.SemiBold
            )
            if (selectedClaim == null) OutlinedButton(
                onClick = { refresh() },
                enabled = !loading,
                shape = RoundedCornerShape(24.dp),
                modifier = Modifier.width(88.dp)
            ) {
                if (loading) {
                    CircularProgressIndicator(
                        modifier = Modifier.width(16.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    androidx.compose.material3.Icon(
                        Icons.Default.Refresh,
                        contentDescription = if (isEnglish) "Refresh" else "刷新",
                        tint = WtpDarkGreen
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(if (isEnglish) "Refresh" else "刷新", color = WtpDarkGreen)
                }
            }
        }

        if (selectedClaim == null) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
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
                                        val taskId = task.optString("id")
                                        scope.launch {
                                            busyId = taskId
                                            error = null
                                            notice = null
                                            try {
                                                val result = withContext(Dispatchers.IO) {
                                                    AuthRepository.claimTask(taskId, UUID.randomUUID().toString())
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
                                onGoWhatsApp = { selectedClaimId = claim.optString("id") },
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
                                onGoWhatsApp = { selectedClaimId = claim.optString("id") },
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
                onGoWhatsApp = {
                    CaptureSessionState.setActiveClaim(selectedClaim.optString("id"))
                    openWhatsApp(context, selectedClaim, isEnglish)
                }
            )
        }
    }
}

@Composable
private fun TaskExecutionScreen(
    claim: JSONObject,
    isEnglish: Boolean,
    activeClaimId: String?,
    onGoWhatsApp: () -> Unit
) {
    val task = claim.optJSONObject("task") ?: JSONObject()
    val status = claim.optString("status")
    val phone = claim.optString("assignedPhoneNumber")
    val previewTitle = task.optString("previewTitle").takeUnless { it == "null" }.orEmpty()
    val previewDescription = task.optString("previewDescription").takeUnless { it == "null" }.orEmpty()
    val previewImageUrl = task.optString("previewImageUrl").takeUnless { it == "null" }.orEmpty()
    val link = task.optString("linkUrl").takeUnless { it == "null" }.orEmpty()
    val message = task.optString("messageTemplate").takeUnless { it == "null" }.orEmpty()

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(task.optString("title"), color = WtpText, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatusPill(claimStatus(status, isEnglish), WtpPaleGreen, WtpDarkGreen)
                    if (activeClaimId == claim.optString("id")) {
                        Text(if (isEnglish) "Evidence task selected" else "当前截图任务", color = WtpDarkGreen, style = MaterialTheme.typography.labelSmall)
                    }
                }
                if (phone.isNotBlank() && phone != "null") {
                    Surface(color = WtpSky, shape = RoundedCornerShape(9.dp), border = androidx.compose.foundation.BorderStroke(1.dp, WtpSkyBorder)) {
                        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(if (isEnglish) "Assigned WhatsApp contact" else "后台分配的 WhatsApp 号码", color = WtpMuted, style = MaterialTheme.typography.bodySmall)
                            Text(maskPhoneNumber(phone), color = WtpText, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                        }
                    }
                }
                Row(
                    Modifier.fillMaxWidth().background(WtpSky, RoundedCornerShape(9.dp)).padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(if (isEnglish) "Reward" else "单次奖励", color = WtpMuted, style = MaterialTheme.typography.bodySmall)
                        Text(formatTaskReward(task.optString("rewardMinor"), task.optString("currency", "USD")), color = WtpDarkGreen, fontWeight = FontWeight.Bold)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(if (isEnglish) "Task status" else "任务状态", color = WtpMuted, style = MaterialTheme.typography.bodySmall)
                        Text(claimStatus(status, isEnglish), color = WtpDarkGreen, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(if (isEnglish) "Task steps" else "任务步骤", color = WtpText, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                TaskStep(1, if (isEnglish) "Open WhatsApp" else "打开 WhatsApp", if (isEnglish) "Review the assigned contact and the prepared message before sending." else "核对后台分配的号码和预设内容，确认无误后再发送。")
                TaskStep(2, if (isEnglish) "Review the link preview" else "检查链接预览", if (isEnglish) "WhatsApp creates the preview from the destination page metadata. Confirm the destination is expected." else "WhatsApp 会根据目标网页的元数据生成预览，请确认链接和图片与任务说明一致。")
                TaskStep(3, if (isEnglish) "Send and submit evidence" else "发送并提交截图", if (isEnglish) "Send manually in WhatsApp, return here, then use the authorized capture action to submit the screenshot." else "在 WhatsApp 中手动发送，返回本页后使用已授权的截图操作提交证据。")

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
                            if (previewImageUrl.isNotBlank()) {
                                Text(if (isEnglish) "Preview image configured" else "已配置链接预览图片", color = WtpDarkGreen, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }

                Button(
                    onClick = onGoWhatsApp,
                    enabled = phone.isNotBlank() && phone != "null" && status in setOf("CLAIMED", "IN_PROGRESS", "REJECTED"),
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = WtpGreen),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(if (isEnglish) "Go to WhatsApp  ▷" else "前往 WhatsApp  ▷", color = Color.White, fontWeight = FontWeight.Bold)
                }
                Text(
                    if (isEnglish) "The message is not sent automatically. Check the recipient and content, then tap Send in WhatsApp." else "APP 不会自动发送消息。请在 WhatsApp 中核对收件号码和内容，再由你本人点击发送。",
                    color = WtpMuted,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
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
            color = if (selected) WtpDarkGreen else WtpMuted,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium
        )
        Surface(
            color = if (selected) WtpDarkGreen else Color.Transparent,
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
                    color = if (selected == filter) WtpDarkGreen else WtpMuted,
                    fontWeight = if (selected == filter) FontWeight.Bold else FontWeight.Medium
                )
                Surface(
                    color = if (selected == filter) WtpDarkGreen else Color.Transparent,
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
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(displayTaskTitle(task.optString("title")), color = WtpText, fontWeight = FontWeight.Bold)
            Text(task.optString("description"), color = WtpMuted, style = MaterialTheme.typography.bodySmall)
            Surface(
                color = Color(0xFFF6FCF8),
                shape = RoundedCornerShape(8.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE1F0E7))
            ) {
                Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(if (isEnglish) "Reward per task" else "单次奖励", color = WtpMuted, style = MaterialTheme.typography.bodySmall)
                        Text(
                            formatTaskReward(task.optString("rewardMinor"), task.optString("currency", "USD")),
                            color = WtpText,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Column(Modifier.weight(1f)) {
                        Text(if (isEnglish) "Available slots" else "剩余名额", color = WtpMuted, style = MaterialTheme.typography.bodySmall)
                        val capacity = if (task.isNull("remainingCapacity")) -1 else task.optInt("remainingCapacity", -1)
                        Text(if (capacity < 0) "—" else capacity.toString(), color = WtpText, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                StatusPill(if (isEnglish) "Available" else "可领取", WtpPaleGreen, WtpDarkGreen)
                Button(
                    onClick = onStart,
                    enabled = !busy,
                    colors = ButtonDefaults.buttonColors(containerColor = WtpGreen),
                    shape = RoundedCornerShape(9.dp)
                ) {
                    Text(
                        if (busy) { if (isEnglish) "Starting…" else "处理中…" }
                        else { if (isEnglish) "Start task  ▷" else "开始任务  ▷" },
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
                Text(
                    (if (isEnglish) "Latest submission: " else "最近提交：") +
                        claimStatus(submission.optString("status"), isEnglish),
                    color = WtpMuted,
                    style = MaterialTheme.typography.bodySmall
                )
            }
            if (activeClaimId == claim.optString("id")) {
                StatusPill(
                    if (isEnglish) "Current task selected" else "当前任务已选定",
                    WtpPaleGreen,
                    WtpDarkGreen
                )
            }
            if (canOpen) {
                Button(
                    onClick = {
                        onSelect()
                        onGoWhatsApp()
                    },
                    enabled = !busy && phone.isNotBlank() && phone != "null",
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = WtpGreen),
                    shape = RoundedCornerShape(9.dp)
                ) {
                    Text(if (isEnglish) "Go to WhatsApp  ▷" else "前往 WhatsApp  ▷", color = Color.White, fontWeight = FontWeight.Bold)
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
