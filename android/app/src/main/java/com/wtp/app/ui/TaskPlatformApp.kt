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
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleEventEffect
import com.wtp.app.data.AuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

private data class NavItem(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)
private val navItems = listOf(NavItem("首页", Icons.Default.Home), NavItem("任务", Icons.Default.Assignment), NavItem("推广", Icons.Default.Group), NavItem("钱包", Icons.Default.Wallet), NavItem("我的", Icons.Default.AccountCircle))

@Composable
fun TaskPlatformApp() {
    val appContext = LocalContext.current
    val scope = rememberCoroutineScope()
    var checking by remember { mutableStateOf(true) }
    var authenticated by rememberSaveable { mutableStateOf(false) }
    var phone by rememberSaveable { mutableStateOf("") }
    var language by rememberSaveable { mutableStateOf("zh-CN") }
    var requiredUpdate by remember { mutableStateOf<JSONObject?>(null) }
    var updateCheckError by remember { mutableStateOf<String?>(null) }
    var checkingUpdate by remember { mutableStateOf(true) }
    suspend fun checkRequiredUpdate() {
        checkingUpdate = true
        updateCheckError = null
        try {
            val info = withContext(Dispatchers.IO) { AuthRepository.publicAppUpdate() }
            val publishedCode = info.optInt("versionCode", 0)
            requiredUpdate = if (info.optBoolean("forceUpdate") && publishedCode > com.wtp.app.BuildConfig.VERSION_CODE) info else null
        } catch (error: Exception) {
            // Never lock users out when the update service is temporarily unavailable.
            updateCheckError = error.message ?: "暂时无法检查更新"
            requiredUpdate = null
        } finally {
            checkingUpdate = false
        }
    }
    LaunchedEffect(Unit) {
        checkRequiredUpdate()
        try {
            val user = withContext(Dispatchers.IO) { AuthRepository.currentUser() }
            phone = user.optString("phone")
            language = user.optJSONObject("profile")?.optString("locale")?.takeIf { it == "en" } ?: "zh-CN"
            authenticated = true
        } catch (_: Exception) { authenticated = false } finally { checking = false }
    }
    when {
        requiredUpdate != null -> ForceUpdateScreen(
            info = requiredUpdate!!,
            language = language,
            checking = checkingUpdate,
            error = updateCheckError,
            onRetry = { scope.launch { checkRequiredUpdate() } }
        )
        checkingUpdate || checking -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
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
private fun ForceUpdateScreen(
    info: JSONObject,
    language: String,
    checking: Boolean,
    error: String?,
    onRetry: () -> Unit
) {
    val context = LocalContext.current
    val en = language == "en"
    val downloadUrl = info.optString("downloadUrl").orEmpty()
    Column(
        Modifier.fillMaxSize().background(Color(0xFFF2F4F6)).padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(Icons.Default.SystemUpdate, null, modifier = Modifier.size(64.dp), tint = Color(0xFF319CCB))
        Spacer(Modifier.height(18.dp))
        Text(if (en) "Update required" else "需要更新应用", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(10.dp))
        Text(
            (if (en) "Version " else "最新版本：") + info.optString("latestVersion"),
            color = Color(0xFF53647C)
        )
        val notes = info.optString("releaseNotes").orEmpty()
        if (notes.isNotBlank()) {
            Spacer(Modifier.height(10.dp))
            Text(notes, color = Color(0xFF53647C))
        }
        if (!error.isNullOrBlank()) {
            Spacer(Modifier.height(10.dp))
            Text(error, color = Color(0xFFC43D3D))
        }
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = {
                runCatching {
                    val uri = Uri.parse(downloadUrl)
                    require(uri.scheme == "https" && !uri.host.isNullOrBlank())
                    context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                }
            },
            enabled = downloadUrl.startsWith("https://"),
            modifier = Modifier.fillMaxWidth()
        ) { Text(if (en) "Download update" else "下载并安装更新") }
        Spacer(Modifier.height(8.dp))
        TextButton(onClick = onRetry, enabled = !checking) {
            Text(if (checking) { if (en) "Checking…" else "正在检查…" } else { if (en) "I have updated — check again" else "已安装更新，重新检查" })
        }
    }
}

@Composable
private fun MemberShell(phone: String, language: String, onLanguageChanged: (String) -> Unit, onLogout: suspend () -> Unit) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var showCommissionHistory by rememberSaveable { mutableStateOf(false) }
    var showInvitePage by rememberSaveable { mutableStateOf(false) }
    var showTeamPage by rememberSaveable { mutableStateOf(false) }
    var walletPage by rememberSaveable { mutableStateOf("home") }
    var profilePage by rememberSaveable { mutableStateOf("home") }
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
            2 -> when {
                showTeamPage -> TeamDataScreen(Modifier.padding(padding), language, onBack = { showTeamPage = false })
                showInvitePage -> InviteFriendsScreen(Modifier.padding(padding), language, onBack = { showInvitePage = false })
                showCommissionHistory -> CommissionHistoryScreen(Modifier.padding(padding), language, onBack = { showCommissionHistory = false })
                else -> PromotionScreen(Modifier.padding(padding), language, onWalletClick = { tab = 3 }, onCommissionClick = { showCommissionHistory = true }, onInviteClick = { showInvitePage = true }, onTeamClick = { showTeamPage = true })
            }
            3 -> when (walletPage) {
                "accounts" -> PayoutAccountsScreen(Modifier.padding(padding), language, onBack = { walletPage = "home" }, onAdd = { walletPage = "add-account" })
                "apply" -> ApplyWithdrawalScreen(Modifier.padding(padding), language, onBack = { walletPage = "home" }, onAddAccount = { walletPage = "add-account" }, onSubmitted = { walletPage = "withdrawals" })
                "add-account" -> AddPayoutAccountScreen(Modifier.padding(padding), language, onBack = { walletPage = "accounts" }, onSaved = { walletPage = "accounts" })
                "details" -> WalletDetailsScreen(Modifier.padding(padding), language, onBack = { walletPage = "home" })
                "withdrawals" -> WithdrawalHistoryScreen(Modifier.padding(padding), language, onBack = { walletPage = "home" })
                "guide" -> WithdrawalGuideScreen(Modifier.padding(padding), language, onBack = { walletPage = "home" })
                else -> WalletScreen(
                    Modifier.padding(padding), language,
                    onApplyWithdraw = { walletPage = "apply" },
                    onPayoutAccounts = { walletPage = "accounts" },
                    onWithdrawalHistory = { walletPage = "withdrawals" },
                    onWithdrawalGuide = { walletPage = "guide" },
                    onInviteFriends = { tab = 2 },
                    onWalletDetails = { walletPage = "details" },
                    onLanguageChanged = onLanguageChanged
                )
            }
            else -> when (profilePage) {
                "security" -> AccountSecurityScreen(Modifier.padding(padding), language, onBack = { profilePage = "home" }, onPassword = { profilePage = "password" }, onLanguage = { profilePage = "language" })
                "password" -> ChangePasswordScreen(Modifier.padding(padding), language, onBack = { profilePage = "security" })
                "language" -> LanguageSettingsScreen(Modifier.padding(padding), language, onBack = { profilePage = "security" }, onLanguageChanged = onLanguageChanged)
                "permissions" -> PermissionStatusScreen(Modifier.padding(padding), language, onBack = { profilePage = "home" })
                else -> MyProfileScreen(Modifier.padding(padding), phone, language, onInvite = { tab = 2 }, onPayoutAccounts = { tab = 3; walletPage = "accounts" }, onAccountSecurity = { profilePage = "security" }, onPermissions = { profilePage = "permissions" }, onLogout = { scope.launch { onLogout() } })
            }
        }
    }
}

@Composable
private fun MyProfileScreen(modifier: Modifier = Modifier, phone: String, language: String, onInvite: () -> Unit, onPayoutAccounts: () -> Unit, onAccountSecurity: () -> Unit, onPermissions: () -> Unit, onLogout: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val en = language == "en"
    var user by remember { mutableStateOf<JSONObject?>(null) }
    var dashboard by remember { mutableStateOf<JSONObject?>(null) }
    var dialog by remember { mutableStateOf("") }
    var updateInfo by remember { mutableStateOf<JSONObject?>(null) }
    var updateLoading by remember { mutableStateOf(false) }
    var updateError by remember { mutableStateOf<String?>(null) }
    var supportUrl by remember { mutableStateOf<String?>(null) }
    val currentVersion = com.wtp.app.BuildConfig.VERSION_NAME
    val overlay = Settings.canDrawOverlays(context)
    LaunchedEffect(Unit) {
        withContext(Dispatchers.IO) {
            user = runCatching { AuthRepository.currentUser() }.getOrNull()
            dashboard = runCatching { AuthRepository.dashboard() }.getOrNull()
            updateInfo = runCatching { AuthRepository.publicAppUpdate() }.getOrNull()
            supportUrl = runCatching { AuthRepository.publicAppSupport().optString("supportUrl").takeIf { it.startsWith("https://") } }.getOrNull()
        }
    }
    val availableBalance = formatAvailableBalances(dashboard?.optJSONArray("balances"))
    val pendingRewards = formatAvailableBalances(dashboard?.optJSONArray("pendingRewards"))
    val totalEarnings = formatAvailableBalances(dashboard?.optJSONArray("totalEarnings"))
    val id = user?.optString("id")?.takeIf { it.isNotBlank() && it != "null" } ?: user?.optString("userId")?.takeIf { it.isNotBlank() && it != "null" }
    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6)).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(Color(0xFFB9E8FC), Color(0xFFF2F7FB)))).padding(horizontal = 18.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Surface(color = Color.White, shape = RoundedCornerShape(24.dp)) { Text((if (en) "Withdraw  " else "提现  ") + availableBalance, Modifier.padding(horizontal = 12.dp, vertical = 7.dp), color = Color(0xFF319CCB), fontWeight = FontWeight.Bold) }
                Spacer(Modifier.weight(1f)); Text(if (en) "My" else "我的", color = Color(0xFF123E56), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium); Spacer(Modifier.weight(1f))
                Icon(Icons.Default.HeadsetMic, if (en) "Customer support" else "联系客服", tint = Color(0xFF5AAED0), modifier = Modifier.clickable { dialog = "support" }); Spacer(Modifier.width(14.dp)); Icon(Icons.Default.Language, null, tint = Color(0xFF5AAED0))
            }
            Row(Modifier.fillMaxWidth().clickable(onClick = onAccountSecurity).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(color = Color(0xFFDDF3FF), shape = RoundedCornerShape(50), border = androidx.compose.foundation.BorderStroke(2.dp, Color.White)) { Icon(Icons.Default.Person, null, tint = Color(0xFF319CCB), modifier = Modifier.size(68.dp).padding(17.dp)) }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { Text(phone, color = Color(0xFF17243A), fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.titleLarge); Surface(color = Color(0xFFDDF3FF), shape = RoundedCornerShape(20.dp)) { Text(if (en) "Verified" else "已认证", Modifier.padding(horizontal = 9.dp, vertical = 4.dp), color = Color(0xFF319CCB), style = MaterialTheme.typography.labelSmall) } }
                    if (id != null) Text("ID: $id", color = Color(0xFF667085), style = MaterialTheme.typography.bodyMedium)
                }
                Surface(color = Color.White, shape = RoundedCornerShape(50)) { Icon(Icons.Default.ChevronRight, null, tint = Color(0xFF667085), modifier = Modifier.padding(8.dp)) }
            }
        }
        Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clickable(onClick = onInvite), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(color = Color(0xFFDDF3FF), shape = RoundedCornerShape(14.dp)) { Icon(Icons.Default.PersonAdd, null, tint = Color(0xFF319CCB), modifier = Modifier.padding(12.dp)) }
                Spacer(Modifier.width(12.dp)); Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) { Text(if (en) "Invite friends and earn commission" else "邀请好友赚佣金", fontWeight = FontWeight.Bold, color = Color(0xFF17243A)); Text(if (en) "Earn extra rewards when friends complete tasks" else "好友完成任务，您可获得额外佣金奖励", color = Color(0xFF718096), style = MaterialTheme.typography.bodySmall) }
                Button(onClick = onInvite, shape = RoundedCornerShape(24.dp), contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF319CCB))) { Text(if (en) "Invite  ›" else "去邀请  ›") }
            }
        }
        Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(if (en) "My assets" else "我的资产", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = Color(0xFF17243A))
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    ProfileAsset(Icons.Default.Wallet, if (en) "Available balance" else "可提现余额", availableBalance, Color(0xFF319CCB), Modifier.weight(1f), onPayoutAccounts)
                    Box(Modifier.width(1.dp).height(56.dp).background(Color(0xFFD8E5EC)))
                    ProfileAsset(Icons.Default.AccountBalanceWallet, if (en) "Pending rewards" else "待审核奖励", if (dashboard == null) "—" else pendingRewards, Color(0xFFFF8A22), Modifier.weight(1f))
                    Box(Modifier.width(1.dp).height(56.dp).background(Color(0xFFD8E5EC)))
                    ProfileAsset(Icons.Default.Paid, if (en) "Total earnings" else "累计收益", if (dashboard == null) "—" else totalEarnings, Color(0xFF319CCB), Modifier.weight(1f))
                }
            }
        }
        Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)) {
                Text(if (en) "Account & security" else "账户与安全", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = Color(0xFF17243A))
                ProfileMenuRow(Icons.Default.AccountBalanceWallet, if (en) "Payout account" else "收款账户", if (en) "Manage payout accounts" else "管理我的收款账户", onPayoutAccounts)
                ProfileMenuRow(Icons.Default.Settings, if (en) "Account security" else "账号与安全", if (en) "Account and system settings" else "账号与系统设置", onAccountSecurity)
                ProfileMenuRow(Icons.Default.Shield, if (en) "Permissions" else "权限状态", if (overlay) { if (en) "Overlay permission enabled" else "已开启悬浮窗权限" } else { if (en) "Permission required" else "尚未开启悬浮窗权限" }, onPermissions, overlay, false)
            }
        }
        Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)) {
                Text(if (en) "More services" else "更多服务", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = Color(0xFF17243A))
                ProfileMenuRow(Icons.Default.SupportAgent, if (en) "Customer support" else "联系客服", if (en) "Online support" else "在线支持", { dialog = "support" })
                ProfileMenuRow(Icons.Default.MenuBook, if (en) "Task tutorial" else "任务使用教程", if (en) "Task rules and instructions" else "了解任务规则、流程与注意事项", { dialog = "tutorial" })
                ProfileMenuRow(Icons.Default.SystemUpdate, if (en) "Check for updates" else "检查更新", if (en) "Current version $currentVersion" else "当前版本 $currentVersion", { dialog = "update" }, showDivider = false)
            }
        }
        Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clickable(onClick = onLogout), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp)) { Box(Modifier.fillMaxWidth().padding(vertical = 17.dp), contentAlignment = Alignment.Center) { Text(if (en) "Log out" else "退出登录", color = Color(0xFFE53935), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium) } }
        Text(if (en) "Version $currentVersion" else "版本 $currentVersion", modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center, color = Color(0xFF718096), style = MaterialTheme.typography.bodySmall)
    }
    val title = when (dialog) { "support" -> if (en) "Customer support" else "联系客服"; "security" -> if (en) "Account security" else "账号与安全"; "tutorial" -> if (en) "Task tutorial" else "任务使用教程"; else -> if (en) "Check for updates" else "检查更新" }
    if (dialog == "update") {
        AlertDialog(
            onDismissRequest = { if (updateInfo?.optBoolean("forceUpdate") != true) dialog = "" },
            title = { Text(if (en) "App update" else "版本更新") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text((if (en) "Current version: " else "当前版本：") + currentVersion)
                    Text((if (en) "Latest version: " else "最新版本：") + (updateInfo?.optString("latestVersion")?.takeIf { !it.isNullOrBlank() && it != "null" } ?: "—"))
                    val notes = updateInfo?.optString("releaseNotes").orEmpty()
                    if (notes.isNotBlank()) Text(notes)
                    when {
                        updateLoading -> Text(if (en) "Checking for updates…" else "正在检查更新…")
                        updateError != null -> Text(updateError!!)
                        updateInfo == null -> Text(if (en) "Update information is unavailable." else "暂时无法获取版本信息。")
                        updateInfo?.optString("latestVersion") == currentVersion -> Text(if (en) "You are using the latest version." else "当前已是最新版本。")
                        else -> Text(if (en) "A new version is available." else "发现新版本，可以更新。")
                    }
                }
            },
            confirmButton = {
                val downloadUrl = updateInfo?.optString("downloadUrl").orEmpty()
                val hasUpdate = !downloadUrl.isNullOrBlank() && downloadUrl != "null" && updateInfo?.optString("latestVersion") != currentVersion
                TextButton(onClick = {
                    if (hasUpdate) runCatching {
                        val uri = android.net.Uri.parse(downloadUrl)
                        require(uri.scheme == "https")
                        context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri))
                    }.onFailure { updateError = it.message ?: "无法打开下载地址" }
                    else dialog = ""
                }) { Text(if (hasUpdate) { if (en) "Download update" else "下载更新" } else { if (en) "OK" else "知道了" }) }
            },
            dismissButton = {
                TextButton(onClick = {
                    updateLoading = true
                    updateError = null
                    scope.launch {
                        runCatching { withContext(Dispatchers.IO) { AuthRepository.publicAppUpdate() } }
                            .onSuccess { updateInfo = it }
                            .onFailure { updateError = it.message ?: "检查更新失败" }
                        updateLoading = false
                    }
                }) { Text(if (en) "Check again" else "重新检查") }
            }
        )
    } else if (dialog == "support") AlertDialog(
        onDismissRequest = { dialog = "" },
        title = { Text(title) },
        text = { Text(if (supportUrl.isNullOrBlank()) { if (en) "Customer support has not been configured yet." else "客服联系方式尚未配置，请联系平台管理员。" } else { if (en) "Open the platform customer support page?" else "即将打开平台客服页面。" }) },
        confirmButton = { TextButton(onClick = {
            val url = supportUrl
            if (!url.isNullOrBlank()) runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
            dialog = ""
        }) { Text(if (supportUrl.isNullOrBlank()) { if (en) "OK" else "知道了" } else { if (en) "Open support" else "打开客服" }) } },
        dismissButton = { if (!supportUrl.isNullOrBlank()) TextButton(onClick = { dialog = "" }) { Text(if (en) "Cancel" else "取消") } }
    ) else if (dialog.isNotEmpty()) AlertDialog(onDismissRequest = { dialog = "" }, title = { Text(title) }, text = { Text(when (dialog) { "security" -> if (en) "Account security settings will be available in a later release." else "账号安全设置功能将在后续版本接入。"; "tutorial" -> if (en) "Follow task instructions and submit valid evidence." else "请按照任务说明完成操作，并提交真实有效的任务凭证供平台审核。"; else -> "" }) }, confirmButton = { TextButton(onClick = { dialog = "" }) { Text(if (en) "OK" else "知道了") } })
}

@Composable
private fun AccountSecurityScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit, onPassword: () -> Unit, onLanguage: () -> Unit) {
    val en = language == "en"
    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6))) {
        SubPageHeader(if (en) "Account security" else "账号与安全", onBack, language)
        Card(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp)) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                ProfileMenuRow(Icons.Default.Lock, if (en) "Change password" else "修改密码", if (en) "Change your password regularly to protect account security" else "定期修改密码保护账号安全", onPassword)
                ProfileMenuRow(Icons.Default.Language, if (en) "Language settings" else "语言设置", if (en) "Language" else "语言", onLanguage, showDivider = false)
            }
        }
    }
}

@Composable
private fun ChangePasswordScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit) {
    val en = language == "en"
    var current by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var showCurrent by remember { mutableStateOf(false) }
    var showNew by remember { mutableStateOf(false) }
    var showConfirm by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    var submitting by remember { mutableStateOf(false) }
    var success by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val valid = current.isNotBlank() && newPassword.length >= 6 && newPassword.length <= 128 && newPassword == confirm && !submitting
    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6))) {
        SubPageHeader(if (en) "Change password" else "修改密码", onBack, language)
        Card(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp)) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                Text(if (en) "Change password" else "修改密码", color = Color(0xFF17243A), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                @Composable fun passwordField(value: String, label: String, visible: Boolean, onVisible: () -> Unit, onValue: (String) -> Unit) {
                    OutlinedTextField(value = value, onValueChange = onValue, modifier = Modifier.fillMaxWidth(), placeholder = { Text(label, color = Color(0xFF667085)) }, singleLine = true, shape = RoundedCornerShape(5.dp), visualTransformation = if (visible) androidx.compose.ui.text.input.VisualTransformation.None else androidx.compose.ui.text.input.PasswordVisualTransformation(), trailingIcon = { IconButton(onClick = onVisible) { Icon(if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility, if (en) "Show password" else "显示密码", tint = Color(0xFF667085)) } }, colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = Color(0xFFD8E5EC), focusedBorderColor = Color(0xFF5AAED0)))
                }
                passwordField(current, if (en) "Current password" else "当前密码", showCurrent, { showCurrent = !showCurrent }) { current = it; message = "" }
                passwordField(newPassword, if (en) "New password" else "新密码", showNew, { showNew = !showNew }) { newPassword = it; message = "" }
                passwordField(confirm, if (en) "Confirm new password" else "确认新密码", showConfirm, { showConfirm = !showConfirm }) { confirm = it; message = "" }
                Button(onClick = {
                    if (newPassword.length < 6 || newPassword.length > 128) {
                        message = if (en) "Password must be 6–128 characters" else "新密码长度必须为6至128位"
                    } else if (newPassword != confirm) {
                        message = if (en) "Passwords do not match" else "两次输入的新密码不一致"
                    } else {
                        scope.launch {
                            submitting = true
                            message = ""
                            try {
                                withContext(Dispatchers.IO) { AuthRepository.changePassword(current, newPassword) }
                                success = true
                                message = if (en) "Password changed successfully. Other devices have been signed out." else "密码修改成功，其他设备的登录会话已失效。"
                                current = ""; newPassword = ""; confirm = ""
                            } catch (error: Exception) {
                                message = error.message ?: if (en) "Could not change password. Please try again." else "密码修改失败，请稍后重试。"
                            } finally {
                                submitting = false
                            }
                        }
                    }
                }, enabled = valid && !success, modifier = Modifier.fillMaxWidth().height(46.dp), shape = RoundedCornerShape(28.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF319CCB), disabledContainerColor = Color(0xFFE6ECF1), disabledContentColor = Color(0xFF98A2B3))) {
                    Text(if (submitting) { if (en) "Submitting…" else "正在提交…" } else if (success) { if (en) "Changed" else "已修改" } else { if (en) "Confirm change" else "确认修改" }, fontWeight = FontWeight.SemiBold)
                }
                if (message.isNotBlank()) Text(message, color = if (success) Color(0xFF16834A) else Color(0xFFD04444), style = MaterialTheme.typography.bodySmall)
                Text(if (en) "Other devices will be signed out after the password is changed. This device stays signed in." else "修改成功后，其他设备的登录会话将失效，当前设备保持登录。", color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun LanguageSettingsScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit, onLanguageChanged: (String) -> Unit) {
    val en = language == "en"
    var selected by remember(language) { mutableStateOf(language) }
    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6))) {
        SubPageHeader(if (en) "Language settings" else "语言设置", onBack, language)
        Text(if (en) "Language settings" else "语言设置", modifier = Modifier.padding(start = 18.dp, top = 18.dp, bottom = 12.dp), color = Color(0xFF123E56), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
        Card(Modifier.fillMaxWidth().padding(horizontal = 4.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(10.dp)) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 8.dp)) {
                listOf("system" to if (en) "Follow system" else "跟随系统", "zh-CN" to "简体中文", "en" to "English").forEach { (value, label) ->
                    Row(Modifier.fillMaxWidth().clickable { selected = value; onLanguageChanged(value) }.padding(vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = selected == value, onClick = { selected = value; onLanguageChanged(value) }, colors = RadioButtonDefaults.colors(selectedColor = Color(0xFF319CCB), unselectedColor = Color(0xFF667085)))
                        Spacer(Modifier.width(8.dp))
                        Text(label, color = Color(0xFF123E56), style = MaterialTheme.typography.titleMedium)
                    }
                }
            }
        }
    }
}

@Composable
private fun PermissionStatusScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val en = language == "en"
    val overlay = Settings.canDrawOverlays(context)
    val captureAvailable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP
    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6))) {
        SubPageHeader(if (en) "Permission status" else "权限状态", onBack, language)
        Card(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(10.dp)) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PermissionLine(if (en) "Floating window permission" else "悬浮窗权限", if (overlay) { if (en) "Enabled" else "已开启" } else { if (en) "Not enabled" else "未开启" }, overlay)
                PermissionLine(if (en) "Screen capture session" else "屏幕截图会话", if (en) "Granted when starting a task" else "开始任务时授权", null)
                PermissionLine(if (en) "Task claiming" else "任务领取", if (en) "Available" else "可用", true)
                PermissionLine(if (en) "Screenshot submission" else "截图提交能力", if (captureAvailable) { if (en) "Can submit screenshots" else "可提交截图" } else { if (en) "Unavailable" else "不可用" }, captureAvailable)
                PermissionLine(if (en) "Withdrawal application" else "提现申请", if (en) "Restricted" else "受限", false)
                Spacer(Modifier.height(2.dp))
                Text(if (en) "Screen capture permission is not permanent. It can be reused during the same task session; after the session ends, authorization is required again." else "屏幕截图不是长期权限，同一任务截图会话内可复用授权；会话停止后需要重新授权", color = Color(0xFF667085), style = MaterialTheme.typography.bodyMedium)
                if (!overlay) {
                    Button(onClick = { context.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + context.packageName))) }, modifier = Modifier.fillMaxWidth()) { Text(if (en) "Enable floating window permission" else "开启悬浮窗权限") }
                }
            }
        }
    }
}

@Composable
private fun SubPageHeader(title: String, onBack: () -> Unit, language: String) {
    Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF123E56)) }
        Spacer(Modifier.weight(1f))
        Text(title, color = Color(0xFF123E56), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.weight(1f))
        Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF667085), modifier = Modifier.padding(horizontal = 8.dp))
        Icon(Icons.Default.Language, null, tint = Color(0xFF667085), modifier = Modifier.padding(horizontal = 8.dp))
    }
}

@Composable
private fun PermissionLine(label: String, value: String, enabled: Boolean?) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(label, color = Color(0xFF667085), style = MaterialTheme.typography.bodyLarge)
        Text(value, color = if (enabled == false) Color(0xFFB36B32) else Color(0xFF123E56), fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleSmall)
    }
}

@Composable
private fun ProfileAsset(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String, tint: Color, modifier: Modifier = Modifier, onClick: () -> Unit = {}) {
    Column(modifier.clickable(onClick = onClick).padding(horizontal = 3.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Surface(color = Color(0xFFF2F7FB), shape = RoundedCornerShape(50)) { Icon(icon, null, tint = tint, modifier = Modifier.padding(10.dp).size(22.dp)) }
        Text(label, color = Color(0xFF667085), style = MaterialTheme.typography.labelSmall, maxLines = 1)
        Text(value, color = Color(0xFF17243A), fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun ProfileMenuRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, onClick: () -> Unit, status: Boolean? = null, showDivider: Boolean = true) {
    Column {
        Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(color = Color(0xFFF2F7FB), shape = RoundedCornerShape(10.dp)) { Icon(icon, null, tint = Color(0xFF319CCB), modifier = Modifier.padding(10.dp).size(22.dp)) }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) { Text(title, color = Color(0xFF17243A), fontWeight = FontWeight.SemiBold); Text(subtitle, color = if (status == true) Color(0xFF319CCB) else Color(0xFF718096), style = MaterialTheme.typography.bodySmall) }
            Icon(Icons.Default.ChevronRight, null, tint = Color(0xFF667085))
        }
        if (showDivider) HorizontalDivider(color = Color(0xFFD8E5EC))
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
private fun formatMinorByCurrency(minor: String, currency: String): String {
    val code = currency.trim().ifBlank { "USD" }
    val digits = runCatching { java.util.Currency.getInstance(code).defaultFractionDigits }.getOrDefault(2).coerceAtLeast(0)
    val value = runCatching {
        java.math.BigDecimal(minor).movePointLeft(digits).setScale(digits, java.math.RoundingMode.DOWN).toPlainString()
    }.getOrDefault("0")
    return "$value $code"
}
private fun formatCurrencyTotals(values: JSONObject?): String {
    if (values == null || values.length() == 0) return formatMinorByCurrency("0", "USD")
    return values.keys().asSequence().sorted().map { currency ->
        formatMinorByCurrency(values.optString(currency, "0"), currency)
    }.joinToString(" / ")
}
private fun formatAvailableBalances(values: JSONArray?): String {
    if (values == null || values.length() == 0) return formatMinorByCurrency("0", "USD")
    return (0 until values.length()).mapNotNull { index ->
        values.optJSONObject(index)?.let { balance ->
            formatMinorByCurrency(balance.optString("amountMinor", "0"), balance.optString("currency", "USD"))
        }
    }.joinToString(" / ").ifBlank { formatMinorByCurrency("0", "USD") }
}
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
private fun WalletScreen(
    modifier: Modifier = Modifier, language: String, onApplyWithdraw: () -> Unit,
    onPayoutAccounts: () -> Unit, onWithdrawalHistory: () -> Unit, onWithdrawalGuide: () -> Unit,
    onInviteFriends: () -> Unit, onWalletDetails: () -> Unit, onLanguageChanged: (String) -> Unit
) {
    val en = language == "en"
    var overview by remember { mutableStateOf<JSONObject?>(null) }
    var recent by remember { mutableStateOf<JSONObject?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var balanceVisible by rememberSaveable { mutableStateOf(true) }
    var languageMenuOpen by remember { mutableStateOf(false) }
    var supportDialogOpen by remember { mutableStateOf(false) }
    var supportUrl by remember { mutableStateOf<String?>(null) }
    var refresh by remember { mutableIntStateOf(0) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(refresh) {
        loading = true; error = null
        val result = withContext(Dispatchers.IO) {
            Pair(runCatching { AuthRepository.walletOverview() }, runCatching { AuthRepository.walletTransactions(5) })
        }
        result.first.onSuccess { overview = it }.onFailure { error = it.message }
        result.second.onSuccess { recent = it }.onFailure { if (error == null) error = it.message }
        supportUrl = withContext(Dispatchers.IO) { runCatching { AuthRepository.publicAppSupport().optString("supportUrl").takeIf { it.startsWith("https://") } }.getOrNull() }
        loading = false
    }
    val totals = overview?.optJSONArray("totals")
    fun total(key: String): String {
        val values = JSONObject()
        for (i in 0 until (totals?.length() ?: 0)) {
            val row = totals?.optJSONObject(i) ?: continue
            values.put(row.optString("currency"), row.optString(key, "0"))
        }
        return if (overview == null) "—" else formatCurrencyTotals(values)
    }
    val available = total("availableMinor")
    val pending = total("pendingWithdrawalMinor")
    val processing = total("processingWithdrawalMinor")
    val frozen = total("frozenMinor")
    val income = total("incomeMinor")
    val recentItems = recent?.optJSONArray("items")
    fun transactionTitle(item: JSONObject): String = when (item.optString("sourceType")) {
        "TASK_REWARD" -> if (en) "Task reward" else "任务奖励"
        "REFERRAL_COMMISSION", "REFERRAL_REWARD" -> if (en) "Referral commission" else "邀请佣金"
        "WITHDRAWAL" -> if (en) "Withdrawal" else "提现"
        else -> if (item.optString("direction") == "CREDIT") { if (en) "Income" else "收入" } else { if (en) "Expense" else "支出" }
    }
    Column(modifier.fillMaxSize().background(Color(0xFFF2F7FB)).verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Surface(color = Color.White, shape = RoundedCornerShape(24.dp)) {
                Text((if (en) "Available  " else "可提现  ") + if (balanceVisible) available else "••••••", Modifier.padding(horizontal = 12.dp, vertical = 8.dp), color = Color(0xFF319CCB), fontWeight = FontWeight.Bold)
            }
            Text(if (en) "Wallet" else "钱包", color = Color(0xFF123E56), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { supportDialogOpen = true }) { Icon(Icons.Default.HeadsetMic, contentDescription = if (en) "Support" else "客服", tint = Color(0xFF667085)) }
                Box {
                    IconButton(onClick = { languageMenuOpen = true }) { Icon(Icons.Default.Language, contentDescription = if (en) "Language" else "语言", tint = Color(0xFF667085)) }
                    DropdownMenu(expanded = languageMenuOpen, onDismissRequest = { languageMenuOpen = false }) {
                        DropdownMenuItem(text = { Text("简体中文") }, onClick = { languageMenuOpen = false; scope.launch { runCatching { withContext(Dispatchers.IO) { AuthRepository.updateLocale("zh-CN") } }; onLanguageChanged("zh-CN") } })
                        DropdownMenuItem(text = { Text("English") }, onClick = { languageMenuOpen = false; scope.launch { runCatching { withContext(Dispatchers.IO) { AuthRepository.updateLocale("en") } }; onLanguageChanged("en") } })
                    }
                }
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFDDF3FF)), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(if (en) "Available balance" else "可提现余额", color = Color(0xFF123E56), style = MaterialTheme.typography.labelLarge)
                        IconButton(onClick = { balanceVisible = !balanceVisible }, modifier = Modifier.size(28.dp)) {
                            Icon(if (balanceVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff, null, tint = Color(0xFF258BB8), modifier = Modifier.size(18.dp))
                        }
                    }
                    Button(onClick = onApplyWithdraw, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF319CCB), contentColor = Color.White)) { Text(if (en) "Withdraw" else "申请提现") }
                }
                Text(if (balanceVisible) available else "••••••", color = Color(0xFF123E56), fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.headlineLarge)
                Row(Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(14.dp)).padding(vertical = 12.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    WalletMiniMetric(Modifier.weight(1f), if (en) "Pending" else "待处理提现", pending, Color(0xFF319CCB))
                    Box(Modifier.width(1.dp).height(34.dp).background(Color(0xFFD8E5EC)))
                    WalletMiniMetric(Modifier.weight(1f), if (en) "Frozen" else "风险冻结", frozen, Color(0xFF319CCB))
                    Box(Modifier.width(1.dp).height(34.dp).background(Color(0xFFD8E5EC)))
                    WalletMiniMetric(Modifier.weight(1f), if (en) "Processing" else "提现处理中", processing, Color(0xFF319CCB))
                }
                Text((if (en) "Lifetime income: " else "累计收入：") + income, color = Color(0xFF45677A), style = MaterialTheme.typography.bodySmall)
                if (error != null) TextButton(onClick = { refresh++ }) { Text((if (en) "Load failed, tap to retry: " else "加载失败，点击重试：") + error.orEmpty(), color = Color(0xFF258BB8)) }
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(if (en) "Fund breakdown" else "资金分类统计", fontWeight = FontWeight.Bold, color = Color(0xFF123E56), style = MaterialTheme.typography.titleMedium)
                val categoryRows = overview?.optJSONArray("categories")
                var shown = 0
                for (i in 0 until (categoryRows?.length() ?: 0)) {
                    val walletCategory = categoryRows?.optJSONObject(i) ?: continue
                    val entries = walletCategory.optJSONArray("items") ?: continue
                    for (j in 0 until entries.length()) {
                        val item = entries.optJSONObject(j) ?: continue
                        val source = item.optString("sourceType")
                        val title = when (source) {
                            "TASK_REWARD" -> if (en) "Task rewards" else "任务奖励"
                            "REFERRAL_COMMISSION", "REFERRAL_REWARD" -> if (en) "Referral commissions" else "邀请佣金"
                            else -> if (item.optString("direction") == "CREDIT") { if (en) "Other income" else "其他收入" } else { if (en) "Other expenses" else "其他支出" }
                        }
                        Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(title, Modifier.weight(1f), color = Color(0xFF45677A))
                            Text(formatCurrencyTotals(JSONObject().put(walletCategory.optString("currency"), item.optString("amountMinor"))), color = Color(0xFF258BB8), fontWeight = FontWeight.SemiBold)
                        }
                        shown++
                    }
                }
                if (shown == 0) Text(if (en) "No posted ledger entries yet" else "暂无已入账分类数据", color = Color(0xFF81919C), style = MaterialTheme.typography.bodySmall)
                Text(if (en) "Frozen balance is not configured for this wallet yet." else "冻结金额已从可提现余额中扣除；如有疑问请联系平台客服。", color = Color(0xFF81919C), style = MaterialTheme.typography.bodySmall)
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(if (en) "Wallet details" else "钱包明细", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = Color(0xFF123E56))
                    Text(if (en) "All details  ›" else "全部明细  ›", color = Color(0xFF319CCB), modifier = Modifier.clickable(onClick = onWalletDetails))
                }
                if (loading) Box(Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Color(0xFF319CCB)) }
                else if ((recentItems?.length() ?: 0) == 0) {
                    Column(Modifier.fillMaxWidth().height(110.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Icon(Icons.Default.AccountBalanceWallet, null, tint = Color(0xFF91A4B1), modifier = Modifier.size(30.dp))
                        Text(if (en) "No wallet transactions" else "暂无钱包流水", color = Color(0xFF667085), fontWeight = FontWeight.Medium)
                    }
                } else {
                    for (i in 0 until minOf(recentItems?.length() ?: 0, 5)) {
                        val item = recentItems?.optJSONObject(i) ?: continue
                        val credit = item.optString("direction") == "CREDIT"
                        Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                            Surface(color = Color(0xFFDDF3FF), shape = RoundedCornerShape(50)) {
                                Icon(if (credit) Icons.Default.TrendingUp else Icons.Default.TrendingDown, null, tint = Color(0xFF319CCB), modifier = Modifier.padding(9.dp))
                            }
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(transactionTitle(item), color = Color(0xFF243B4A), fontWeight = FontWeight.SemiBold)
                                Text(item.optString("createdAt").replace("T", " ").take(16), color = Color(0xFF81919C), style = MaterialTheme.typography.bodySmall)
                            }
                            Text((if (credit) "+" else "−") + formatCurrencyTotals(JSONObject().put(item.optString("currency"), item.optString("amountMinor"))), color = Color(0xFF258BB8), fontWeight = FontWeight.Bold)
                        }
                        if (i < minOf((recentItems?.length() ?: 0) - 1, 4)) HorizontalDivider(color = Color(0xFFEAF1F5))
                    }
                }
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (en) "Withdrawal services" else "提现服务", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = Color(0xFF123E56))
                WalletServiceRow(Icons.Default.CreditCard, if (en) "Payout account" else "收款账户", if (en) "Manage payout accounts" else "管理收款账户", Color(0xFFDDF3FF), Color(0xFF319CCB), onClick = onPayoutAccounts)
                HorizontalDivider(color = Color(0xFFE5EFF5))
                WalletServiceRow(Icons.Default.ReceiptLong, if (en) "Withdrawal history" else "提现记录", if (en) "View withdrawal history" else "查看您的提现历史", Color(0xFFDDF3FF), Color(0xFF319CCB), onClick = onWithdrawalHistory)
                HorizontalDivider(color = Color(0xFFE5EFF5))
                WalletServiceRow(Icons.Default.Schedule, if (en) "Withdrawal guide" else "提现说明", if (en) "Rules and instructions" else "了解提现规则与说明", Color(0xFFDDF3FF), Color(0xFF319CCB), onClick = onWithdrawalGuide)
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFEAF6FC)), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().clickable(onClick = onInviteFriends).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Groups, null, tint = Color(0xFF319CCB))
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(if (en) "Invite friends to earn" else "邀请好友做任务", fontWeight = FontWeight.Bold, color = Color(0xFF123E56))
                    Text(if (en) "Earn extra rewards when friends complete tasks" else "好友完成任务，您可获得额外奖励", color = Color(0xFF718096), style = MaterialTheme.typography.bodySmall)
                }
                Icon(Icons.Default.ChevronRight, null, tint = Color(0xFF319CCB))
            }
        }
    }
    if (supportDialogOpen) AlertDialog(
        onDismissRequest = { supportDialogOpen = false },
        title = { Text(if (en) "Customer support" else "联系客服") },
        text = { Text(if (supportUrl.isNullOrBlank()) { if (en) "Customer support has not been configured." else "客服联系方式尚未配置，请联系平台管理员。" } else { if (en) "Open the platform customer support page?" else "即将打开平台客服页面。" }) },
        confirmButton = { TextButton(onClick = {
            val url = supportUrl
            if (!url.isNullOrBlank()) runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
            supportDialogOpen = false
        }) { Text(if (supportUrl.isNullOrBlank()) { if (en) "OK" else "知道了" } else { if (en) "Open support" else "打开客服" }) } },
        dismissButton = { if (!supportUrl.isNullOrBlank()) TextButton(onClick = { supportDialogOpen = false }) { Text(if (en) "Cancel" else "取消") } }
    )
}

@Composable
private fun WalletDetailsScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit) {
    val en = language == "en"
    var selected by rememberSaveable { mutableIntStateOf(0) }
    var data by remember { mutableStateOf<JSONObject?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var refresh by remember { mutableIntStateOf(0) }
    LaunchedEffect(refresh) {
        loading = true
        error = null
        runCatching { withContext(Dispatchers.IO) { AuthRepository.walletTransactions() } }
            .onSuccess { data = it }
            .onFailure { error = it.message ?: if (en) "Unable to load wallet transactions" else "钱包流水加载失败" }
        loading = false
    }
    val items = data?.optJSONArray("items")
    val filtered = (0 until (items?.length() ?: 0)).mapNotNull { items?.optJSONObject(it) }.filter { item ->
        when (selected) {
            1 -> item.optString("type") == "INCOME"
            2 -> item.optString("type") == "EXPENSE"
            3 -> item.optString("type") == "WITHDRAWAL"
            else -> true
        }
    }
    fun label(item: JSONObject): String {
        return when (item.optString("sourceType")) {
            "TASK_REWARD" -> if (en) "Task reward" else "任务奖励"
            "REFERRAL_REWARD" -> if (en) "Referral commission" else "邀请佣金"
            "WITHDRAWAL" -> if (en) "Withdrawal" else "提现"
            else -> if (item.optString("direction") == "CREDIT") { if (en) "Income" else "收入" } else { if (en) "Expense" else "支出" }
        }
    }
    fun status(value: String): String = when (value) {
        "POSTED" -> if (en) "Completed" else "已入账"
        "REQUESTED" -> if (en) "Pending" else "待处理"
        "UNDER_REVIEW" -> if (en) "Under review" else "审核中"
        "APPROVED" -> if (en) "Approved" else "已批准"
        "PROCESSING" -> if (en) "Processing" else "处理中"
        "PAID" -> if (en) "Paid" else "已支付"
        "REJECTED" -> if (en) "Rejected" else "已拒绝"
        "FAILED" -> if (en) "Failed" else "失败"
        "CANCELLED" -> if (en) "Cancelled" else "已取消"
        else -> value
    }
    Column(modifier.fillMaxSize().background(Color(0xFFF2F7FB))) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF123E56)) }
            Spacer(Modifier.weight(1f))
            Text(if (en) "Wallet details" else "钱包明细", fontWeight = FontWeight.Bold, color = Color(0xFF123E56))
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF667085))
            Spacer(Modifier.width(12.dp))
            Icon(Icons.Default.Language, null, tint = Color(0xFF667085))
            Spacer(Modifier.width(8.dp))
        }
        Row(Modifier.fillMaxWidth().background(Color.White)) {
            listOf(if (en) "All" else "全部", if (en) "Income" else "收入", if (en) "Expense" else "支出", if (en) "Withdrawals" else "提现").forEachIndexed { index, title ->
                Column(Modifier.weight(1f).clickable { selected = index }.padding(top = 13.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(title, color = if (selected == index) Color(0xFF319CCB) else Color(0xFF667085), fontWeight = if (selected == index) FontWeight.Bold else FontWeight.Medium, style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(10.dp))
                    Box(Modifier.fillMaxWidth().height(3.dp).background(if (selected == index) Color(0xFF319CCB) else Color.Transparent))
                }
            }
        }
        if (loading) {
            Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Color(0xFF319CCB)) }
        } else if (error != null) {
            TextButton(onClick = { refresh++ }, modifier = Modifier.fillMaxWidth().padding(12.dp).background(Color(0xFFEAF6FC), RoundedCornerShape(10.dp))) {
                Text((if (en) "Load failed, tap to retry: " else "加载失败，点击重试：") + error.orEmpty(), color = Color(0xFF258BB8))
            }
        } else if (filtered.isEmpty()) {
            Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.fillMaxWidth().padding(vertical = 42.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Icon(Icons.Default.AccountBalanceWallet, null, tint = Color(0xFF667085), modifier = Modifier.size(36.dp))
                    Text(if (en) "No wallet transactions" else "暂无钱包流水", color = Color(0xFF17243A), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Text(if (en) "Task rewards, commissions and wallet changes will appear here." else "任务奖励、邀请佣金及钱包资金变动会显示在这里。", color = Color(0xFF667085), style = MaterialTheme.typography.bodyMedium)
                }
            }
        } else {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                filtered.forEach { item ->
                    val income = item.optString("direction") == "CREDIT"
                    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp)) {
                        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Surface(color = Color(0xFFDDF3FF), shape = RoundedCornerShape(50)) {
                                Icon(if (income) Icons.Default.TrendingUp else Icons.Default.TrendingDown, null, tint = Color(0xFF319CCB), modifier = Modifier.padding(10.dp))
                            }
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(label(item), color = Color(0xFF17243A), fontWeight = FontWeight.Bold)
                                Text(item.optString("createdAt").replace("T", " ").take(16), color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall)
                                Text(status(item.optString("status")), color = Color(0xFF319CCB), style = MaterialTheme.typography.labelSmall)
                            }
                            Text((if (income) "+" else "−") + formatCurrencyTotals(JSONObject().put(item.optString("currency"), item.optString("amountMinor"))), color = Color(0xFF258BB8), fontWeight = FontWeight.Bold)
                        }
                    }
                }
                if (data?.optBoolean("hasMore") == true) Text(if (en) "Showing the latest records" else "当前展示最近流水记录", color = Color(0xFF667085), modifier = Modifier.padding(8.dp))
            }
        }
    }
}

@Composable
private fun WithdrawalHistoryScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit) {
    val isEnglish = language == "en"
    val uriHandler = LocalUriHandler.current
    var items by remember { mutableStateOf<JSONArray?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        loading = true
        runCatching { withContext(Dispatchers.IO) { AuthRepository.withdrawalHistory() } }
            .onSuccess { response -> items = response.optJSONArray("items") ?: JSONArray() }
            .onFailure { error = it.message ?: if (isEnglish) "Unable to load records" else "加载提现记录失败" }
        loading = false
    }

    fun statusLabel(status: String): String = when (status) {
        "REQUESTED" -> if (isEnglish) "Requested" else "待处理"
        "UNDER_REVIEW" -> if (isEnglish) "Under review" else "审核中"
        "APPROVED" -> if (isEnglish) "Approved" else "已批准"
        "PROCESSING" -> if (isEnglish) "Processing" else "处理中"
        "PAID" -> if (isEnglish) "Paid" else "已支付"
        "REJECTED" -> if (isEnglish) "Rejected" else "已拒绝"
        "FAILED" -> if (isEnglish) "Failed" else "失败"
        "CANCELLED" -> if (isEnglish) "Cancelled" else "已取消"
        else -> status
    }

    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6))) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF123E56)) }
            Spacer(Modifier.weight(1f))
            Text(if (isEnglish) "Withdrawal history" else "提现记录", fontWeight = FontWeight.Bold, color = Color(0xFF123E56))
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF667085))
        }
        when {
            loading -> Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            error != null -> Text(error.orEmpty(), Modifier.padding(20.dp), color = Color(0xFFB42318))
            items == null || items!!.length() == 0 -> Card(
                Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(Modifier.fillMaxWidth().height(120.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Text(if (isEnglish) "No withdrawal records" else "暂无提现记录", color = Color(0xFF455B52), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    Text(if (isEnglish) "Your withdrawal requests will appear here" else "提交提现申请后，可在这里查看处理进度", color = Color(0xFF789087), style = MaterialTheme.typography.bodyMedium)
                }
            }
            else -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                val data = items!!
                for (index in 0 until data.length()) {
                    val item = data.optJSONObject(index) ?: continue
                    val currency = item.optString("currency", "")
                    val amount = formatMinorByCurrency(item.optString("amountMinor", "0"), currency)
                    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(12.dp)) {
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Text(amount, color = Color(0xFF123E56), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                                Text(statusLabel(item.optString("status")), color = Color(0xFF319CCB), fontWeight = FontWeight.SemiBold)
                            }
                            val hasActualPayout = !item.isNull("actualPayoutAmountMinor")
                            val payoutCurrency = if (hasActualPayout) item.optString("actualPayoutCurrency", item.optString("payoutCurrency", currency)) else item.optString("payoutCurrency", currency)
                            val payoutMinor = if (hasActualPayout) item.optString("actualPayoutAmountMinor") else item.optString("payoutAmountMinor", item.optString("amountMinor", "0"))
                            val payoutAmount = formatMinorByCurrency(payoutMinor, payoutCurrency)
                            Text((if (hasActualPayout) { if (isEnglish) "Actual paid: " else "实际到账：" } else { if (isEnglish) "Estimated payout: " else "预计到账：" }) + payoutAmount, color = Color(0xFF123E56), fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                            if (item.optString("exchangeRate").isNotBlank()) {
                                Text((if (isEnglish) "Rate: " else "汇率：") + item.optString("exchangeRate") + " · " + item.optString("exchangeRateSource") + " · data " + item.optString("exchangeRateEffectiveAt", "—") + " · " + item.optString("exchangeRateProviderUpdatedAt", "—") + " · " + item.optString("exchangeRateFetchedAt"), color = Color(0xFF789087), style = MaterialTheme.typography.labelSmall)
                                if (item.optString("exchangeRateSource").startsWith("exchangerate.dev")) {
                                    Text("Rates by exchangerate.dev", color = Color(0xFF319CCB), style = MaterialTheme.typography.labelSmall, modifier = Modifier.clickable { uriHandler.openUri("https://exchangerate.dev") })
                                }
                            }
                            Text(if (isEnglish) "Wallet debit: " + amount else "钱包扣款：" + amount, color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall)
                            Text(if (isEnglish) "Request ID: " + item.optString("id") else "申请编号：" + item.optString("id"), color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall)
                            Text(item.optString("createdAt"), color = Color(0xFF98A2B3), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WithdrawalGuideScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit) {
    val isEnglish = language == "en"
    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6))) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF123E56)) }
            Spacer(Modifier.weight(1f))
            Text(if (isEnglish) "Withdrawal guide" else "提现说明", fontWeight = FontWeight.Bold, color = Color(0xFF123E56))
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF667085))
        }
        Card(Modifier.fillMaxWidth().padding(18.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(12.dp)) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(if (isEnglish) "Withdrawal instructions" else "提现说明", color = Color(0xFF123E56), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                Text(
                    if (isEnglish) "1. Add and verify your payout account before requesting a withdrawal.\n\n2. Make sure the payout account details are accurate and belong to you.\n\n3. After submitting a request, check Withdrawal history for its progress.\n\n4. Available balance and withdrawal eligibility are subject to platform review."
                    else "1. 申请提现前，请先添加并确认收款账户。\n\n2. 请确保收款账户信息准确，并且属于本人。\n\n3. 提交提现申请后，可在「提现记录」中查看处理进度。\n\n4. 实际可提现金额及提现资格以平台审核结果为准。",
                    color = Color(0xFF667085),
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }
    }
}

@Composable
private fun PayoutAccountsScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit, onAdd: () -> Unit) {
    val isEnglish = language == "en"
    var items by remember { mutableStateOf<JSONArray?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var accountToDelete by remember { mutableStateOf<Pair<String, String>?>(null) }
    var deleting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun reload() {
        loading = true
        runCatching { withContext(Dispatchers.IO) { AuthRepository.payoutAccounts() } }
            .onSuccess { items = it.optJSONArray("items") ?: JSONArray(); error = null }
            .onFailure { error = it.message ?: if (isEnglish) "Unable to load accounts" else "加载收款账户失败" }
        loading = false
    }
    LaunchedEffect(Unit) { reload() }

    fun confirmDelete() {
        val target = accountToDelete ?: return
        if (deleting) return
        scope.launch {
            deleting = true
            error = null
            runCatching {
                withContext(Dispatchers.IO) { AuthRepository.deletePayoutAccount(target.first) }
            }.onSuccess {
                accountToDelete = null
                reload()
            }.onFailure {
                error = it.message ?: if (isEnglish) "Unable to delete account" else "删除收款账户失败"
            }
            deleting = false
        }
    }


    if (accountToDelete != null) {
        AlertDialog(
            onDismissRequest = { if (!deleting) accountToDelete = null },
            title = { Text(if (isEnglish) "Delete payout account?" else "确认删除收款账户？") },
            text = {
                Text(
                    (if (isEnglish) "Are you sure you want to delete this payout account?\n" else "确定要删除以下收款账户吗？\n") +
                        accountToDelete!!.second +
                        (if (isEnglish) "\nThis action cannot be undone." else "\n删除后该账户将从列表中移除。")
                )
            },
            confirmButton = {
                TextButton(onClick = { confirmDelete() }, enabled = !deleting) {
                    if (deleting) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Text(if (isEnglish) "Delete" else "确认删除", color = Color(0xFFB42318))
                }
            },
            dismissButton = {
                TextButton(onClick = { accountToDelete = null }, enabled = !deleting) {
                    Text(if (isEnglish) "Cancel" else "取消")
                }
            }
        )
    }

    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6))) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF123E56)) }
            Spacer(Modifier.weight(1f))
            Text(if (isEnglish) "Payout accounts" else "收款账户", fontWeight = FontWeight.Bold, color = Color(0xFF123E56))
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF667085))
        }
        Column(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Button(onClick = onAdd, modifier = Modifier.fillMaxWidth().height(56.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF319CCB))) {
                Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp)); Text(if (isEnglish) "Add account" else "新增账户", fontWeight = FontWeight.Bold)
            }
            if (loading) {
                Box(Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else if (error != null) {
                Text(error.orEmpty(), color = Color(0xFFB42318))
                TextButton(onClick = { scope.launch { reload() } }) { Text(if (isEnglish) "Retry" else "重试") }
            } else if (items == null || items!!.length() == 0) {
                Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.fillMaxWidth().height(124.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Text(if (isEnglish) "No payout accounts" else "暂无收款账户", color = Color(0xFF455B52), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(8.dp))
                        Text(if (isEnglish) "Add a payout account to request withdrawals" else "添加收款账户后即可申请提现", color = Color(0xFF789087))
                    }
                }
            } else {
                val data = items!!
                for (index in 0 until data.length()) {
                    val item = data.optJSONObject(index) ?: continue
                    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(12.dp)) {
                        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.AccountBalanceWallet, null, tint = Color(0xFF319CCB), modifier = Modifier.size(30.dp))
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(item.optString("methodCode").replaceFirstChar { it.uppercase() }, color = Color(0xFF123E56), fontWeight = FontWeight.Bold)
                                Text(item.optString("accountHolder") + " · " + item.optString("maskedAccount"), color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall)
                                Text(item.optString("countryCode") + " · " + item.optString("currency") + if (item.optBoolean("isDefault")) (if (isEnglish) " · Default" else " · 默认") else "", color = Color(0xFF98A2B3), style = MaterialTheme.typography.labelSmall)
                            }
                            IconButton(
                                onClick = {
                                    val id = item.optString("id")
                                    val label = item.optString("methodCode").replaceFirstChar { it.uppercase() } +
                                        " · " + item.optString("maskedAccount")
                                    if (id.isNotBlank()) accountToDelete = id to label
                                },
                                enabled = !deleting
                            ) { Icon(Icons.Default.DeleteOutline, if (isEnglish) "Delete" else "删除", tint = Color(0xFFB42318)) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ApplyWithdrawalScreen(
    modifier: Modifier = Modifier,
    language: String,
    onBack: () -> Unit,
    onAddAccount: () -> Unit,
    onSubmitted: () -> Unit
) {
    val isEnglish = language == "en"
    val uriHandler = LocalUriHandler.current
    var accounts by remember { mutableStateOf(JSONArray()) }
    var balances by remember { mutableStateOf(JSONArray()) }
    var quote by remember { mutableStateOf<JSONObject?>(null) }
    var selectedId by rememberSaveable { mutableStateOf("") }
    var amount by rememberSaveable { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var expanded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        loading = true
        runCatching {
            withContext(Dispatchers.IO) {
                Pair(AuthRepository.payoutAccounts(), AuthRepository.promotionSummary())
            }
        }.onSuccess { result ->
            accounts = result.first.optJSONArray("items") ?: JSONArray()
            balances = result.second.optJSONArray("availableBalances") ?: JSONArray()
            for (index in 0 until accounts.length()) {
                val item = accounts.optJSONObject(index) ?: continue
                if (item.optBoolean("isDefault")) { selectedId = item.optString("id"); break }
            }
            if (selectedId.isBlank() && accounts.length() > 0) selectedId = accounts.optJSONObject(0)?.optString("id").orEmpty()
        }.onFailure { error = it.message ?: if (isEnglish) "Unable to load withdrawal data" else "加载提现信息失败" }
        loading = false
    }

    LaunchedEffect(selectedId) {
        quote = null
        if (selectedId.isNotBlank()) {
            runCatching { withContext(Dispatchers.IO) { AuthRepository.withdrawalQuote(selectedId) } }
                .onSuccess { quote = it; error = null }
                .onFailure { error = it.message ?: if (isEnglish) "Unable to load the latest exchange rate" else "获取最新汇率失败" }
        }
    }

    // Ask the server to calculate the converted amount using its validated FX
    // snapshot. The displayed estimate therefore uses the same rounding logic
    // as the withdrawal service instead of a separate client-side calculation.
    LaunchedEffect(selectedId, amount, quote?.optString("walletCurrency")) {
        val baseQuote = quote ?: return@LaunchedEffect
        val walletCurrency = baseQuote.optString("walletCurrency")
        if (selectedId.isBlank() || amount.isBlank() || walletCurrency.isBlank()) return@LaunchedEffect
        val fractionDigits = runCatching { java.util.Currency.getInstance(walletCurrency).defaultFractionDigits.coerceAtLeast(0) }.getOrDefault(2)
        val minor = runCatching { java.math.BigDecimal(amount.trim()).movePointRight(fractionDigits).toBigIntegerExact().toString() }.getOrNull()
            ?: return@LaunchedEffect
        delay(350)
        runCatching { withContext(Dispatchers.IO) { AuthRepository.withdrawalQuote(selectedId, minor) } }
            .onSuccess { quote = it; error = null }
            .onFailure { error = it.message ?: if (isEnglish) "Unable to refresh the withdrawal estimate" else "刷新预计到账金额失败" }
    }

    val selected = (0 until accounts.length()).mapNotNull { accounts.optJSONObject(it) }.firstOrNull { it.optString("id") == selectedId }
    val currency = quote?.optString("walletCurrency")?.takeIf { it.isNotBlank() } ?: ""
    val payoutCurrency = quote?.optString("payoutCurrency")?.takeIf { it.isNotBlank() } ?: selected?.optString("currency")?.trim().orEmpty()
    val digits = if (currency.isBlank()) 2 else runCatching { java.util.Currency.getInstance(currency).defaultFractionDigits.coerceAtLeast(0) }.getOrDefault(2)
    val payoutDigits = if (payoutCurrency.isBlank()) 2 else runCatching { java.util.Currency.getInstance(payoutCurrency).defaultFractionDigits.coerceAtLeast(0) }.getOrDefault(2)
    val availableMinor = (0 until balances.length()).mapNotNull { balances.optJSONObject(it) }
        .firstOrNull { it.optString("currency").trim().equals(currency, ignoreCase = true) }
        ?.optString("amountMinor", "0")?.toBigIntegerOrNull() ?: java.math.BigInteger.ZERO
    val requestedMinor = runCatching { java.math.BigDecimal(amount.trim()).movePointRight(digits).toBigIntegerExact() }.getOrNull()
    val minimumMinor = runCatching { java.math.BigDecimal.valueOf(quote?.optDouble("minimumAmount", 0.0) ?: 0.0).movePointRight(digits).toBigIntegerExact() }.getOrDefault(java.math.BigInteger.ZERO)
    val maximumMinor = runCatching { java.math.BigDecimal.valueOf(quote?.optDouble("maximumAmount", 0.0) ?: 0.0).movePointRight(digits).toBigIntegerExact() }.getOrDefault(java.math.BigInteger.ZERO)
    val amountValid = requestedMinor != null && requestedMinor > java.math.BigInteger.ZERO &&
        requestedMinor >= minimumMinor && maximumMinor > java.math.BigInteger.ZERO &&
        requestedMinor <= maximumMinor && requestedMinor <= availableMinor
    val estimatedPayout = runCatching {
        val quotedMinor = quote?.optString("payoutAmountMinor")?.takeIf { it.isNotBlank() && it != "null" }
        if (requestedMinor == null || quotedMinor == null || quote?.optString("amountMinor") != requestedMinor.toString()) null
        else formatMinorByCurrency(quotedMinor, payoutCurrency).removeSuffix(" $payoutCurrency")
    }.getOrNull()

    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6))) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF123E56)) }
            Spacer(Modifier.weight(1f))
            Text(if (isEnglish) "Apply withdrawal" else "申请提现", fontWeight = FontWeight.Bold, color = Color(0xFF123E56))
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF667085))
        }
        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else {
            Column(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp)) {
                    Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(if (isEnglish) "Available balance" else "可提现余额", color = Color(0xFF667085))
                        Text(if (selected == null || currency.isBlank()) "—" else formatMinorByCurrency(availableMinor.toString(), currency), color = Color(0xFF123E56), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.headlineSmall)
                        Text(if (isEnglish) "Withdrawal limits follow the current platform rules." else "提现限额以平台当前规则为准。", color = Color(0xFF789087), style = MaterialTheme.typography.bodySmall)
                        if (quote != null && currency.isNotBlank()) {
                            Text((if (isEnglish) "Latest rate: " else "最新参考汇率：") + "1 " + currency + " = " + quote!!.optString("rate") + " " + payoutCurrency, color = Color(0xFF319CCB), style = MaterialTheme.typography.bodySmall)
                            Text((if (isEnglish) "Rate source: " else "汇率来源：") + quote!!.optString("rateSource") + " · data date " + quote!!.optString("rateEffectiveAt", "—") + " · source updated " + quote!!.optString("rateProviderUpdatedAt", "—") + " · fetched " + quote!!.optString("rateFetchedAt"), color = Color(0xFF789087), style = MaterialTheme.typography.labelSmall)
                            if (quote!!.optString("rateSource").startsWith("exchangerate.dev")) {
                                Text("Rates by exchangerate.dev", color = Color(0xFF319CCB), style = MaterialTheme.typography.labelSmall, modifier = Modifier.clickable { uriHandler.openUri("https://exchangerate.dev") })
                            }
                        }
                    }
                }
                if (accounts.length() == 0) {
                    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp)) {
                        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(if (isEnglish) "No payout account" else "尚未添加收款账户", fontWeight = FontWeight.Bold, color = Color(0xFF123E56))
                            Button(onClick = onAddAccount) { Text(if (isEnglish) "Add payout account" else "新增收款账户") }
                        }
                    }
                } else {
                    Text(if (isEnglish) "Payout account" else "选择收款账户", color = Color(0xFF667085))
                    Box {
                        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                            Text(selected?.let { it.optString("methodCode") + " · " + it.optString("maskedAccount") + " · " + it.optString("currency") } ?: if (isEnglish) "Select account" else "请选择收款账户", modifier = Modifier.weight(1f), color = Color(0xFF123E56))
                            Icon(Icons.Default.ArrowDropDown, null)
                        }
                        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                            for (index in 0 until accounts.length()) {
                                val item = accounts.optJSONObject(index) ?: continue
                                DropdownMenuItem(text = { Text(item.optString("methodCode") + " · " + item.optString("maskedAccount") + " · " + item.optString("currency")) }, onClick = { selectedId = item.optString("id"); amount = ""; expanded = false })
                            }
                        }
                    }
                    Text(if (isEnglish) "Withdrawal amount" else "提现金额", color = Color(0xFF667085))
                    OutlinedTextField(
                        value = amount,
                        onValueChange = { value -> if (value.matches(Regex("[0-9]{0,18}(\\.[0-9]{0,8})?"))) amount = value },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        placeholder = { Text(if (isEnglish) "Enter amount" else "请输入提现金额") },
                        suffix = { Text(currency) }
                    )
                    Text((if (isEnglish) "Maximum available: " else "最多可提现：") + formatMinorByCurrency(availableMinor.toString(), currency), color = Color(0xFF789087), style = MaterialTheme.typography.bodySmall)
                    if (estimatedPayout != null) {
                        Text((if (isEnglish) "Estimated payout: " else "预计到账：") + estimatedPayout + " " + payoutCurrency, color = Color(0xFF123E56), fontWeight = FontWeight.SemiBold)
                        Text(if (isEnglish) "The server uses the latest available reference rate and saves it with your request. Actual settlement may vary by payout provider." else "提交时服务器会使用最新可用参考汇率并保存快照；实际出款金额可能受收款渠道报价影响。", color = Color(0xFF789087), style = MaterialTheme.typography.labelSmall)
                    }
                    if (error != null) Text(error.orEmpty(), color = Color(0xFFB42318))
                    Button(
                        onClick = {
                            val id = selected?.optString("id").orEmpty()
                            val minor = requestedMinor?.toString().orEmpty()
                            if (id.isNotBlank() && minor.isNotBlank() && !saving) {
                                scope.launch {
                                    saving = true
                                    error = null
                                    runCatching { withContext(Dispatchers.IO) { AuthRepository.createWithdrawal(id, minor, quote ?: throw IllegalStateException("请先刷新提现报价")) } }
                                        .onSuccess { onSubmitted() }
                                        .onFailure { failure ->
                                            val message = failure.message ?: if (isEnglish) "Withdrawal request failed" else "提现申请失败"
                                            error = message
                                            if (message.contains("exchange rate changed", ignoreCase = true) ||
                                                message.contains("payout estimate no longer matches", ignoreCase = true)) {
                                                runCatching {
                                                    withContext(Dispatchers.IO) { AuthRepository.withdrawalQuote(id, minor) }
                                                }.onSuccess { refreshedQuote ->
                                                    quote = refreshedQuote
                                                }.onFailure {
                                                    error = message + if (isEnglish) " The latest quote could not be refreshed." else "，最新报价刷新失败，请稍后重试。"
                                                }
                                            }
                                        }
                                    saving = false
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        enabled = amountValid && quote != null && estimatedPayout != null &&
                            quote?.optString("amountMinor") == requestedMinor?.toString() &&
                            selected != null && !saving,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF319CCB))
                    ) {
                        if (saving) CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
                        else Text(if (isEnglish) "Submit withdrawal request" else "提交提现申请")
                    }
                }
                if (error != null && accounts.length() == 0) Text(error.orEmpty(), color = Color(0xFFB42318))
            }
        }
    }
}

@Composable
private fun AddPayoutAccountScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit, onSaved: () -> Unit) {
    val isEnglish = language == "en"
    var options by remember { mutableStateOf(JSONArray()) }
    var countryCode by rememberSaveable { mutableStateOf("") }
    var payoutCurrency by rememberSaveable { mutableStateOf("") }
    var methodCode by rememberSaveable { mutableStateOf("") }
    var providerCode by rememberSaveable { mutableStateOf("") }
    var account by rememberSaveable { mutableStateOf("") }
    var holder by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var countryExpanded by remember { mutableStateOf(false) }
    var currencyExpanded by remember { mutableStateOf(false) }
    var methodExpanded by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        runCatching { withContext(Dispatchers.IO) { AuthRepository.payoutOptions() } }
            .onSuccess { response ->
                options = response.optJSONArray("items") ?: JSONArray()
                val first = options.optJSONObject(0)
                if (first != null) {
                    countryCode = first.optString("countryCode")
                    payoutCurrency = first.optString("payoutCurrency")
                    methodCode = first.optString("methodCode")
                    providerCode = first.optString("providerCode")
                }
                if (options.length() == 0) error = if (isEnglish) "No payout methods are currently available." else "目前没有已启用的收款方式，请联系平台客服。"
            }
            .onFailure { error = it.message ?: if (isEnglish) "Unable to load payout options." else "加载收款配置失败。" }
        loading = false
    }

    val allOptions = (0 until options.length()).mapNotNull { options.optJSONObject(it) }
    val countries = allOptions.filter { it.optString("countryCode").isNotBlank() }.distinctBy { it.optString("countryCode") }
    val currencies = allOptions.filter { it.optString("countryCode") == countryCode }.distinctBy { it.optString("payoutCurrency") }
    val methods = allOptions.filter { it.optString("countryCode") == countryCode && it.optString("payoutCurrency") == payoutCurrency }
        .distinctBy { it.optString("methodCode") + "|" + it.optString("providerCode") }
    val selectedOption = methods.firstOrNull { it.optString("methodCode") == methodCode && it.optString("providerCode") == providerCode } ?: methods.firstOrNull()
    val valid = account.trim().length in 5..80 && holder.isNotBlank() && selectedOption != null

    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6)).verticalScroll(rememberScrollState())) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF123E56)) }
            Spacer(Modifier.weight(1f)); Text(if (isEnglish) "Payout accounts" else "收款账户", fontWeight = FontWeight.Bold, color = Color(0xFF123E56)); Spacer(Modifier.weight(1f))
            Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF667085))
        }
        Column(Modifier.fillMaxWidth().padding(18.dp).background(Color.White, RoundedCornerShape(18.dp)).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Surface(color = Color(0xFFE2F5ED), shape = RoundedCornerShape(50)) { Icon(Icons.Default.Add, null, tint = Color(0xFF319CCB), modifier = Modifier.padding(8.dp)) }
                Text(if (isEnglish) "Add account" else "新增账户", fontWeight = FontWeight.Bold, color = Color(0xFF123E56), style = MaterialTheme.typography.titleMedium)
            }
            if (loading) {
                Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else {
                Text(if (isEnglish) "Payout country" else "选择收款国家", color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall)
                Box {
                    OutlinedButton(onClick = { countryExpanded = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                        Text(countries.firstOrNull { it.optString("countryCode") == countryCode }?.optString("countryName")?.plus(" · $countryCode") ?: countryCode.ifBlank { if (isEnglish) "Select country" else "请选择国家" }, modifier = Modifier.weight(1f), color = Color(0xFF123E56))
                        Icon(Icons.Default.ArrowDropDown, null)
                    }
                    DropdownMenu(expanded = countryExpanded, onDismissRequest = { countryExpanded = false }) {
                        countries.forEach { item ->
                            DropdownMenuItem(text = { Text(item.optString("countryName") + " · " + item.optString("countryCode")) }, onClick = {
                                countryCode = item.optString("countryCode")
                                val next = allOptions.firstOrNull { it.optString("countryCode") == countryCode }
                                payoutCurrency = next?.optString("payoutCurrency").orEmpty()
                                methodCode = next?.optString("methodCode").orEmpty()
                                providerCode = next?.optString("providerCode").orEmpty()
                                countryExpanded = false
                            })
                        }
                    }
                }
                Text(if (isEnglish) "Payout currency" else "收款货币", color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall)
                Box {
                    OutlinedButton(onClick = { currencyExpanded = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                        Text(payoutCurrency.ifBlank { if (isEnglish) "Select currency" else "请选择货币" }, modifier = Modifier.weight(1f), color = Color(0xFF123E56))
                        Icon(Icons.Default.ArrowDropDown, null)
                    }
                    DropdownMenu(expanded = currencyExpanded, onDismissRequest = { currencyExpanded = false }) {
                        currencies.forEach { item ->
                            DropdownMenuItem(text = { Text(item.optString("currencyName").ifBlank { item.optString("payoutCurrency") }) }, onClick = {
                                payoutCurrency = item.optString("payoutCurrency")
                                val next = allOptions.firstOrNull { it.optString("countryCode") == countryCode && it.optString("payoutCurrency") == payoutCurrency }
                                methodCode = next?.optString("methodCode").orEmpty()
                                providerCode = next?.optString("providerCode").orEmpty()
                                currencyExpanded = false
                            })
                        }
                    }
                }
                Text(if (isEnglish) "Payout method" else "收款方式", color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall)
                Box {
                    OutlinedButton(onClick = { methodExpanded = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                        Text(selectedOption?.optString("methodName") ?: methodCode.ifBlank { if (isEnglish) "Select method" else "请选择收款方式" }, modifier = Modifier.weight(1f), color = Color(0xFF123E56))
                        Icon(Icons.Default.ArrowDropDown, null)
                    }
                    DropdownMenu(expanded = methodExpanded, onDismissRequest = { methodExpanded = false }) {
                        methods.forEach { item ->
                            DropdownMenuItem(text = { Text(item.optString("methodName") + " · " + item.optString("providerName")) }, onClick = {
                                methodCode = item.optString("methodCode")
                                providerCode = item.optString("providerCode")
                                methodExpanded = false
                            })
                        }
                    }
                }
                OutlinedTextField(value = account, onValueChange = { account = it.take(80) }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(12.dp), placeholder = { Text(if (isEnglish) "Payout account number *" else "收款账号 *") })
                OutlinedTextField(value = holder, onValueChange = { holder = it.take(120) }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(12.dp), placeholder = { Text(if (isEnglish) "Account holder *" else "账户持有人姓名 *") })
                OutlinedTextField(value = phone, onValueChange = { phone = it.take(30) }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(12.dp), placeholder = { Text(if (isEnglish) "Phone number (optional)" else "手机号（选填）") }, keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Phone))
            }
            if (error != null) Text(error.orEmpty(), color = Color(0xFFB42318), style = MaterialTheme.typography.bodySmall)
            Button(onClick = {
                val option = selectedOption ?: return@Button
                scope.launch {
                    saving = true; error = null
                    runCatching {
                        withContext(Dispatchers.IO) {
                            AuthRepository.addPayoutAccount(
                                option.optString("countryCode"), option.optString("payoutCurrency"),
                                option.optString("providerCode"), option.optString("methodCode"),
                                holder, account, phone
                            )
                        }
                    }.onSuccess { onSaved() }.onFailure { error = it.message ?: if (isEnglish) "Unable to save account" else "保存失败" }
                    saving = false
                }
            }, enabled = valid && !saving && !loading, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF319CCB), disabledContainerColor = Color(0xFFB8D7CC))) {
                if (saving) CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp) else Text(if (isEnglish) "Save account" else "保存账户", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun WalletMiniMetric(modifier: Modifier, label: String, value: String, accent: Color) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(label, color = Color(0xFF667085), style = MaterialTheme.typography.labelSmall, maxLines = 1)
        Text(value, color = Color(0xFF17243A), fontWeight = FontWeight.Bold)
        Box(Modifier.width(28.dp).height(4.dp).background(accent, RoundedCornerShape(4.dp)))
    }
}

@Composable
private fun WalletServiceRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, background: Color, tint: Color, onClick: () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
        Surface(color = background, shape = RoundedCornerShape(10.dp)) { Icon(icon, null, tint = tint, modifier = Modifier.padding(10.dp)) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, color = Color(0xFF17243A))
            Text(subtitle, color = Color(0xFF718096), style = MaterialTheme.typography.bodySmall)
        }
        Icon(Icons.Default.ChevronRight, null, tint = Color(0xFF98A2B3))
    }
}

@Composable
private fun InviteFriendsScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val en = language == "en"
    var data by remember { mutableStateOf<JSONObject?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var showQr by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val code = data?.optString("referralCode").orEmpty()
    val url = data?.optString("inviteUrl").orEmpty()
    LaunchedEffect(Unit) {
        try { data = withContext(Dispatchers.IO) { AuthRepository.promotionSummary() } }
        catch (e: Exception) { error = e.message ?: if (en) "Unable to load invitation details" else "邀请信息加载失败" }
        finally { loading = false }
    }
    fun copy(value: String, label: String) {
        if (value.isBlank()) return
        val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        clipboard.setPrimaryClip(android.content.ClipData.newPlainText(label, value))
        android.widget.Toast.makeText(context, if (en) "Copied" else "已复制", android.widget.Toast.LENGTH_SHORT).show()
    }
    fun share() {
        if (url.isBlank()) return
        val send = Intent(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, if (en) "Join me" else "邀请你加入")
            .putExtra(Intent.EXTRA_TEXT, url)
        context.startActivity(Intent.createChooser(send, if (en) "Share invitation" else "邀请好友"))
    }
    Column(modifier.fillMaxSize().background(Color(0xFFF2F7FB)).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(14.dp)).padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF123E56)) }
            Spacer(Modifier.weight(1f))
            Text(if (en) "Invite friends" else "邀请好友", color = Color(0xFF123E56), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF5AAED0), modifier = Modifier.padding(end = 10.dp))
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFDDF3FF)), shape = RoundedCornerShape(18.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFB9E5F8))) {
            Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text(if (en) "Share your invitation link or code" else "分享你的注册链接或邀请码", color = Color(0xFF287FA5), fontWeight = FontWeight.SemiBold)
                    Text(if (en) "Invite friends to complete eligible tasks" else "邀请好友完成符合条件的任务并审核、结算后，你可获得佣金。", color = Color(0xFF17243A), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Text(if (en) "Commission is calculated according to the platform rules." else "佣金按平台任务规则和实际结算结果计算。", color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall)
                }
                Icon(Icons.Default.PersonAdd, null, tint = Color(0xFF319CCB), modifier = Modifier.size(42.dp))
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFD6EAF5))) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(if (en) "My invitation code" else "我的邀请码", color = Color(0xFF667085), fontWeight = FontWeight.SemiBold)
                Text(code.ifBlank { if (loading) "…" else "—" }, color = Color(0xFF236F91), fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.headlineLarge)
                Button(onClick = { copy(code, "Invitation code") }, enabled = code.isNotBlank(), modifier = Modifier.fillMaxWidth().height(52.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF319CCB)), shape = RoundedCornerShape(14.dp)) {
                    Icon(Icons.Default.ContentCopy, null); Spacer(Modifier.width(8.dp)); Text(if (en) "Copy invitation code" else "复制邀请码", fontWeight = FontWeight.Bold)
                }
                HorizontalDivider(color = Color(0xFFE5EFF5))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(color = Color(0xFFDDF3FF), shape = RoundedCornerShape(50)) { Icon(Icons.Default.Link, null, tint = Color(0xFF319CCB), modifier = Modifier.padding(9.dp)) }
                    Spacer(Modifier.width(9.dp)); Text(if (en) "My invitation link" else "我的邀请链接", color = Color(0xFF17243A), fontWeight = FontWeight.Bold)
                }
                Surface(color = Color(0xFFF2F8FC), shape = RoundedCornerShape(12.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE1EDF4))) {
                    Text(url.ifBlank { if (loading) "…" else "—" }, Modifier.fillMaxWidth().padding(13.dp), color = Color(0xFF344054), style = MaterialTheme.typography.bodyMedium)
                }
                OutlinedButton(onClick = { copy(url, "Invitation link") }, enabled = url.isNotBlank(), modifier = Modifier.fillMaxWidth().height(50.dp), shape = RoundedCornerShape(14.dp), colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF319CCB))) {
                    Icon(Icons.Default.ContentCopy, null); Spacer(Modifier.width(8.dp)); Text(if (en) "Copy invitation link" else "复制邀请链接", fontWeight = FontWeight.Bold)
                }
                HorizontalDivider(color = Color(0xFFE5EFF5))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(color = Color(0xFFDDF3FF), shape = RoundedCornerShape(50)) { Icon(Icons.Default.QrCode2, null, tint = Color(0xFF319CCB), modifier = Modifier.padding(9.dp)) }
                    Spacer(Modifier.width(9.dp)); Text(if (en) "Invitation QR code" else "邀请二维码", color = Color(0xFF17243A), fontWeight = FontWeight.Bold)
                    Spacer(Modifier.weight(1f)); Text(if (en) "Tap to enlarge" else "点击放大", color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall)
                }
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    if (url.isNotBlank()) PromotionQrCode(url, Modifier.size(180.dp), onClick = { showQr = true })
                    else Box(Modifier.size(180.dp), contentAlignment = Alignment.Center) { if (loading) CircularProgressIndicator(color = Color(0xFF319CCB)) else Text("—", color = Color(0xFF667085)) }
                }
            }
        }
        Button(onClick = { share() }, enabled = url.isNotBlank(), modifier = Modifier.fillMaxWidth().height(58.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF319CCB)), shape = RoundedCornerShape(14.dp)) {
            Icon(Icons.Default.Share, null); Spacer(Modifier.width(9.dp)); Text(if (en) "Share now" else "立即分享", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F6FD)), shape = RoundedCornerShape(16.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFCBEAF8))) {
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.Default.Info, null, tint = Color(0xFF319CCB), modifier = Modifier.padding(top = 2.dp))
                Spacer(Modifier.width(10.dp))
                Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(if (en) "Commission rules" else "佣金说明", color = Color(0xFF17243A), fontWeight = FontWeight.Bold)
                    Text(if (en) "Commission is generated only after eligible invited-user tasks pass review and settlement. The applicable rate is determined by the task rules." else "符合条件的受邀任务经审核并结算后生成佣金；佣金比例按任务开始时的规则确定。", color = Color(0xFF667085), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        if (error != null) Text(error.orEmpty(), Modifier.fillMaxWidth().clickable { scope.launch { loading = true; error = null; runCatching { withContext(Dispatchers.IO) { AuthRepository.promotionSummary() } }.onSuccess { data = it }.onFailure { error = it.message }; loading = false } }.padding(8.dp), color = Color(0xFFB42318))
    }
    if (showQr && url.isNotBlank()) AlertDialog(onDismissRequest = { showQr = false }, title = { Text(if (en) "Invitation QR code" else "邀请二维码") }, text = { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { PromotionQrCode(url, Modifier.size(240.dp)) } }, confirmButton = { TextButton(onClick = { copy(url, "Invitation link"); showQr = false }) { Text(if (en) "Copy link" else "复制链接") } }, dismissButton = { TextButton(onClick = { showQr = false }) { Text(if (en) "Close" else "关闭") } })
}

@Composable
private fun CommissionHistoryScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit) {
    val en = language == "en"
    var selected by rememberSaveable { mutableIntStateOf(0) }
    var summary by remember { mutableStateOf<JSONObject?>(null) }
    var records by remember { mutableStateOf<JSONObject?>(null) }
    var summaryError by remember { mutableStateOf(false) }
    var recordsError by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var refresh by remember { mutableIntStateOf(0) }
    LaunchedEffect(refresh) {
        loading = true
        summaryError = false
        recordsError = false
        val result = withContext(Dispatchers.IO) {
            val summaryResult = runCatching { AuthRepository.promotionSummary() }
            val recordsResult = runCatching { AuthRepository.commissionRecords() }
            Pair(summaryResult, recordsResult)
        }
        result.first.onSuccess { summary = it }.onFailure { summaryError = true }
        result.second.onSuccess { records = it }.onFailure { recordsError = true }
        loading = false
    }
    fun amount(key: String): String = formatCurrencyTotals(summary?.optJSONObject(key))
    val items = records?.optJSONArray("items")
    val filtered = (0 until (items?.length() ?: 0)).mapNotNull { items?.optJSONObject(it) }.filter {
        selected == 0 || it.optString("status") == if (selected == 1) "PENDING" else "CREDITED"
    }
    Column(modifier.fillMaxSize().background(Color(0xFFF2F7FB))) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF123E56)) }
            Spacer(Modifier.weight(1f))
            Text(if (en) "Commission history" else "佣金记录", color = Color(0xFF123E56), fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF667085))
            Spacer(Modifier.width(12.dp))
            Icon(Icons.Default.Language, null, tint = Color(0xFF667085))
            Spacer(Modifier.width(8.dp))
        }
        Row(Modifier.fillMaxWidth().background(Color.White)) {
            listOf(if (en) "All" else "全部", if (en) "Pending" else "等待处理", if (en) "Credited" else "已入账").forEachIndexed { index, label ->
                Column(Modifier.weight(1f).clickable { selected = index }.padding(top = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(label, color = if (selected == index) Color(0xFF319CCB) else Color(0xFF667085), fontWeight = if (selected == index) FontWeight.Bold else FontWeight.Medium)
                    Spacer(Modifier.height(12.dp))
                    Box(Modifier.fillMaxWidth().height(3.dp).background(if (selected == index) Color(0xFF319CCB) else Color.Transparent))
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CommissionSummaryCard(Modifier.weight(1f), if (en) "Total commission" else "累计佣金", if (summaryError || summary == null) "—" else amount("totalCommissions"), Icons.Default.AccountBalanceWallet)
            CommissionSummaryCard(Modifier.weight(1f), if (en) "This month" else "本月佣金", if (summaryError || summary == null) "—" else amount("monthCommissions"), Icons.Default.CalendarMonth)
            CommissionSummaryCard(Modifier.weight(1f), if (en) "Pending commission" else "历史待处理佣金", if (recordsError || records == null) "—" else formatCurrencyTotals(records?.optJSONObject("pendingCommissions")), Icons.Default.Schedule)
        }
        if (loading) {
            Box(Modifier.fillMaxWidth().padding(18.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Color(0xFF319CCB)) }
        } else if (summaryError || recordsError) {
            TextButton(onClick = { refresh++ }, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp).background(Color(0xFFEAF6FC), RoundedCornerShape(10.dp))) {
                Text(if (en) "Some data failed to load. Tap to retry." else "部分数据加载失败，点击重试", color = Color(0xFF258BB8))
            }
        }
        if (!loading && filtered.isEmpty()) {
            Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.fillMaxWidth().padding(vertical = 42.dp, horizontal = 18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Icon(Icons.Default.AccountBalanceWallet, null, tint = Color(0xFF667085), modifier = Modifier.size(36.dp))
                    Text(if (en) "No commission records" else "暂无佣金记录", color = Color(0xFF17243A), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Text(if (en) "Eligible invited-user tasks appear here after review and settlement." else "符合条件的受邀任务审核并结算后，佣金会显示在这里。", color = Color(0xFF667085), textAlign = androidx.compose.ui.text.style.TextAlign.Center, style = MaterialTheme.typography.bodyLarge)
                }
            }
        } else if (!loading) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                filtered.forEach { item ->
                    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp)) {
                        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Surface(color = Color(0xFFDDF3FF), shape = RoundedCornerShape(50)) { Icon(Icons.Default.AccountBalanceWallet, null, tint = Color(0xFF319CCB), modifier = Modifier.padding(10.dp)) }
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(if (en) "Level ${item.optInt("depth")} commission" else "${item.optInt("depth")}级邀请佣金", fontWeight = FontWeight.Bold, color = Color(0xFF17243A))
                                Text(item.optString("createdAt").take(10), color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall)
                                Text(if (item.optString("status") == "CREDITED") { if (en) "Credited" else "已入账" } else { if (en) "Pending" else "等待处理" }, color = Color(0xFF319CCB), style = MaterialTheme.typography.bodySmall)
                            }
                            Text(formatCurrencyTotals(JSONObject().put(item.optString("currency"), item.optString("amountMinor"))), color = Color(0xFF319CCB), fontWeight = FontWeight.Bold)
                        }
                    }
                }
                if (records?.optBoolean("hasMore") == true) Text(if (en) "Showing the latest 100 records" else "仅展示最近100条记录", color = Color(0xFF667085), modifier = Modifier.padding(8.dp))
            }
        }
    }
}

@Composable
private fun TeamDataScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit) {
    val en = language == "en"
    var selected by rememberSaveable { mutableIntStateOf(1) }
    var data by remember { mutableStateOf<JSONObject?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var refresh by remember { mutableIntStateOf(0) }
    LaunchedEffect(refresh) {
        loading = true
        error = null
        try { data = withContext(Dispatchers.IO) { AuthRepository.teamMembers() } }
        catch (e: Exception) { error = e.message ?: if (en) "Failed to load team" else "团队数据加载失败" }
        finally { loading = false }
    }
    Column(modifier.fillMaxSize().background(Color(0xFFF2F7FB))) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF123E56)) }
            Spacer(Modifier.weight(1f))
            Text(if (en) "Team data" else "团队数据", color = Color(0xFF123E56), fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF5AAED0), modifier = Modifier.padding(end = 12.dp))
        }
        Row(Modifier.fillMaxWidth().background(Color.White)) {
            (1..3).forEach { level ->
                Column(Modifier.weight(1f).clickable { selected = level }.padding(top = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(if (en) "Level ${level}" else "${level} 级用户", color = if (selected == level) Color(0xFF319CCB) else Color(0xFF667085), fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(5.dp))
                    Text(if (data == null) "—" else data?.optJSONObject("counts")?.optInt("level${level}", 0).toString(), color = if (selected == level) Color(0xFF319CCB) else Color(0xFF17243A), fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(12.dp))
                    Box(Modifier.fillMaxWidth().height(3.dp).background(if (selected == level) Color(0xFF319CCB) else Color.Transparent))
                }
            }
        }
        if (loading) Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Color(0xFF319CCB)) }
        if (error != null) Text((if (en) "Tap to retry: " else "团队数据加载失败，点击重试：") + error.orEmpty(), Modifier.fillMaxWidth().padding(12.dp).background(Color(0xFFFFEEEE), RoundedCornerShape(10.dp)).clickable { refresh++ }.padding(12.dp), color = Color(0xFFB42318))
        val items = data?.optJSONArray("items")
        val members = (0 until (items?.length() ?: 0)).mapNotNull { items?.optJSONObject(it) }.filter { it.optInt("depth") == selected }
        if (!loading && error == null && members.isEmpty()) {
            Card(Modifier.fillMaxWidth().padding(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp)) {
                Column(Modifier.fillMaxWidth().padding(vertical = 42.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Icon(Icons.Default.Groups, null, tint = Color(0xFF667085), modifier = Modifier.size(30.dp))
                    Text(if (en) "No invited users" else "暂无邀请用户", color = Color(0xFF667085))
                }
            }
        } else {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                members.forEachIndexed { index, item ->
                    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(12.dp)) {
                        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Surface(color = Color(0xFFDDF3FF), shape = RoundedCornerShape(50)) { Icon(Icons.Default.Groups, null, tint = Color(0xFF319CCB), modifier = Modifier.padding(10.dp)) }
                            Spacer(Modifier.width(12.dp))
                            Column {
                                Text(if (en) "Invited user #${index + 1}" else "邀请用户 #${index + 1}", color = Color(0xFF17243A), fontWeight = FontWeight.Bold)
                                Text((if (en) "Joined: " else "加入时间：") + item.optString("invitedAt").take(10), color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
                if (data?.optBoolean("hasMore") == true) Text(if (en) "Showing the latest 300 users" else "仅展示最近300位用户", color = Color(0xFF667085), modifier = Modifier.padding(8.dp))
            }
        }
    }
}

@Composable
private fun CommissionSummaryCard(modifier: Modifier, title: String, value: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Card(modifier, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.fillMaxWidth().padding(vertical = 14.dp, horizontal = 5.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Surface(color = Color(0xFFDDF3FF), shape = RoundedCornerShape(50)) { Icon(icon, null, tint = Color(0xFF319CCB), modifier = Modifier.padding(9.dp).size(20.dp)) }
            Text(title, color = Color(0xFF667085), style = MaterialTheme.typography.labelSmall, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            Text(value, color = Color(0xFF319CCB), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall, maxLines = 1)
        }
    }
}

@Composable
private fun PromotionScreen(modifier: Modifier = Modifier, language: String, onWalletClick: () -> Unit, onCommissionClick: () -> Unit, onInviteClick: () -> Unit, onTeamClick: () -> Unit) {
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
    fun amount(json: JSONObject?, key: String): String =
        formatCurrencyTotals(json?.optJSONObject(key))
    val balance = formatAvailableBalances(data?.optJSONArray("availableBalances"))
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
        modifier.fillMaxSize().background(Color(0xFFF2F7FB)).verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            Modifier.fillMaxWidth().background(Color(0xFFDDF3FF), RoundedCornerShape(16.dp)).padding(horizontal = 12.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(color = Color.White, shape = RoundedCornerShape(24.dp)) {
                Text((if (isEnglish) "Withdraw  " else "提现  ") + balance, Modifier.padding(horizontal = 12.dp, vertical = 8.dp), color = Color(0xFF0A6FAF), fontWeight = FontWeight.Bold)
            }
            Text(if (isEnglish) "Promote" else "推广", color = Color(0xFF123E56), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { supportDialog = true }) { Icon(Icons.Default.HeadsetMic, contentDescription = "Support", tint = Color(0xFF5AAED0)) }
                Icon(Icons.Default.Language, contentDescription = if (isEnglish) "Language" else "语言", tint = Color(0xFF5AAED0))
            }
        }
        if (loading && data == null) {
            Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Color(0xFF319CCB)) }
        }
        if (error != null) {
            Surface(color = Color(0xFFFFEEEE), shape = RoundedCornerShape(10.dp)) {
                Text(error.orEmpty(), Modifier.fillMaxWidth().clickable { load() }.padding(12.dp), color = Color(0xFFB42318))
            }
        }
        Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(18.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFD6EAF5))
        ) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(if (isEnglish) "My invitation code" else "我的邀请码", color = Color(0xFF667085), style = MaterialTheme.typography.bodyMedium)
                        Text(inviteCode.ifBlank { if (loading) "…" else "—" }, color = Color(0xFF0A6FAF), fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.headlineMedium)
                        OutlinedButton(
                            onClick = { copyText(inviteCode, "Invitation code") },
                            enabled = inviteCode.isNotBlank(),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 5.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF319CCB))
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
                    Modifier.fillMaxWidth().background(Color(0xFFF2F8FC), RoundedCornerShape(12.dp)).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp)
                ) {
                    Surface(color = Color(0xFFDDF3FF), shape = RoundedCornerShape(30.dp)) {
                        Icon(Icons.Default.Link, null, tint = Color(0xFF319CCB), modifier = Modifier.padding(10.dp))
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
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF319CCB)),
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
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF319CCB))
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
                PromotionMetric(Icons.Default.Wallet, if (isEnglish) "Available balance" else "可用余额", balance, modifier = Modifier.weight(1f), onClick = onWalletClick)
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(vertical = 18.dp, horizontal = 5.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                PromotionMetric(Icons.Default.PersonAdd, if (isEnglish) "Invited" else "邀请人数", data?.optInt("inviteCount", 0)?.toString() ?: "0", modifier = Modifier.weight(1f))
                PromotionMetric(Icons.Default.Groups, if (isEnglish) "Active users" else "活跃用户", data?.optInt("activeCount", 0)?.toString() ?: "0", modifier = Modifier.weight(1f))
                PromotionMetric(Icons.Default.MonetizationOn, if (isEnglish) "This month" else "本月佣金", amount(data, "monthCommissions"), modifier = Modifier.weight(1f), onClick = onCommissionClick)
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                PromotionMenuRow(Icons.Default.PersonAdd, if (isEnglish) "Invite friends" else "邀请好友", if (isEnglish) "Share your invitation link or code" else "分享你的注册链接或邀请码", onInviteClick)
                HorizontalDivider(color = Color(0xFFEEF1F3))
                PromotionMenuRow(Icons.Default.ReceiptLong, if (isEnglish) "Commission history" else "佣金记录", if (isEnglish) "View commission amounts and settlement status" else "查看每笔佣金的金额和结算状态", onCommissionClick)
                HorizontalDivider(color = Color(0xFFEEF1F3))
                PromotionMenuRow(Icons.Default.Groups, if (isEnglish) "Team data" else "团队数据", if (isEnglish) "View invited users and team levels" else "查看邀请用户和各层级人数", onTeamClick)
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
            Box(contentAlignment = Alignment.Center) { Icon(Icons.Default.QrCode2, null, tint = Color(0xFF319CCB)) }
        }
    }
}

@Composable
private fun PromotionMetric(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    Column(
        modifier.then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(horizontal = 3.dp),
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
                tint = Color(0xFF319CCB),
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
        Surface(color = Color(0xFFDDF3FF), shape = RoundedCornerShape(10.dp)) {
            Icon(icon, null, tint = Color(0xFF319CCB), modifier = Modifier.padding(10.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, color = Color(0xFF17243A), fontWeight = FontWeight.SemiBold)
            Text(subtitle, color = Color(0xFF667085), style = MaterialTheme.typography.bodySmall)
        }
        Icon(Icons.Default.ChevronRight, null, tint = Color(0xFF667085))
    }
}
