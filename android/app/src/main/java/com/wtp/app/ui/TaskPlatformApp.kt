package com.wtp.app.ui

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.content.Intent
import android.net.Uri
import android.media.projection.MediaProjectionManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.wtp.app.capture.CaptureSessionState
import com.wtp.app.capture.ScreenCaptureService
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
import androidx.compose.ui.graphics.asImageBitmap
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
    val appContext = LocalContext.current
    var checking by remember { mutableStateOf(true) }
    var authenticated by rememberSaveable { mutableStateOf(false) }
    var phone by rememberSaveable { mutableStateOf("") }
    var language by rememberSaveable { mutableStateOf("zh-CN") }
    LaunchedEffect(Unit) {
        try {
            val user = withContext(Dispatchers.IO) { AuthRepository.currentUser() }
            phone = user.optString("phone")
            language = user.optJSONObject("profile")?.optString("locale")?.takeIf { it == "en" } ?: "zh-CN"
            authenticated = true
        } catch (_: Exception) { authenticated = false } finally { checking = false }
    }
    when {
        checking -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        !authenticated -> AuthScreen { phone = it; authenticated = true }
        else -> MemberShell(phone, language, onLanguageChanged = { language = it }) {
            appContext.stopService(Intent(appContext, ScreenCaptureService::class.java))
            CaptureSessionState.clearActiveClaim()
            CaptureSessionState.clearLastCapture()
            withContext(Dispatchers.IO) { runCatching { AuthRepository.logout() } }
            authenticated = false
            phone = ""
        }
    }
}

@Composable
private fun MemberShell(phone: String, language: String, onLanguageChanged: (String) -> Unit, onLogout: suspend () -> Unit) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val navLabels = if (language == "en") listOf("Home", "Tasks", "Promote", "Wallet", "Me") else listOf("首页", "任务", "推广", "钱包", "我的")
    val navIcons = listOf(Icons.Default.Home, Icons.Default.Assignment, Icons.Default.Group, Icons.Default.Wallet, Icons.Default.AccountCircle)
    Scaffold(containerColor = MaterialTheme.colorScheme.background, bottomBar = {
        NavigationBar(containerColor = Color.White) {
            navLabels.forEachIndexed { i, label -> NavigationBarItem(selected = tab == i, onClick = { tab = i }, icon = { Icon(navIcons[i], label) }, label = { Text(label) }) }
        }
    }) { padding ->
        when (tab) {
            0 -> HomeDashboardScreen(Modifier.padding(padding), onNavigate = { tab = it }, language = language, onLanguageChanged = onLanguageChanged)
            1 -> TaskHallScreen(Modifier.padding(padding), language, onLanguageChanged)
            2 -> PromotionScreen(Modifier.padding(padding), language)
            3 -> SimpleScreen(if (language == "en") "Wallet" else "钱包", if (language == "en") "Wallet balances and statements will be connected in the wallet module." else "钱包余额和账单将在钱包模块接入。", Modifier.padding(padding))
            else -> Column(Modifier.fillMaxSize().padding(padding).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(if (language == "en") "My account" else "我的账户", style = MaterialTheme.typography.headlineSmall)
                Text((if (language == "en") "Phone: " else "登录手机号：") + phone)
                Button(onClick = { scope.launch { onLogout() } }) { Text(if (language == "en") "Log out" else "退出登录") }
            }
        }
    }
}

@Composable
private fun HomeDashboardScreen(modifier: Modifier = Modifier, onNavigate: (Int) -> Unit, language: String, onLanguageChanged: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<JSONObject?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var overlay by remember { mutableStateOf(Settings.canDrawOverlays(context)) }
    val captureActive by CaptureSessionState.active.collectAsState()
    val lastCaptureName by CaptureSessionState.lastCaptureName.collectAsState()
    val captureError by CaptureSessionState.error.collectAsState()
    var permissionStep by remember { mutableIntStateOf(0) }
    var showTutorial by remember { mutableStateOf(false) }
    var languageMenuOpen by remember { mutableStateOf(false) }
    var supportDialogOpen by remember { mutableStateOf(false) }
    var actionMessage by remember { mutableStateOf("") }
    val isEnglish = language == "en"

    val sky = Color(0xFF20A9E5)
    val paleSky = Color(0xFFE4F5FD)
    val ink = Color(0xFF17243A)
    val muted = Color(0xFF718096)
    val captureLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        permissionStep = 0
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val serviceIntent = Intent(context, ScreenCaptureService::class.java).apply {
                action = ScreenCaptureService.ACTION_START
                putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, result.resultCode)
                putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, result.data)
            }
            runCatching {
                ContextCompat.startForegroundService(context, serviceIntent)
            }.onFailure { error ->
                actionMessage = error.message ?: if (isEnglish) "Could not start capture service" else "无法启动截图服务"
            }
        } else {
            actionMessage = if (isEnglish) "Screen capture was not authorized." else "你取消了屏幕截图授权。"
        }
    }
    val notificationPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            captureLauncher.launch(context.getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent())
        } else {
            actionMessage = if (isEnglish) {
                "Allow notifications so the ongoing capture service can show its Capture and Stop controls."
            } else {
                "请允许通知权限，截图服务才能持续显示运行状态以及“截图”和“停止”按钮。"
            }
        }
    }
    val requestCaptureSession: () -> Unit = {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            captureLauncher.launch(context.getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent())
        }
    }
    fun load() {
        scope.launch {
            loading = true
            error = null
            try { data = withContext(Dispatchers.IO) { AuthRepository.dashboard() } }
            catch (e: Exception) { error = e.message ?: if (isEnglish) "Dashboard failed to load" else "首页数据加载失败" }
            finally { loading = false }
        }
    }
    LaunchedEffect(Unit) { load() }

    Column(modifier.fillMaxSize().background(Color(0xFFF2F5F8)).verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(
            Modifier
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color(0xFF0A6FAF), Color(0xFFCDEFFC))))
                .padding(horizontal = 6.dp, vertical = 3.dp)
        ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Surface(color = Color.White, shape = RoundedCornerShape(28.dp)) {
                Row(Modifier.padding(end = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(if (isEnglish) "Withdraw" else "提现", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.background(Brush.verticalGradient(listOf(Color(0xFF0879B9), Color(0xFF48C5F1))), RoundedCornerShape(28.dp)).padding(horizontal = 14.dp, vertical = 9.dp))
                    Spacer(Modifier.width(10.dp))
                    Text(formatBalance(firstBalance(data), firstCurrency(data)), color = ink, fontWeight = FontWeight.Bold)
                }
            }
            Text(if (isEnglish) "Home" else "首页", color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = {
                    val supportUrl = data?.optString("supportUrl")?.takeIf { it.isNotBlank() && it != "null" }
                    if (supportUrl == null) supportDialogOpen = true
                    else runCatching {
                        val uri = Uri.parse(supportUrl)
                        require(uri.scheme == "https" || uri.scheme == "http")
                        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                    }.onFailure { supportDialogOpen = true }
                }) { Icon(Icons.Default.HeadsetMic, contentDescription = if (isEnglish) "Support" else "客服", tint = Color.White) }
                Box {
                    IconButton(onClick = { languageMenuOpen = true }) {
                        Icon(Icons.Default.Language, contentDescription = if (isEnglish) "Language" else "语言", tint = Color.White)
                    }
                    DropdownMenu(expanded = languageMenuOpen, onDismissRequest = { languageMenuOpen = false }) {
                        DropdownMenuItem(text = { Text("简体中文") }, onClick = {
                            languageMenuOpen = false
                            scope.launch {
                                try {
                                    withContext(Dispatchers.IO) { AuthRepository.updateLocale("zh-CN") }
                                    onLanguageChanged("zh-CN")
                                    actionMessage = "语言已切换为简体中文"
                                } catch (e: Exception) { actionMessage = e.message ?: "语言保存失败" }
                            }
                        })
                        DropdownMenuItem(text = { Text("English") }, onClick = {
                            languageMenuOpen = false
                            scope.launch {
                                try {
                                    withContext(Dispatchers.IO) { AuthRepository.updateLocale("en") }
                                    onLanguageChanged("en")
                                    actionMessage = "Language changed to English"
                                } catch (e: Exception) { actionMessage = e.message ?: "Could not save language" }
                            }
                        })
                    }
                }
            }
        }
        }

        if (error != null) Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3F2)), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.padding(14.dp)) {
                Text(if (isEnglish) "Dashboard failed to load" else "首页数据加载失败", color = Color(0xFFB42318), fontWeight = FontWeight.Bold)
                Text(error!!, color = Color(0xFFB42318))
                TextButton(onClick = { load() }) { Text(if (isEnglish) "Retry" else "重新加载") }
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF7F7)), shape = RoundedCornerShape(16.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFFB9C1))) {
            Column(Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.WarningAmber, contentDescription = null, tint = Color(0xFFE53945))
                    Spacer(Modifier.width(8.dp))
                    Text(if (isEnglish) "Important notice" else "重要提醒", color = Color(0xFFE53945), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(8.dp))
                Text(if (isEnglish) "Follow WhatsApp rules and work only with people who agreed to receive messages. Harassment, forged evidence and attempts to bypass platform rules are prohibited." else "为保障 WhatsApp 账号安全，请遵守 WhatsApp 使用规则，仅向已同意接收消息的用户开展任务。禁止骚扰信息、伪造任务证据或规避平台规则。", color = Color(0xFFD93640), style = MaterialTheme.typography.bodyMedium)
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(vertical = 11.dp, horizontal = 8.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                Metric(if (isEnglish) "Settled today" else "今日已结算", data?.optJSONObject("stats")?.optInt("settledToday")?.toString() ?: if (loading) "…" else "0")
                VerticalDivider(Modifier.height(34.dp), color = Color(0xFFE6ECF1))
                Metric(if (isEnglish) "Pending review" else "待审核", data?.optJSONObject("stats")?.optInt("pendingReview")?.toString() ?: if (loading) "…" else "0")
                VerticalDivider(Modifier.height(34.dp), color = Color(0xFFE6ECF1))
                Metric(if (isEnglish) "Withdrawable (${currencySymbol(firstCurrency(data))})" else "可提现(${currencySymbol(firstCurrency(data))})", formatAmount(firstBalance(data), firstCurrency(data)))
            }
        }

        AnnouncementTicker(dataAnnouncements(data), if (isEnglish) "No announcements yet" else "暂无公告")

        val taskArray = data?.optJSONArray("tasks")
        val featuredTask = taskArray?.optJSONObject(0)
        val stats = data?.optJSONObject("stats")
        val claimedToday = stats?.optInt("claimedToday", 0) ?: 0
        val dailyLimit = data?.optInt("dailyTaskLimit", 20) ?: 20
        val hasTaskCapacity = featuredTask != null &&
            (featuredTask.isNull("capacity") || featuredTask.optInt("claimedCount") < featuredTask.optInt("capacity"))
        val canClaimToday = claimedToday < dailyLimit

        // Only this task-and-guide block is being rearranged:
        // warning -> guide -> reward/daily count -> availability/action.
        Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                Modifier.fillMaxWidth().padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(11.dp)
            ) {
                Text(
                    if (isEnglish) "Warning: Read the task guide before starting"
                    else "警告：做任务之前请进入查看教程",
                    color = Color(0xFFE53945),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )

                Surface(
                    modifier = Modifier.fillMaxWidth().clickable { showTutorial = true },
                    color = Color(0xFFF5FBFE),
                    shape = RoundedCornerShape(12.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFD9EFFB))
                ) {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(color = paleSky, shape = RoundedCornerShape(40.dp)) {
                            Icon(
                                Icons.Default.Assignment,
                                contentDescription = null,
                                tint = sky,
                                modifier = Modifier.padding(10.dp).size(26.dp)
                            )
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                if (isEnglish) "Task guide" else "任务使用教程",
                                color = ink,
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.titleMedium
                            )
                            Text(
                                if (isEnglish) "Learn task rules, steps and safety notes"
                                else "了解任务规则、流程与注意事项",
                                color = muted
                            )
                        }
                        Icon(Icons.Default.ChevronRight, null, tint = muted)
                    }
                }

                Surface(
                    color = Color(0xFFF0F9FE),
                    shape = RoundedCornerShape(12.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFD9EFFB))
                ) {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(
                                if (isEnglish) "Reward per task" else "单次奖励",
                                color = muted,
                                style = MaterialTheme.typography.bodySmall
                            )
                            Text(
                                if (featuredTask != null) {
                                    formatTaskReward(
                                        featuredTask.optString("rewardMinor"),
                                        featuredTask.optString("currency", "USD")
                                    )
                                } else {
                                    "USD 0.000"
                                },
                                color = ink,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        VerticalDivider(Modifier.height(38.dp), color = Color(0xFFDDE8EF))
                        Column(
                            Modifier.weight(1f).padding(start = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(3.dp)
                        ) {
                            Text(
                                if (isEnglish) "Tasks today" else "今日任务",
                                color = muted,
                                style = MaterialTheme.typography.bodySmall
                            )
                            Text(
                                "$claimedToday/$dailyLimit",
                                color = ink,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                if (featuredTask != null) {
                    Text(
                        featuredTask.optString("title"),
                        color = ink,
                        fontWeight = FontWeight.SemiBold,
                        style = MaterialTheme.typography.bodyMedium
                    )
                } else if (!loading) {
                    Text(
                        if (isEnglish) "No published tasks are available right now"
                        else "目前没有可领取的已发布任务",
                        color = muted,
                        style = MaterialTheme.typography.bodySmall
                    )
                }

                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val statusText = when {
                        loading -> if (isEnglish) "Loading" else "正在读取"
                        !hasTaskCapacity -> if (isEnglish) "Unavailable" else "暂无可领取"
                        !canClaimToday -> if (isEnglish) "Daily limit reached" else "今日已达上限"
                        else -> if (isEnglish) "Available" else "可领取"
                    }
                    Surface(color = paleSky, shape = RoundedCornerShape(10.dp)) {
                        Text(
                            "● $statusText",
                            Modifier.padding(horizontal = 11.dp, vertical = 7.dp),
                            color = Color(0xFF1685B8),
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                    Button(
                        onClick = { onNavigate(1) },
                        colors = ButtonDefaults.buttonColors(containerColor = sky),
                        shape = RoundedCornerShape(11.dp)
                    ) {
                        Text(
                            if (isEnglish) "Start task  ▷" else "开始任务  ▷",
                            color = Color.White
                        )
                    }
                }
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(if (isEnglish) "Device & permissions" else "设备与权限状态", color = ink, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Surface(color = paleSky, shape = RoundedCornerShape(9.dp)) { Text(if (overlay && captureActive) if (isEnglish) "✓ Session active" else "✓ 会话运行中" else if (isEnglish) "Permission needed" else "待完成授权", Modifier.padding(horizontal = 10.dp, vertical = 7.dp), color = Color(0xFF1685B8), fontWeight = FontWeight.Bold) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PermissionTile(if (isEnglish) "Overlay permission" else "悬浮窗权限", if (overlay) { if (isEnglish) "Enabled" else "已开启" } else { if (isEnglish) "Not enabled" else "未开启" }, overlay, Modifier.weight(1f))
                    PermissionTile(
                        if (isEnglish) "Screenshot session" else "持续截图会话",
                        if (captureActive) {
                            if (isEnglish) "Running" else "运行中"
                        } else {
                            if (isEnglish) "Start once for this work session" else "开始任务前授权一次"
                        },
                        captureActive,
                        Modifier.weight(1f)
                    )
                }
                Button(onClick = {
                    if (!overlay) {
                        permissionStep = 1
                        context.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")))
                    } else if (captureActive) {
                        context.startService(Intent(context, ScreenCaptureService::class.java).setAction(ScreenCaptureService.ACTION_CAPTURE))
                    } else {
                        requestCaptureSession()
                    }
                }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = sky), shape = RoundedCornerShape(12.dp)) {
                    Text(
                        when {
                            !overlay -> if (isEnglish) "Enable overlay permission" else "开启悬浮窗权限"
                            captureActive -> if (isEnglish) "Capture current screen" else "截图当前屏幕"
                            else -> if (isEnglish) "Start capture session" else "开启持续截图会话"
                        },
                        color = Color.White
                    )
                }
                if (captureActive) {
                    Text(
                        if (isEnglish) "Capture session is active. When you switch to another app, use the Capture action in the ongoing notification. You can take multiple screenshots without repeating consent while this session remains active."
                        else "截图会话正在运行。切换到其他应用后，可在手机通知栏点击“截图当前屏幕”。会话持续期间可以连续截图，不需要重复授权。",
                        color = muted,
                        style = MaterialTheme.typography.bodySmall
                    )
                    if (lastCaptureName != null) {
                        Text(
                            (if (isEnglish) "Last screenshot saved locally: " else "最近截图已保存到本机：") + lastCaptureName,
                            color = Color(0xFF1685B8),
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                    TextButton(onClick = {
                        context.startService(Intent(context, ScreenCaptureService::class.java).setAction(ScreenCaptureService.ACTION_STOP))
                    }) {
                        Text(if (isEnglish) "Stop capture session" else "停止截图会话")
                    }
                } else {
                    Text(
                        if (isEnglish) "Android requires user consent when a new capture session starts. One running session can serve multiple manual screenshots; system termination requires a new consent."
                        else "Android 要求每次新截图会话开始时由用户确认。一个持续运行的会话可以供多个任务重复截图；系统终止会话后需要重新授权。",
                        color = muted,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                if (!captureError.isNullOrBlank()) {
                    Text(captureError!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(vertical = 18.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                Column(Modifier.clickable { onNavigate(2) }, horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Default.PersonAdd, null, tint = Color(0xFFFF8A24), modifier = Modifier.size(30.dp)); Text(if (isEnglish) "Invite friends" else "邀请好友", color = ink, fontWeight = FontWeight.Bold); Text(if (isEnglish) "Earn more rewards" else "赚取更多奖励", color = muted) }
                Column(Modifier.clickable { onNavigate(3) }, horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Default.AccountBalanceWallet, null, tint = Color(0xFF1685B8), modifier = Modifier.size(30.dp)); Text(if (isEnglish) "Payout account" else "收款账户", color = ink, fontWeight = FontWeight.Bold); Text(if (isEnglish) "Manage account" else "管理账户", color = muted) }
            }
        }
        Card(onClick = { onNavigate(1) }, colors = CardDefaults.cardColors(containerColor = paleSky), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(color = Color.White, shape = RoundedCornerShape(40.dp)) { Icon(Icons.Default.CardGiftcard, null, tint = sky, modifier = Modifier.padding(12.dp).size(28.dp)) }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) { Text(if (isEnglish) "Start earning" else "立即开始任务", color = Color(0xFF1685B8), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold); Text(if (isEnglish) "Complete tasks and earn rewards" else "快速开始，完成任务赚取收益", color = muted) }
                Surface(color = sky, shape = RoundedCornerShape(40.dp)) { Icon(Icons.Default.PlayArrow, null, tint = Color.White, modifier = Modifier.padding(12.dp).size(28.dp)) }
            }
        }
        TextButton(onClick = { load() }, modifier = Modifier.fillMaxWidth()) { Text(if (isEnglish) "Refresh dashboard" else "刷新首页数据", color = sky) }
    }

    if (actionMessage.isNotBlank()) AlertDialog(
        onDismissRequest = { actionMessage = "" },
        text = { Text(actionMessage) },
        confirmButton = { TextButton(onClick = { actionMessage = "" }) { Text(if (isEnglish) "OK" else "确定") } }
    )
    if (supportDialogOpen) AlertDialog(
        onDismissRequest = { supportDialogOpen = false },
        title = { Text(if (isEnglish) "Support" else "客服") },
        text = { Text(if (isEnglish) "Support has not been configured yet. Its URL will be managed from the admin portal." else "客服入口暂未配置，后续将由管理后台统一设置，APP 会读取同一个接口。") },
        confirmButton = { TextButton(onClick = { supportDialogOpen = false }) { Text(if (isEnglish) "OK" else "确定") } }
    )
    if (showTutorial) AlertDialog(
        onDismissRequest = { showTutorial = false },
        title = { Text(if (isEnglish) "Task guide" else "任务使用教程") },
        text = { Text(if (isEnglish) "Read the task requirements first. Work only with consenting users, submit genuine evidence, and follow platform rules. Do not spam, forge screenshots, or bypass safeguards." else "请先阅读任务要求，确认适用规则后再开始；仅向已同意接收消息的用户开展任务，提交真实证据等待审核。禁止伪造截图、骚扰他人或规避平台规则。") },
        confirmButton = { TextButton(onClick = { showTutorial = false }) { Text(if (isEnglish) "Got it" else "我知道了") } }
    )

    LifecycleEventEffect(androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
        overlay = Settings.canDrawOverlays(context)
        if (permissionStep == 1 && overlay) {
            permissionStep = 2
            requestCaptureSession()
        }
    }
}

@Composable
private fun AnnouncementTicker(messages: List<String>, emptyText: String) {
    val text = messages.joinToString("     •     ").ifBlank { emptyText }
    var containerWidth by remember { mutableIntStateOf(0) }
    var textWidth by remember { mutableIntStateOf(0) }
    val tickerOffset = remember { Animatable(0f) }

    Box(
        Modifier
            .fillMaxWidth()
            .height(48.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Brush.verticalGradient(listOf(Color(0xFFB9E8FC), Color(0xFFE5F6FE))))
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
            val duration = (((containerWidth + textWidth) / 275f) * 1000f).roundToInt().coerceAtLeast(1000)
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
            Icon(if (title.contains("悬浮") || title.contains("Overlay")) Icons.Default.PictureInPictureAlt else Icons.Default.ScreenshotMonitor, contentDescription = null, tint = Color(0xFF1685B8), modifier = Modifier.size(25.dp))
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
private fun formatTaskReward(minor: String, currency: String): String {
    // Keep the same 3-decimal display convention used by the web member dashboard.
    val amount = runCatching {
        java.math.BigDecimal(minor)
            .movePointLeft(2)
            .setScale(3, java.math.RoundingMode.DOWN)
            .toPlainString()
    }.getOrDefault("0.000")
    val code = currency.trim().ifBlank { "USD" }
    return "$code $amount"
}
private fun formatBalance(minor: String, currency: String): String = formatAmount(minor, currency)

@Composable
private fun SimpleScreen(title: String, description: String, modifier: Modifier = Modifier) {
    Column(modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { Text(title, style = MaterialTheme.typography.headlineSmall); Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant) }
}


@Composable
private fun PromotionScreen(modifier: Modifier = Modifier, language: String) {
    val context = LocalContext.current
    val isEnglish = language == "en"
    var data by remember { mutableStateOf<JSONObject?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var detail by remember { mutableStateOf("") }
    var supportDialog by remember { mutableStateOf(false) }
    var showQrDialog by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val inviteUrl = data?.optString("inviteUrl").orEmpty()
    val inviteCode = data?.optString("referralCode").orEmpty()
    fun load() {
        scope.launch {
            loading = true
            error = null
            try { data = withContext(Dispatchers.IO) { AuthRepository.promotionSummary() } }
            catch (e: Exception) { error = e.message ?: if (isEnglish) "Could not load promotion data" else "推广数据加载失败" }
            finally { loading = false }
        }
    }
    LaunchedEffect(Unit) { load() }
    fun amount(json: JSONObject?, key: String): String {
        val values = json?.optJSONObject(key) ?: JSONObject()
        val currency = values.keys().asSequence().firstOrNull() ?: "USD"
        val minor = values.optString(currency, "0").toBigDecimalOrNull() ?: java.math.BigDecimal.ZERO
        return String.format(java.util.Locale.US, "%.3f %s", minor.divide(java.math.BigDecimal(100)), currency)
    }
    val balances = data?.optJSONArray("availableBalances")
    val balance = balances?.optJSONObject(0)?.let {
        val minor = it.optString("amountMinor", "0").toBigDecimalOrNull() ?: java.math.BigDecimal.ZERO
        String.format(java.util.Locale.US, "%.3f %s", minor.divide(java.math.BigDecimal(100)), it.optString("currency", "USD"))
    } ?: "0.000 USD"
    fun copyText(value: String, label: String) {
        if (value.isBlank()) return
        val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        clipboard.setPrimaryClip(android.content.ClipData.newPlainText(label, value))
        android.widget.Toast.makeText(context, if (isEnglish) "Copied" else "已复制", android.widget.Toast.LENGTH_SHORT).show()
    }
    fun shareInvite() {
        if (inviteUrl.isBlank()) return
        val send = Intent(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, if (isEnglish) "Join me" else "邀请你加入")
            .putExtra(Intent.EXTRA_TEXT, inviteUrl)
        context.startActivity(Intent.createChooser(send, if (isEnglish) "Share invitation" else "邀请好友"))
    }
    Column(
        modifier.fillMaxSize().background(Color(0xFFF2F5F4)).verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            Modifier.fillMaxWidth().background(Color(0xFFB8E6D2), RoundedCornerShape(16.dp)).padding(horizontal = 12.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(color = Color.White, shape = RoundedCornerShape(24.dp)) {
                Text((if (isEnglish) "Withdraw  " else "提现  ") + balance, Modifier.padding(horizontal = 12.dp, vertical = 8.dp), color = Color(0xFF177A5B), fontWeight = FontWeight.Bold)
            }
            Text(if (isEnglish) "Promote" else "推广", color = Color(0xFF245C4C), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { supportDialog = true }) { Icon(Icons.Default.HeadsetMic, contentDescription = "Support", tint = Color(0xFF477C6C)) }
                Icon(Icons.Default.Language, contentDescription = if (isEnglish) "Language" else "语言", tint = Color(0xFF477C6C))
            }
        }
        if (loading && data == null) {
            Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Color(0xFF278666)) }
        }
        if (error != null) {
            Surface(color = Color(0xFFFFEEEE), shape = RoundedCornerShape(10.dp)) {
                Text(error.orEmpty(), Modifier.fillMaxWidth().clickable { load() }.padding(12.dp), color = Color(0xFFB42318))
            }
        }
        Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(18.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFDCEDE5))
        ) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(if (isEnglish) "My invitation code" else "我的邀请码", color = Color(0xFF667085), style = MaterialTheme.typography.bodyMedium)
                        Text(inviteCode.ifBlank { if (loading) "…" else "—" }, color = Color(0xFF216D54), fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.headlineMedium)
                        OutlinedButton(
                            onClick = { copyText(inviteCode, "Invitation code") },
                            enabled = inviteCode.isNotBlank(),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 5.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF278666))
                        ) {
                            Icon(Icons.Default.ContentCopy, null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(5.dp))
                            Text(if (isEnglish) "Copy code" else "复制邀请码")
                        }
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (inviteUrl.isNotBlank()) PromotionQrCode(inviteUrl, Modifier.size(88.dp), onClick = { showQrDialog = true })
                        else Surface(Modifier.size(88.dp), color = Color(0xFFF5F8F6), shape = RoundedCornerShape(12.dp)) {}
                        Text(if (isEnglish) "QR code" else "邀请二维码", color = Color(0xFF667085), style = MaterialTheme.typography.labelSmall)
                    }
                }
                Row(
                    Modifier.fillMaxWidth().background(Color(0xFFF5FAF7), RoundedCornerShape(12.dp)).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp)
                ) {
                    Surface(color = Color(0xFFE3F3EC), shape = RoundedCornerShape(30.dp)) {
                        Icon(Icons.Default.Link, null, tint = Color(0xFF218365), modifier = Modifier.padding(10.dp))
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(if (isEnglish) "My invitation link" else "我的邀请链接", color = Color(0xFF667085), style = MaterialTheme.typography.labelSmall)
                        Text(inviteUrl.ifBlank { if (loading) "…" else "—" }, color = Color(0xFF17243A), style = MaterialTheme.typography.bodySmall)
                    }
                    OutlinedButton(
                        onClick = { copyText(inviteUrl, "Invitation link") },
                        enabled = inviteUrl.isNotBlank(),
                        contentPadding = PaddingValues(horizontal = 9.dp, vertical = 5.dp)
                    ) {
                        Icon(Icons.Default.ContentCopy, null, modifier = Modifier.size(15.dp))
                        Text(if (isEnglish) "Copy" else "复制")
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = { shareInvite() },
                        enabled = inviteUrl.isNotBlank(),
                        modifier = Modifier.weight(1f).height(44.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF278666)),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.PersonAdd, null)
                        Spacer(Modifier.width(6.dp))
                        Text(if (isEnglish) "Invite friends" else "邀请好友")
                    }
                    OutlinedButton(
                        onClick = { shareInvite() },
                        enabled = inviteUrl.isNotBlank(),
                        modifier = Modifier.weight(1f).height(44.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF278666))
                    ) {
                        Icon(Icons.Default.Share, null)
                        Spacer(Modifier.width(6.dp))
                        Text(if (isEnglish) "Share now" else "立即分享")
                    }
                }
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(vertical = 18.dp, horizontal = 5.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                PromotionMetric(Icons.Default.MonetizationOn, if (isEnglish) "Today's commission" else "今日佣金", amount(data, "todayCommissions"), modifier = Modifier.weight(1f))
                PromotionMetric(Icons.Default.MonetizationOn, if (isEnglish) "Total commission" else "累计佣金", amount(data, "totalCommissions"), modifier = Modifier.weight(1f))
                PromotionMetric(Icons.Default.Wallet, if (isEnglish) "Available balance" else "可用余额", balance)
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(vertical = 18.dp, horizontal = 5.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                PromotionMetric(Icons.Default.PersonAdd, if (isEnglish) "Invited" else "邀请人数", data?.optInt("inviteCount", 0)?.toString() ?: "0", modifier = Modifier.weight(1f))
                PromotionMetric(Icons.Default.Groups, if (isEnglish) "Active users" else "活跃用户", data?.optInt("activeCount", 0)?.toString() ?: "0", modifier = Modifier.weight(1f))
                PromotionMetric(Icons.Default.MonetizationOn, if (isEnglish) "This month" else "本月佣金", amount(data, "monthCommissions"), modifier = Modifier.weight(1f))
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                PromotionMenuRow(Icons.Default.PersonAdd, if (isEnglish) "Invite friends" else "邀请好友", if (isEnglish) "Share your invitation link or code" else "分享你的注册链接或邀请码") { detail = "invite" }
                HorizontalDivider(color = Color(0xFFEEF1F3))
                PromotionMenuRow(Icons.Default.ReceiptLong, if (isEnglish) "Commission history" else "佣金记录", if (isEnglish) "View commission amounts and settlement status" else "查看每笔佣金的金额和结算状态") { detail = "commission" }
                HorizontalDivider(color = Color(0xFFEEF1F3))
                PromotionMenuRow(Icons.Default.Groups, if (isEnglish) "Team data" else "团队数据", if (isEnglish) "View invited users and team levels" else "查看邀请用户和各层级人数") { detail = "team" }
            }
        }
        if (detail.isNotBlank()) {
            AlertDialog(
                onDismissRequest = { detail = "" },
                title = { Text(when(detail) { "invite" -> if (isEnglish) "Invite friends" else "邀请好友"; "commission" -> if (isEnglish) "Commission history" else "佣金记录"; else -> if (isEnglish) "Team data" else "团队数据" }) },
                text = { Text(when(detail) {
                    "invite" -> (if (isEnglish) "Invitation code: " else "邀请码：") + inviteCode + "\n" + inviteUrl
                    "commission" -> if (isEnglish) "No commission records yet." else "目前暂无佣金明细页面。"
                    else -> (if (isEnglish) "Direct invites: " else "直属邀请：") + (data?.optInt("inviteCount") ?: 0) + (if (isEnglish) "\nTeam members: " else "\n团队人数：") + (data?.optInt("teamCount") ?: 0)
                }) },
                confirmButton = { TextButton(onClick = { detail = "" }) { Text(if (isEnglish) "OK" else "知道了") } }
            )
        }
        if (showQrDialog && inviteUrl.isNotBlank()) {
            AlertDialog(
                onDismissRequest = { showQrDialog = false },
                title = { Text(if (isEnglish) "Invitation QR code" else "邀请二维码") },
                text = {
                    Column(
                        Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        PromotionQrCode(inviteUrl, Modifier.size(240.dp))
                        Text(if (isEnglish) "Scan to open your registration link" else "扫码即可打开你的专属注册链接", color = Color(0xFF667085))
                    }
                },
                confirmButton = {
                    TextButton(onClick = { copyText(inviteUrl, "Invitation link"); showQrDialog = false }) {
                        Text(if (isEnglish) "Copy link" else "复制链接")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showQrDialog = false }) { Text(if (isEnglish) "Close" else "关闭") }
                }
            )
        }
        if (supportDialog) {
            AlertDialog(
                onDismissRequest = { supportDialog = false },
                title = { Text(if (isEnglish) "Customer support" else "联系客服") },
                text = { Text(if (isEnglish) "Support contact has not been configured." else "客服入口暂未配置，请联系管理员。") },
                confirmButton = { TextButton(onClick = { supportDialog = false }) { Text(if (isEnglish) "OK" else "知道了") } }
            )
        }
    }
}

@Composable
private fun PromotionQrCode(value: String, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    val bitmap = remember(value) {
        runCatching {
            val hints = mapOf(com.google.zxing.EncodeHintType.MARGIN to 1)
            val matrix = com.google.zxing.MultiFormatWriter().encode(
                value, com.google.zxing.BarcodeFormat.QR_CODE, 320, 320, hints
            )
            android.graphics.Bitmap.createBitmap(320, 320, android.graphics.Bitmap.Config.ARGB_8888).also { image ->
                for (x in 0 until 320) for (y in 0 until 320) {
                    image.setPixel(x, y, if (matrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
                }
            }
        }.getOrNull()
    }
    if (bitmap != null) {
        androidx.compose.foundation.Image(
            bitmap = bitmap.asImageBitmap(),
            contentDescription = "Invitation QR code",
            modifier = modifier.clip(RoundedCornerShape(12.dp)).background(Color.White).then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
        )
    } else {
        Surface(modifier, color = Color(0xFFF5F8F6), shape = RoundedCornerShape(12.dp)) {
            Box(contentAlignment = Alignment.Center) { Icon(Icons.Default.QrCode2, null, tint = Color(0xFF278666)) }
        }
    }
}

@Composable
private fun PromotionMetric(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier.padding(horizontal = 3.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(7.dp)
    ) {
        Surface(
            color = Color(0xFFEEF6F2),
            shape = RoundedCornerShape(50)
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = Color(0xFF278666),
                modifier = Modifier.padding(9.dp).size(21.dp)
            )
        }
        Text(label, color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall, maxLines = 1)
        Text(value, color = Color(0xFF17243A), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
    }
}

@Composable
private fun PromotionMenuRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(color = Color(0xFFEAF5F0), shape = RoundedCornerShape(10.dp)) {
            Icon(icon, null, tint = Color(0xFF278666), modifier = Modifier.padding(10.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, color = Color(0xFF17243A), fontWeight = FontWeight.SemiBold)
            Text(subtitle, color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall)
        }
        Icon(Icons.Default.ChevronRight, null, tint = Color(0xFF667085))
    }
}
