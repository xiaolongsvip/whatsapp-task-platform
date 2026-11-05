package com.wtp.app.ui

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.media.projection.MediaProjectionManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntOffset
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import kotlin.math.roundToInt
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleEventEffect
import com.wtp.app.data.AuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

private data class NavItem(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)
private val navItems = listOf(NavItem("首页", Icons.Default.Home), NavItem("任务", Icons.Default.Assignment), NavItem("推广", Icons.Default.Group), NavItem("钱包", Icons.Default.Wallet), NavItem("我的", Icons.Default.AccountCircle))

@Composable
fun TaskPlatformApp() {
    var checking by remember { mutableStateOf(true) }
    var authenticated by rememberSaveable { mutableStateOf(false) }
    var phone by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(Unit) {
        try { val user = withContext(Dispatchers.IO) { AuthRepository.currentUser() }; phone = user.optString("phone"); authenticated = true }
        catch (_: Exception) { authenticated = false } finally { checking = false }
    }
    when {
        checking -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        !authenticated -> AuthScreen { phone = it; authenticated = true }
        else -> MemberShell(phone) { withContext(Dispatchers.IO) { runCatching { AuthRepository.logout() } }; authenticated = false; phone = "" }
    }
}

@Composable
private fun MemberShell(phone: String, onLogout: suspend () -> Unit) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    Scaffold(containerColor = MaterialTheme.colorScheme.background, bottomBar = {
        NavigationBar(containerColor = Color.White) {
            navItems.forEachIndexed { i, item -> NavigationBarItem(selected = tab == i, onClick = { tab = i }, icon = { Icon(item.icon, item.label) }, label = { Text(item.label) }) }
        }
    }) { padding ->
        when (tab) {
            0 -> HomeDashboardScreen(Modifier.padding(padding), onNavigate = { tab = it })
            1 -> SimpleScreen("任务大厅", "任务列表将在任务模块接入。", Modifier.padding(padding))
            2 -> SimpleScreen("推广中心", "推广关系和奖励将在推广模块接入。", Modifier.padding(padding))
            3 -> SimpleScreen("钱包", "钱包余额和账单将在钱包模块接入。", Modifier.padding(padding))
            else -> Column(Modifier.fillMaxSize().padding(padding).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("我的账户", style = MaterialTheme.typography.headlineSmall); Text("登录手机号：$phone")
                Button(onClick = { scope.launch { onLogout() } }) { Text("退出登录") }
            }
        }
    }
}

@Composable
private fun HomeDashboardScreen(modifier: Modifier = Modifier, onNavigate: (Int) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<JSONObject?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var overlay by remember { mutableStateOf(Settings.canDrawOverlays(context)) }
    var capture by rememberSaveable { mutableStateOf(false) }
    var permissionStep by remember { mutableIntStateOf(0) }
    var showTutorial by remember { mutableStateOf(false) }

    val sky = Color(0xFF20A9E5)
    val paleSky = Color(0xFFE4F5FD)
    val ink = Color(0xFF17243A)
    val muted = Color(0xFF718096)
    val captureLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        capture = result.resultCode == Activity.RESULT_OK && result.data != null
        permissionStep = 0
    }
    fun load() {
        scope.launch {
            loading = true
            error = null
            try { data = withContext(Dispatchers.IO) { AuthRepository.dashboard() } }
            catch (e: Exception) { error = e.message ?: "首页数据加载失败" }
            finally { loading = false }
        }
    }
    LaunchedEffect(Unit) { load() }

    Column(modifier.fillMaxSize().background(Color(0xFFF2F5F8)).verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Surface(color = Color.White, shape = RoundedCornerShape(28.dp)) {
                Row(Modifier.padding(end = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("提现", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.background(Brush.verticalGradient(listOf(Color(0xFF0879B9), Color(0xFF48C5F1))), RoundedCornerShape(28.dp)).padding(horizontal = 14.dp, vertical = 9.dp))
                    Spacer(Modifier.width(10.dp))
                    Text(formatBalance(firstBalance(data), firstCurrency(data)), color = ink, fontWeight = FontWeight.Bold)
                }
            }
            Text("首页", color = ink, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.HeadsetMic, contentDescription = "客服", tint = muted)
                Spacer(Modifier.width(18.dp))
                Icon(Icons.Default.Language, contentDescription = "语言", tint = muted)
            }
        }

        if (error != null) Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3F2)), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.padding(14.dp)) {
                Text("首页数据加载失败", color = Color(0xFFB42318), fontWeight = FontWeight.Bold)
                Text(error!!, color = Color(0xFFB42318))
                TextButton(onClick = { load() }) { Text("重新加载") }
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF7F7)), shape = RoundedCornerShape(16.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFFB9C1))) {
            Column(Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.WarningAmber, contentDescription = null, tint = Color(0xFFE53945))
                    Spacer(Modifier.width(8.dp))
                    Text("重要提醒", color = Color(0xFFE53945), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(8.dp))
                Text("为保障 WhatsApp 账号安全，请遵守 WhatsApp 使用规则，仅向已同意接收消息的用户开展任务。禁止骚扰信息、伪造任务证据或规避平台规则。", color = Color(0xFFD93640), style = MaterialTheme.typography.bodyMedium)
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(vertical = 11.dp, horizontal = 8.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                Metric("今日已结算", data?.optJSONObject("stats")?.optInt("settledToday")?.toString() ?: if (loading) "…" else "0")
                VerticalDivider(Modifier.height(34.dp), color = Color(0xFFE6ECF1))
                Metric("待审核", data?.optJSONObject("stats")?.optInt("pendingReview")?.toString() ?: if (loading) "…" else "0")
                VerticalDivider(Modifier.height(34.dp), color = Color(0xFFE6ECF1))
                Metric("可提现(${currencySymbol(firstCurrency(data))})", formatAmount(firstBalance(data), firstCurrency(data)))
            }
        }

        AnnouncementTicker(dataAnnouncements(data))

        val taskArray = data?.optJSONArray("tasks")
        val featuredTask = taskArray?.optJSONObject(0)
        val stats = data?.optJSONObject("stats")
        val claimedToday = stats?.optInt("claimedToday", 0) ?: 0
        val dailyLimit = data?.optInt("dailyTaskLimit", 20) ?: 20
        val hasTaskCapacity = featuredTask != null && (featuredTask.isNull("capacity") || featuredTask.optInt("claimedCount") < featuredTask.optInt("capacity"))
        val canClaimToday = claimedToday < dailyLimit

        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
                Text(
                    "警告：做任务之前请进入查看教程",
                    color = Color(0xFFE53945),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable { showTutorial = true }
                )
                Surface(
                    color = Color(0xFFF0F9FE),
                    shape = RoundedCornerShape(12.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFD9EFFB))
                ) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text("单次奖励", color = muted, style = MaterialTheme.typography.bodySmall)
                            Text(
                                if (featuredTask != null) formatAmount(featuredTask.optString("rewardMinor"), featuredTask.optString("currency")) else "—",
                                color = ink,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        VerticalDivider(Modifier.height(38.dp), color = Color(0xFFDDE8EF))
                        Column(Modifier.weight(1f).padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text("今日任务", color = muted, style = MaterialTheme.typography.bodySmall)
                            Text("$claimedToday/$dailyLimit", color = ink, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                if (featuredTask != null) {
                    Text(featuredTask.optString("title"), color = ink, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                } else if (!loading) {
                    Text("目前没有可领取的已发布任务", color = muted, style = MaterialTheme.typography.bodySmall)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    val statusText = when {
                        loading -> "正在读取"
                        !hasTaskCapacity -> "暂无可领取"
                        !canClaimToday -> "今日已达上限"
                        else -> "可领取"
                    }
                    Surface(color = paleSky, shape = RoundedCornerShape(10.dp)) {
                        Text("● $statusText", Modifier.padding(horizontal = 11.dp, vertical = 7.dp), color = Color(0xFF1685B8), style = MaterialTheme.typography.labelLarge)
                    }
                    Button(
                        onClick = { onNavigate(1) },
                        colors = ButtonDefaults.buttonColors(containerColor = sky),
                        shape = RoundedCornerShape(11.dp)
                    ) { Text("开始任务  ▷", color = Color.White) }
                }
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(18.dp).clickable { showTutorial = true }, verticalAlignment = Alignment.CenterVertically) {
                Surface(color = paleSky, shape = RoundedCornerShape(40.dp)) { Icon(Icons.Default.Assignment, null, tint = sky, modifier = Modifier.padding(13.dp).size(28.dp)) }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) { Text("任务使用教程", color = ink, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium); Text("了解任务规则、流程与注意事项", color = muted) }
                Icon(Icons.Default.ChevronRight, null, tint = muted)
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("设备与权限状态", color = ink, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Surface(color = paleSky, shape = RoundedCornerShape(9.dp)) { Text(if (overlay && capture) "✓ 全部正常" else "待完成授权", Modifier.padding(horizontal = 10.dp, vertical = 7.dp), color = Color(0xFF1685B8), fontWeight = FontWeight.Bold) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PermissionTile("悬浮窗权限", if (overlay) "已开启" else "未开启", overlay, Modifier.weight(1f))
                    PermissionTile("截图提交能力", if (capture) "本次已授权" else "开始任务时授权", capture, Modifier.weight(1f))
                }
                Button(onClick = {
                    if (!overlay) {
                        permissionStep = 1
                        context.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")))
                    } else captureLauncher.launch(context.getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent())
                }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = sky), shape = RoundedCornerShape(12.dp)) {
                    Text(if (!overlay) "一键开启权限  (第 1 步)" else "一键开启权限  (截图授权)", color = Color.White)
                }
                Text("Android 要求分别确认悬浮窗和屏幕捕获权限。截图授权仅对本次授权会话有效。", color = muted, style = MaterialTheme.typography.bodySmall)
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(vertical = 18.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                Column(Modifier.clickable { onNavigate(2) }, horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Default.PersonAdd, null, tint = Color(0xFFFF8A24), modifier = Modifier.size(30.dp)); Text("邀请好友", color = ink, fontWeight = FontWeight.Bold); Text("赚取更多奖励", color = muted) }
                Column(Modifier.clickable { onNavigate(3) }, horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Default.AccountBalanceWallet, null, tint = Color(0xFF1685B8), modifier = Modifier.size(30.dp)); Text("收款账户", color = ink, fontWeight = FontWeight.Bold); Text("管理账户", color = muted) }
            }
        }
        Card(onClick = { onNavigate(1) }, colors = CardDefaults.cardColors(containerColor = paleSky), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(color = Color.White, shape = RoundedCornerShape(40.dp)) { Icon(Icons.Default.CardGiftcard, null, tint = sky, modifier = Modifier.padding(12.dp).size(28.dp)) }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) { Text("立即开始任务", color = Color(0xFF1685B8), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold); Text("快速开始，完成任务赚取收益", color = muted) }
                Surface(color = sky, shape = RoundedCornerShape(40.dp)) { Icon(Icons.Default.PlayArrow, null, tint = Color.White, modifier = Modifier.padding(12.dp).size(28.dp)) }
            }
        }
        TextButton(onClick = { load() }, modifier = Modifier.fillMaxWidth()) { Text("刷新首页数据", color = sky) }
    }

    if (showTutorial) AlertDialog(onDismissRequest = { showTutorial = false }, title = { Text("任务使用教程") }, text = { Text("请先阅读任务要求，确认适用规则后再开始；仅向已同意接收消息的用户开展任务，提交真实证据等待审核。禁止伪造截图、骚扰他人或规避平台规则。") }, confirmButton = { TextButton(onClick = { showTutorial = false }) { Text("我知道了") } })

    LifecycleEventEffect(androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
        overlay = Settings.canDrawOverlays(context)
        if (permissionStep == 1 && overlay) {
            permissionStep = 2
            captureLauncher.launch(context.getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent())
        }
    }
}

@Composable
private fun AnnouncementTicker(messages: List<String>) {
    val text = messages.joinToString("     •     ").ifBlank { "暂无公告" }
    var containerWidth by remember { mutableIntStateOf(0) }
    var textWidth by remember { mutableIntStateOf(0) }
    val tickerOffset = remember { Animatable(0f) }

    Box(
        Modifier
            .fillMaxWidth()
            .height(48.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White)
            .onSizeChanged { containerWidth = it.width }
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.CenterStart
    ) {
        Text(
            text = text,
            color = Color(0xFFE53945),
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            softWrap = false,
            modifier = Modifier
                .offset { IntOffset(tickerOffset.value.roundToInt(), 0) }
                .onSizeChanged { textWidth = it.width }
        )
    }

    LaunchedEffect(text, containerWidth, textWidth) {
        if (containerWidth > 0 && textWidth > 0) {
            val start = containerWidth.toFloat()
            val end = -textWidth.toFloat()
            val duration = (((containerWidth + textWidth) / 42f) * 1000f).roundToInt().coerceAtLeast(5000)
            tickerOffset.snapTo(start)
            while (true) {
                tickerOffset.animateTo(end, animationSpec = tween(durationMillis = duration, easing = LinearEasing))
                tickerOffset.snapTo(start)
            }
        }
    }
}

private fun dataAnnouncements(data: JSONObject?): List<String> {
    val values = data?.optJSONArray("announcements") ?: return emptyList()
    return (0 until values.length()).map { values.optString(it).trim() }.filter { it.isNotBlank() }
}

@Composable
private fun PermissionTile(title: String, status: String, granted: Boolean, modifier: Modifier = Modifier) {
    Surface(modifier = modifier, color = Color(0xFFF2F7FB), shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(if (title.contains("悬浮")) Icons.Default.PictureInPictureAlt else Icons.Default.ScreenshotMonitor, contentDescription = null, tint = Color(0xFF1685B8), modifier = Modifier.size(25.dp))
            Text(title, color = Color(0xFF17243A), fontWeight = FontWeight.Bold)
            Text(status, color = if (granted) Color(0xFF1685B8) else Color(0xFFB54708), style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun Metric(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) { Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
}
@Composable
private fun PermissionLine(label: String, status: String, granted: Boolean) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(label); Text(status, color = if (granted) Color(0xFF1685B8) else Color(0xFFB54708)) }
}
private fun firstBalance(data: JSONObject?): String = data?.optJSONArray("balances")?.optJSONObject(0)?.optString("amountMinor") ?: "0"
private fun firstCurrency(data: JSONObject?): String = data?.optJSONArray("balances")?.optJSONObject(0)?.optString("currency") ?: "USD"
private fun currencySymbol(currency: String): String = runCatching { java.util.Currency.getInstance(currency).getSymbol(java.util.Locale.US) }.getOrDefault("$")
private fun formatAmount(minor: String, currency: String): String {
    val digits = runCatching { java.util.Currency.getInstance(currency).defaultFractionDigits }.getOrDefault(2).coerceAtLeast(0)
    val amount = runCatching { java.math.BigDecimal(minor).movePointLeft(digits).setScale(digits, java.math.RoundingMode.DOWN).toPlainString() }.getOrDefault("0")
    return "${currencySymbol(currency)}$amount"
}
private fun formatBalance(minor: String, currency: String): String = formatAmount(minor, currency)

@Composable
private fun SimpleScreen(title: String, description: String, modifier: Modifier = Modifier) {
    Column(modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { Text(title, style = MaterialTheme.typography.headlineSmall); Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant) }
}
