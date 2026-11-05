package com.wtp.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.wtp.app.capture.CaptureSessionState
import com.wtp.app.data.AuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.UUID

@Composable
fun TaskHallScreen(
    modifier: Modifier = Modifier,
    language: String,
) {
    val isEnglish = language == "en"
    val scope = rememberCoroutineScope()
    val lastCapturePath by CaptureSessionState.lastCapturePath.collectAsState()
    val lastCaptureName by CaptureSessionState.lastCaptureName.collectAsState()
    val activeClaimId by CaptureSessionState.activeClaimId.collectAsState()
    val uploadMessage by CaptureSessionState.uploadMessage.collectAsState()
    var tasks by remember { mutableStateOf(emptyList<JSONObject>()) }
    var claims by remember { mutableStateOf(emptyList<JSONObject>()) }
    var loading by remember { mutableStateOf(true) }
    var busyId by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }

    fun refresh() {
        scope.launch {
            loading = true
            error = null
            try {
                val result = withContext(Dispatchers.IO) {
                    Pair(AuthRepository.publishedTasks(), AuthRepository.myTaskClaims())
                }
                tasks = result.first.optJSONArray("tasks").asObjectList()
                claims = result.second.optJSONArray("claims").asObjectList()
            } catch (e: Exception) {
                error = e.message ?: if (isEnglish) "Could not load tasks." else "任务加载失败。"
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { refresh() }

    val claimByTaskId = claims.associateBy { it.optString("taskId") }

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                if (isEnglish) "Task hall" else "任务大厅",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            OutlinedButton(onClick = { refresh() }, enabled = !loading) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text(if (isEnglish) "Refresh" else "刷新")
            }
        }

        if (!uploadMessage.isNullOrBlank()) {
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F8EF))) {
                Text(
                    uploadMessage!!,
                    Modifier.fillMaxWidth().padding(14.dp),
                    color = Color(0xFF16804A),
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
        if (lastCapturePath != null) {
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFE9F7FE))) {
                Row(
                    Modifier.fillMaxWidth().padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.CloudUpload, contentDescription = null, tint = Color(0xFF1685B8))
                    Spacer(Modifier.width(10.dp))
                    Column {
                        Text(
                            if (activeClaimId != null) {
                                if (isEnglish) "Screenshot ready; next capture will auto-submit to the selected task"
                                else "截图已准备好；下一次截图会自动提交到当前任务"
                            } else {
                                if (isEnglish) "Screenshot ready to submit" else "截图已准备好，可以提交"
                            },
                            color = Color(0xFF126A94),
                            fontWeight = FontWeight.Bold
                        )
                        Text(lastCaptureName.orEmpty(), color = Color(0xFF55758A), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        } else if (activeClaimId != null && uploadMessage.isNullOrBlank()) {
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFE9F7FE))) {
                Text(
                    if (isEnglish) "A task is selected. The next screenshot you explicitly capture from the ongoing notification will upload to that task for review."
                    else "当前任务已选定。你下一次从持续截图通知栏主动截图后，系统会自动上传到该任务并提交审核。",
                    Modifier.fillMaxWidth().padding(14.dp),
                    color = Color(0xFF126A94)
                )
            }
        } else {
            Text(
                if (isEnglish) "Capture evidence from the active screenshot session first. Then return here and submit it to the task you claimed."
                else "请先在首页开启截图会话，并从通知栏手动截图。返回这里后，再选择已领取的任务提交证据。",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall
            )
        }

        if (error != null) {
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF1F0))) {
                Column(Modifier.padding(14.dp)) {
                    Text(error!!, color = Color(0xFFB42318))
                    TextButton(onClick = { refresh() }) { Text(if (isEnglish) "Retry" else "重试") }
                }
            }
        }

        Text(
            if (isEnglish) "Published tasks" else "可领取任务",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        if (loading && tasks.isEmpty()) {
            CircularProgressIndicator()
        } else if (tasks.isEmpty()) {
            Text(
                if (isEnglish) "There are no published tasks right now." else "目前没有已发布的任务。",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        } else {
            tasks.forEach { task ->
                val taskId = task.optString("id")
                val existingClaim = claimByTaskId[taskId]
                Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(task.optString("title"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(task.optString("description"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            (if (isEnglish) "Reward: " else "任务奖励：") +
                                formatTaskReward(task.optString("rewardMinor"), task.optString("currency", "USD")),
                            color = Color(0xFF1685B8),
                            fontWeight = FontWeight.Bold
                        )
                        val capacity = task.optInt("capacity", -1)
                        val claimed = task.optInt("claimedCount")
                        if (capacity >= 0) {
                            Text(
                                (if (isEnglish) "Slots: " else "领取进度：") + "$claimed/$capacity",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                        if (existingClaim != null) {
                            Surface(color = Color(0xFFE8F5FC), shape = RoundedCornerShape(10.dp)) {
                                Text(
                                    (if (isEnglish) "Claim status: " else "领取状态：") + claimStatus(existingClaim.optString("status"), isEnglish),
                                    Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                                    color = Color(0xFF126A94)
                                )
                            }
                        } else {
                            Button(
                                onClick = {
                                    scope.launch {
                                        busyId = taskId
                                        try {
                                            withContext(Dispatchers.IO) {
                                                AuthRepository.claimTask(taskId, UUID.randomUUID().toString())
                                            }
                                            message = if (isEnglish) "Task claimed. Complete it and submit genuine screenshot evidence." else "任务领取成功。完成任务后，请提交真实截图证据。"
                                            refresh()
                                        } catch (e: Exception) {
                                            error = e.message ?: if (isEnglish) "Could not claim task." else "领取任务失败。"
                                        } finally {
                                            busyId = null
                                        }
                                    }
                                },
                                enabled = busyId == null,
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF20A9E5))
                            ) {
                                Text(if (busyId == taskId) { if (isEnglish) "Please wait…" else "处理中…" } else { if (isEnglish) "Claim task" else "领取任务" })
                            }
                        }
                    }
                }
            }
        }

        HorizontalDivider()
        Text(
            if (isEnglish) "My tasks" else "我的任务",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        if (!loading && claims.isEmpty()) {
            Text(
                if (isEnglish) "You have not claimed any tasks yet." else "你还没有领取任务。",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        claims.forEach { claim ->
            val claimId = claim.optString("id")
            val task = claim.optJSONObject("task") ?: JSONObject()
            val submission = claim.optJSONObject("latestSubmission")
            val claimStatusValue = claim.optString("status")
            val canSubmit = claimStatusValue in setOf("CLAIMED", "IN_PROGRESS", "REJECTED") &&
                (submission == null || submission.optString("status") == "REJECTED")
            Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(task.optString("title"), fontWeight = FontWeight.Bold)
                    Text(
                        (if (isEnglish) "Status: " else "任务状态：") + claimStatus(claimStatusValue, isEnglish),
                        color = Color(0xFF1685B8)
                    )
                    if (submission != null) {
                        Text(
                            (if (isEnglish) "Latest submission: " else "最近提交：") +
                                claimStatus(submission.optString("status"), isEnglish),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                    if (activeClaimId == claimId) {
                        Surface(color = Color(0xFFE8F5FC), shape = RoundedCornerShape(10.dp)) {
                            Text(
                                if (isEnglish) "Current task: next manual capture will auto-submit here" else "当前任务：下一次主动截图将自动上传到这里",
                                Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                                color = Color(0xFF126A94)
                            )
                        }
                        TextButton(onClick = { CaptureSessionState.clearActiveClaim() }) {
                            Text(if (isEnglish) "Unselect current task" else "取消当前任务")
                        }
                    } else if (canSubmit) {
                        OutlinedButton(onClick = { CaptureSessionState.setActiveClaim(claimId) }) {
                            Text(if (isEnglish) "Set as current task" else "设为当前任务")
                        }
                    }
                    if (canSubmit && lastCapturePath != null) {
                        Button(
                            onClick = {
                                val path = lastCapturePath
                                if (path.isNullOrBlank()) {
                                    message = if (isEnglish) "Capture a screenshot first." else "请先截图，再提交审核。"
                                } else {
                                    scope.launch {
                                        busyId = claimId
                                        try {
                                            withContext(Dispatchers.IO) {
                                                AuthRepository.submitTaskEvidence(
                                                    claimId = claimId,
                                                    filePath = path,
                                                    note = "",
                                                    idempotencyKey = UUID.randomUUID().toString()
                                                )
                                            }
                                            CaptureSessionState.markLastCaptureUploaded(if (isEnglish) "Evidence uploaded and submitted for review." else "截图已上传，任务证据已提交审核。")
                                            CaptureSessionState.clearActiveClaim()
                                            message = if (isEnglish) "Evidence uploaded and submitted for review." else "截图已上传，任务证据已提交审核。"
                                            refresh()
                                        } catch (e: Exception) {
                                            error = e.message ?: if (isEnglish) "Evidence upload failed." else "截图上传失败。"
                                        } finally {
                                            busyId = null
                                        }
                                    }
                                }
                            },
                            enabled = busyId == null && lastCapturePath != null,
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF20A9E5))
                        ) {
                            Icon(Icons.Default.CloudUpload, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text(
                                if (busyId == claimId) { if (isEnglish) "Uploading…" else "上传中…" }
                                else { if (isEnglish) "Upload screenshot for review" else "上传截图并提交审核" }
                            )
                        }
                    }
                }
            }
        }
    }

    if (message != null) {
        AlertDialog(
            onDismissRequest = { message = null },
            text = { Text(message!!) },
            confirmButton = {
                TextButton(onClick = { message = null; refresh() }) {
                    Text(if (isEnglish) "OK" else "确定")
                }
            }
        )
    }
}

private fun JSONArray?.asObjectList(): List<JSONObject> {
    if (this == null) return emptyList()
    return (0 until length()).mapNotNull { optJSONObject(it) }
}

private fun formatTaskReward(minor: String, currency: String): String {
    val digits = runCatching { java.util.Currency.getInstance(currency).defaultFractionDigits }
        .getOrDefault(2).coerceAtLeast(0)
    val amount = runCatching {
        BigDecimal(minor).movePointLeft(digits).setScale(3, RoundingMode.DOWN).toPlainString()
    }.getOrDefault("0.000")
    return "$currency $amount"
}

private fun claimStatus(value: String, isEnglish: Boolean): String {
    return when (value) {
        "CLAIMED" -> if (isEnglish) "Claimed" else "已领取"
        "IN_PROGRESS" -> if (isEnglish) "In progress" else "进行中"
        "SUBMITTED" -> if (isEnglish) "Submitted" else "已提交"
        "UNDER_REVIEW" -> if (isEnglish) "Under review" else "审核中"
        "APPROVED" -> if (isEnglish) "Approved" else "已通过"
        "REJECTED" -> if (isEnglish) "Rejected" else "已驳回"
        "EXPIRED" -> if (isEnglish) "Expired" else "已过期"
        "CANCELLED" -> if (isEnglish) "Cancelled" else "已取消"
        else -> value
    }
}
