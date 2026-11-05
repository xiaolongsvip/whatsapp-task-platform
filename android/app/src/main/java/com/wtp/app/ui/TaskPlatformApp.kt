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
    var showCommissionHistory by rememberSaveable { mutableStateOf(false) }
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
            2 -> if (showCommissionHistory) {
                CommissionHistoryScreen(Modifier.padding(padding), language, onBack = { showCommissionHistory = false })
            } else {
                PromotionScreen(Modifier.padding(padding), language, onWalletClick = { tab = 3 }, onCommissionClick = { showCommissionHistory = true })
            }
            3 -> when (walletPage) {
                "accounts" -> PayoutAccountsScreen(Modifier.padding(padding), language, onBack = { walletPage = "home" }, onAdd = { walletPage = "add-account" })
                "add-account" -> AddPayoutAccountScreen(Modifier.padding(padding), language, onBack = { walletPage = "accounts" }, onSaved = { walletPage = "accounts" })
                "details" -> WalletDetailsScreen(Modifier.padding(padding), language, onBack = { walletPage = "home" })
                "withdrawals" -> WithdrawalHistoryScreen(Modifier.padding(padding), language, onBack = { walletPage = "home" })
                "guide" -> WithdrawalGuideScreen(Modifier.padding(padding), language, onBack = { walletPage = "home" })
                else -> WalletScreen(
                    Modifier.padding(padding), language,
                    onApplyWithdraw = { walletPage = "accounts" },
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
    val en = language == "en"
    var user by remember { mutableStateOf<JSONObject?>(null) }
    var dialog by remember { mutableStateOf("") }
    val overlay = Settings.canDrawOverlays(context)
    LaunchedEffect(Unit) { user = withContext(Dispatchers.IO) { runCatching { AuthRepository.currentUser() }.getOrNull() } }
    val id = user?.optString("id")?.takeIf { it.isNotBlank() && it != "null" } ?: user?.optString("userId")?.takeIf { it.isNotBlank() && it != "null" }
    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6)).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Column(Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(Color(0xFFB5E7D0), Color(0xFFE8F7EF)))).padding(horizontal = 18.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Surface(color = Color.White, shape = RoundedCornerShape(24.dp)) { Text(if (en) "Withdraw  0.000" else "提现  0.000", Modifier.padding(horizontal = 12.dp, vertical = 7.dp), color = Color(0xFF278666), fontWeight = FontWeight.Bold) }
                Spacer(Modifier.weight(1f)); Text(if (en) "My" else "我的", color = Color(0xFF315D4D), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium); Spacer(Modifier.weight(1f))
                Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF638579)); Spacer(Modifier.width(14.dp)); Icon(Icons.Default.Language, null, tint = Color(0xFF638579))
            }
            Row(Modifier.fillMaxWidth().clickable { dialog = "security" }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(color = Color(0xFFE9F8F0), shape = RoundedCornerShape(50), border = androidx.compose.foundation.BorderStroke(2.dp, Color.White)) { Icon(Icons.Default.Person, null, tint = Color(0xFF278666), modifier = Modifier.size(68.dp).padding(17.dp)) }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { Text(phone, color = Color(0xFF17243A), fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.titleLarge); Surface(color = Color(0xFFDDF4E8), shape = RoundedCornerShape(20.dp)) { Text(if (en) "Verified" else "已认证", Modifier.padding(horizontal = 9.dp, vertical = 4.dp), color = Color(0xFF278666), style = MaterialTheme.typography.labelSmall) } }
                    if (id != null) Text("ID: $id", color = Color(0xFF667085), style = MaterialTheme.typography.bodyMedium)
                }
                Surface(color = Color.White, shape = RoundedCornerShape(50)) { Icon(Icons.Default.ChevronRight, null, tint = Color(0xFF667085), modifier = Modifier.padding(8.dp)) }
            }
        }
        Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clickable(onClick = onInvite), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(color = Color(0xFFE5F6ED), shape = RoundedCornerShape(14.dp)) { Icon(Icons.Default.PersonAdd, null, tint = Color(0xFF278666), modifier = Modifier.padding(12.dp)) }
                Spacer(Modifier.width(12.dp)); Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) { Text(if (en) "Invite friends and earn commission" else "邀请好友赚佣金", fontWeight = FontWeight.Bold, color = Color(0xFF17243A)); Text(if (en) "Earn extra rewards when friends complete tasks" else "好友完成任务，您可获得额外佣金奖励", color = Color(0xFF718096), style = MaterialTheme.typography.bodySmall) }
                Button(onClick = onInvite, shape = RoundedCornerShape(24.dp), contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF278666))) { Text(if (en) "Invite  ›" else "去邀请  ›") }
            }
        }
        Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(if (en) "My assets" else "我的资产", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = Color(0xFF17243A))
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    ProfileAsset(Icons.Default.Wallet, if (en) "Available balance" else "可提现余额", "0.000", Color(0xFF278666), Modifier.weight(1f), onPayoutAccounts)
                    Box(Modifier.width(1.dp).height(56.dp).background(Color(0xFFE8EDF0)))
                    ProfileAsset(Icons.Default.AccountBalanceWallet, if (en) "Pending rewards" else "待审核奖励", "—", Color(0xFFFF8A22), Modifier.weight(1f))
                    Box(Modifier.width(1.dp).height(56.dp).background(Color(0xFFE8EDF0)))
                    ProfileAsset(Icons.Default.Paid, if (en) "Total earnings" else "累计收益", "0.000", Color(0xFF278666), Modifier.weight(1f))
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
                ProfileMenuRow(Icons.Default.SystemUpdate, if (en) "Check for updates" else "检查更新", if (en) "Current version 1.4.5" else "当前版本 1.4.5", { dialog = "update" }, showDivider = false)
            }
        }
        Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clickable(onClick = onLogout), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp)) { Box(Modifier.fillMaxWidth().padding(vertical = 17.dp), contentAlignment = Alignment.Center) { Text(if (en) "Log out" else "退出登录", color = Color(0xFFE53935), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium) } }
        Text(if (en) "Version 1.4.5" else "版本 1.4.5", modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center, color = Color(0xFF718096), style = MaterialTheme.typography.bodySmall)
    }
    val title = when (dialog) { "support" -> if (en) "Customer support" else "联系客服"; "security" -> if (en) "Account security" else "账号与安全"; "tutorial" -> if (en) "Task tutorial" else "任务使用教程"; else -> if (en) "Check for updates" else "检查更新" }
    if (dialog.isNotEmpty()) AlertDialog(onDismissRequest = { dialog = "" }, title = { Text(title) }, text = { Text(when (dialog) { "support" -> if (en) "Please contact platform support." else "如需帮助，请联系平台客服。"; "security" -> if (en) "Account security settings will be available in a later release." else "账号安全设置功能将在后续版本接入。"; "tutorial" -> if (en) "Follow task instructions and submit valid evidence." else "请按照任务说明完成操作，并提交真实有效的任务凭证供平台审核。"; else -> if (en) "Current version: 1.4.5" else "当前已是版本 1.4.5。" }) }, confirmButton = { TextButton(onClick = { dialog = "" }) { Text(if (en) "OK" else "知道了") } })
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
    val valid = current.isNotBlank() && newPassword.length >= 8 && newPassword == confirm
    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6))) {
        SubPageHeader(if (en) "Change password" else "修改密码", onBack, language)
        Card(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp)) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                Text(if (en) "Change password" else "修改密码", color = Color(0xFF17243A), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                @Composable fun passwordField(value: String, label: String, visible: Boolean, onVisible: () -> Unit, onValue: (String) -> Unit) {
                    OutlinedTextField(value = value, onValueChange = onValue, modifier = Modifier.fillMaxWidth(), placeholder = { Text(label, color = Color(0xFF71877D)) }, singleLine = true, shape = RoundedCornerShape(5.dp), visualTransformation = if (visible) androidx.compose.ui.text.input.VisualTransformation.None else androidx.compose.ui.text.input.PasswordVisualTransformation(), trailingIcon = { IconButton(onClick = onVisible) { Icon(if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility, if (en) "Show password" else "显示密码", tint = Color(0xFF71877D)) } }, colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = Color(0xFFE1EAE5), focusedBorderColor = Color(0xFF8BB9A6)))
                }
                passwordField(current, if (en) "Current password" else "当前密码", showCurrent, { showCurrent = !showCurrent }) { current = it; message = "" }
                passwordField(newPassword, if (en) "New password" else "新密码", showNew, { showNew = !showNew }) { newPassword = it; message = "" }
                passwordField(confirm, if (en) "Confirm new password" else "确认新密码", showConfirm, { showConfirm = !showConfirm }) { confirm = it; message = "" }
                Button(onClick = { message = if (newPassword.length < 8) { if (en) "Password must be at least 8 characters" else "新密码至少需要8位" } else if (newPassword != confirm) { if (en) "Passwords do not match" else "两次输入的新密码不一致" } else { if (en) "Password change service is not connected yet" else "密码修改接口尚未接入，暂不能提交" } }, enabled = valid, modifier = Modifier.fillMaxWidth().height(46.dp), shape = RoundedCornerShape(28.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF278666), disabledContainerColor = Color(0xFFE9ECEB), disabledContentColor = Color(0xFFB5C1BC))) {
                    Text(if (en) "Confirm change" else "确认修改", fontWeight = FontWeight.SemiBold)
                }
                if (message.isNotBlank()) Text(message, color = Color(0xFFD04444), style = MaterialTheme.typography.bodySmall)
                Text(if (en) "After changing your password, all login sessions will be invalidated. Please sign in again with your new password." else "密码修改成功后，所有登录会话将失效，需要使用新密码重新登录。", color = Color(0xFF71877D), style = MaterialTheme.typography.bodySmall)
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
        Text(if (en) "Language settings" else "语言设置", modifier = Modifier.padding(start = 18.dp, top = 18.dp, bottom = 12.dp), color = Color(0xFF405A50), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
        Card(Modifier.fillMaxWidth().padding(horizontal = 4.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(10.dp)) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 8.dp)) {
                listOf("system" to if (en) "Follow system" else "跟随系统", "zh-CN" to "简体中文", "en" to "English").forEach { (value, label) ->
                    Row(Modifier.fillMaxWidth().clickable { selected = value; onLanguageChanged(value) }.padding(vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = selected == value, onClick = { selected = value; onLanguageChanged(value) }, colors = RadioButtonDefaults.colors(selectedColor = Color(0xFF278666), unselectedColor = Color(0xFF71877D)))
                        Spacer(Modifier.width(8.dp))
                        Text(label, color = Color(0xFF405A50), style = MaterialTheme.typography.titleMedium)
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
                Text(if (en) "Screen capture permission is not permanent. It can be reused during the same task session; after the session ends, authorization is required again." else "屏幕截图不是长期权限，同一任务截图会话内可复用授权；会话停止后需要重新授权", color = Color(0xFF71877D), style = MaterialTheme.typography.bodyMedium)
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
        IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF52665D)) }
        Spacer(Modifier.weight(1f))
        Text(title, color = Color(0xFF405A50), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.weight(1f))
        Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF71877D), modifier = Modifier.padding(horizontal = 8.dp))
        Icon(Icons.Default.Language, null, tint = Color(0xFF71877D), modifier = Modifier.padding(horizontal = 8.dp))
    }
}

@Composable
private fun PermissionLine(label: String, value: String, enabled: Boolean?) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(label, color = Color(0xFF71877D), style = MaterialTheme.typography.bodyLarge)
        Text(value, color = if (enabled == false) Color(0xFFB36B32) else Color(0xFF405A50), fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleSmall)
    }
}

@Composable
private fun ProfileAsset(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String, tint: Color, modifier: Modifier = Modifier, onClick: () -> Unit = {}) {
    Column(modifier.clickable(onClick = onClick).padding(horizontal = 3.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Surface(color = Color(0xFFF0F7F3), shape = RoundedCornerShape(50)) { Icon(icon, null, tint = tint, modifier = Modifier.padding(10.dp).size(22.dp)) }
        Text(label, color = Color(0xFF667085), style = MaterialTheme.typography.labelSmall, maxLines = 1)
        Text(value, color = Color(0xFF17243A), fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun ProfileMenuRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String, onClick: () -> Unit, status: Boolean? = null, showDivider: Boolean = true) {
    Column {
        Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(color = Color(0xFFF0F7F3), shape = RoundedCornerShape(10.dp)) { Icon(icon, null, tint = Color(0xFF347B62), modifier = Modifier.padding(10.dp).size(22.dp)) }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) { Text(title, color = Color(0xFF17243A), fontWeight = FontWeight.SemiBold); Text(subtitle, color = if (status == true) Color(0xFF278666) else Color(0xFF718096), style = MaterialTheme.typography.bodySmall) }
            Icon(Icons.Default.ChevronRight, null, tint = Color(0xFF667085))
        }
        if (showDivider) HorizontalDivider(color = Color(0xFFE8EDF0))
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
private fun WalletScreen(
    modifier: Modifier = Modifier,
    language: String,
    onApplyWithdraw: () -> Unit,
    onPayoutAccounts: () -> Unit,
    onWithdrawalHistory: () -> Unit,
    onWithdrawalGuide: () -> Unit,
    onInviteFriends: () -> Unit,
    onWalletDetails: () -> Unit,
    onLanguageChanged: (String) -> Unit
) {
    val isEnglish = language == "en"
    var summary by remember { mutableStateOf<JSONObject?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var balanceVisible by rememberSaveable { mutableStateOf(true) }
    var languageMenuOpen by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        runCatching { withContext(Dispatchers.IO) { AuthRepository.promotionSummary() } }
            .onSuccess { summary = it }
            .onFailure { error = it.message }
    }
    val balanceItem = summary?.optJSONArray("availableBalances")?.optJSONObject(0)
    val currency = balanceItem?.optString("currency", "USD") ?: "USD"
    val minor = balanceItem?.optString("amountMinor", "0")?.toBigDecimalOrNull() ?: java.math.BigDecimal.ZERO
    val balance = String.format(java.util.Locale.US, "%.3f", minor.divide(java.math.BigDecimal(100)))
    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6)).verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Surface(color = Color.White, shape = RoundedCornerShape(24.dp)) { Text((if (isEnglish) "Withdraw  " else "提现  ") + balance, Modifier.padding(horizontal = 12.dp, vertical = 8.dp), color = Color(0xFF278666), fontWeight = FontWeight.Bold) }
            Text(if (isEnglish) "Wallet" else "钱包", color = Color(0xFF26352D), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { }) {
                    Icon(Icons.Default.HeadsetMic, contentDescription = if (isEnglish) "Support" else "客服", tint = Color(0xFF71877D))
                }
                Box {
                    IconButton(onClick = { languageMenuOpen = true }) {
                        Icon(Icons.Default.Language, contentDescription = if (isEnglish) "Language" else "语言", tint = Color(0xFF71877D))
                    }
                    DropdownMenu(expanded = languageMenuOpen, onDismissRequest = { languageMenuOpen = false }) {
                        DropdownMenuItem(text = { Text("简体中文") }, onClick = {
                            languageMenuOpen = false
                            scope.launch {
                                runCatching { withContext(Dispatchers.IO) { AuthRepository.updateLocale("zh-CN") } }
                                onLanguageChanged("zh-CN")
                            }
                        })
                        DropdownMenuItem(text = { Text("English") }, onClick = {
                            languageMenuOpen = false
                            scope.launch {
                                runCatching { withContext(Dispatchers.IO) { AuthRepository.updateLocale("en") } }
                                onLanguageChanged("en")
                            }
                        })
                    }
                }
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFD5F77A)), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Surface(color = Color(0xFFEAF8B9), shape = RoundedCornerShape(20.dp)) {
                            Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(if (isEnglish) "Available balance ($currency)" else "可提现余额 ($currency)", color = Color(0xFF52633A), style = MaterialTheme.typography.labelMedium)
                                IconButton(onClick = { balanceVisible = !balanceVisible }, modifier = Modifier.size(22.dp)) {
                                    Icon(if (balanceVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff, null, tint = Color(0xFF52633A), modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                    Button(onClick = onApplyWithdraw, colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color(0xFF24351D))) { Text(if (isEnglish) "Withdraw  ›" else "申请提现  ›") }
                }
                Text(if (balanceVisible) "$" + balance else "••••••", color = Color(0xFF1F2C17), fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.headlineLarge)
                Row(Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(14.dp)).padding(vertical = 14.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    WalletMiniMetric(Modifier.weight(1f), if (isEnglish) "Pending (USD)" else "提现待释放 (USD)", "0.000", Color(0xFF80C91A))
                    Box(Modifier.width(1.dp).height(34.dp).background(Color(0xFFE8EDF0)))
                    WalletMiniMetric(Modifier.weight(1f), if (isEnglish) "Frozen (USD)" else "风险冻结 (USD)", "0.000", Color(0xFFFF7A1A))
                    Box(Modifier.width(1.dp).height(34.dp).background(Color(0xFFE8EDF0)))
                    WalletMiniMetric(Modifier.weight(1f), if (isEnglish) "Processing (USD)" else "提现中 (USD)", "0.000", Color(0xFF4388FF))
                }
                Text((if (isEnglish) "Total income: " else "累计收入：") + "0.000 $currency", color = Color(0xFF73834E), style = MaterialTheme.typography.bodySmall)
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(if (isEnglish) "Wallet details" else "钱包明细", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Text(
                        if (isEnglish) "All details  ›" else "全部明细  ›",
                        color = Color(0xFF397A32),
                        modifier = Modifier.clickable(onClick = onWalletDetails)
                    )
                }
                Column(
                    Modifier.fillMaxWidth().height(164.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(Icons.Default.AccountBalanceWallet, null, tint = Color(0xFF667085), modifier = Modifier.size(36.dp))
                    Spacer(Modifier.height(12.dp))
                    Text(if (isEnglish) "No wallet transactions" else "暂无钱包流水", color = Color(0xFF455B52), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    Text(error ?: if (isEnglish) "Approved rewards will appear here" else "审核通过的奖励会显示在这里", color = Color(0xFF789087), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (isEnglish) "Withdrawal services" else "提现服务", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                WalletServiceRow(Icons.Default.CreditCard, if (isEnglish) "Payout account" else "收款账户", if (isEnglish) "Not set" else "未设置", Color(0xFFEAF7CE), Color(0xFF4F7D2B), onClick = onPayoutAccounts)
                HorizontalDivider(color = Color(0xFFEEF1F3))
                WalletServiceRow(Icons.Default.ReceiptLong, if (isEnglish) "Withdrawal history" else "提现记录", if (isEnglish) "View withdrawal history" else "查看您的提现历史", Color(0xFFE7F1FF), Color(0xFF2584F4), onClick = onWithdrawalHistory)
                HorizontalDivider(color = Color(0xFFEEF1F3))
                WalletServiceRow(Icons.Default.Schedule, if (isEnglish) "Withdrawal guide" else "提现说明", if (isEnglish) "Rules and instructions" else "了解提现规则与说明", Color(0xFFFFF0E1), Color(0xFFFF8A22), onClick = onWithdrawalGuide)
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFF3FBE5)), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().clickable(onClick = onInviteFriends).padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Groups, null, tint = Color(0xFF47752B))
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(if (isEnglish) "Invite friends to earn" else "邀请好友做任务", fontWeight = FontWeight.Bold)
                    Text(if (isEnglish) "Earn extra rewards when friends complete tasks" else "好友完成任务，您可获得额外奖励", color = Color(0xFF718096), style = MaterialTheme.typography.bodySmall)
                }
                Surface(color = Color.White, shape = RoundedCornerShape(20.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFD8EFAE))) {
                    Row(Modifier.padding(horizontal = 12.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(if (isEnglish) "Invite" else "去邀请", color = Color(0xFF47752B), fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelMedium)
                        Icon(Icons.Default.ChevronRight, null, tint = Color(0xFF47752B), modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun WalletDetailsScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit) {
    val isEnglish = language == "en"
    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6))) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF52665D)) }
            Spacer(Modifier.weight(1f))
            Text(if (isEnglish) "Wallet details" else "钱包明细", fontWeight = FontWeight.Bold, color = Color(0xFF405A50))
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF71877D))
        }
        Card(
            Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(Modifier.fillMaxWidth().height(122.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text(if (isEnglish) "No wallet transactions" else "暂无钱包流水", color = Color(0xFF455B52), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                Text(if (isEnglish) "Approved rewards will appear here" else "审核通过的奖励会显示在这里", color = Color(0xFF789087), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun WithdrawalHistoryScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit) {
    val isEnglish = language == "en"
    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6))) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF52665D)) }
            Spacer(Modifier.weight(1f))
            Text(if (isEnglish) "Withdrawal history" else "提现记录", fontWeight = FontWeight.Bold, color = Color(0xFF405A50))
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF71877D))
        }
        Card(
            Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(Modifier.fillMaxWidth().height(120.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text(if (isEnglish) "No withdrawal records" else "暂无提现记录", color = Color(0xFF455B52), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                Text(if (isEnglish) "Submit a withdrawal request to track its progress here" else "提交提现申请后，可在这里查看进度", color = Color(0xFF789087), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun WithdrawalGuideScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit) {
    val isEnglish = language == "en"
    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6))) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF52665D)) }
            Spacer(Modifier.weight(1f))
            Text(if (isEnglish) "Withdrawal guide" else "提现说明", fontWeight = FontWeight.Bold, color = Color(0xFF405A50))
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF71877D))
        }
        Card(Modifier.fillMaxWidth().padding(18.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(12.dp)) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(if (isEnglish) "Withdrawal instructions" else "提现说明", color = Color(0xFF405A50), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
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
    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6))) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF52665D)) }
            Spacer(Modifier.weight(1f))
            Text(if (isEnglish) "Payout accounts" else "收款账户", fontWeight = FontWeight.Bold, color = Color(0xFF405A50))
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF71877D))
        }
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Button(onClick = onAdd, modifier = Modifier.fillMaxWidth().height(56.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF278666))) {
                Icon(Icons.Default.Add, null)
                Spacer(Modifier.width(8.dp))
                Text(if (isEnglish) "Add account" else "新增账户", fontWeight = FontWeight.Bold)
            }
            Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.fillMaxWidth().height(124.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Text(if (isEnglish) "No payout accounts" else "暂无收款账户", color = Color(0xFF455B52), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    Text(if (isEnglish) "Add a payout account to request withdrawals" else "添加收款账户后即可申请提现", color = Color(0xFF789087))
                }
            }
        }
    }
}

@Composable
private fun AddPayoutAccountScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit, onSaved: () -> Unit) {
    val isEnglish = language == "en"
    var country by rememberSaveable { mutableStateOf("Pakistan · PKR") }
    var method by rememberSaveable { mutableStateOf("JazzCash") }
    var account by rememberSaveable { mutableStateOf("") }
    var holder by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var countryExpanded by remember { mutableStateOf(false) }
    var methodExpanded by remember { mutableStateOf(false) }
    val valid = account.matches(Regex("^03[0-9]{9}$"))
    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6))) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF52665D)) }
            Spacer(Modifier.weight(1f))
            Text(if (isEnglish) "Payout accounts" else "收款账户", fontWeight = FontWeight.Bold, color = Color(0xFF405A50))
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF71877D))
        }
        Column(Modifier.fillMaxWidth().padding(18.dp).background(Color.White, RoundedCornerShape(18.dp)).padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Surface(color = Color(0xFFE2F5ED), shape = RoundedCornerShape(50)) { Icon(Icons.Default.Add, null, tint = Color(0xFF278666), modifier = Modifier.padding(8.dp)) }
                Text(if (isEnglish) "Add account" else "新增账户", fontWeight = FontWeight.Bold, color = Color(0xFF405A50), style = MaterialTheme.typography.titleMedium)
            }
            Text(if (isEnglish) "Select payout country" else "选择收款国家", color = Color(0xFF71877D), style = MaterialTheme.typography.bodySmall)
            Box {
                OutlinedButton(onClick = { countryExpanded = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Icon(Icons.Default.Language, null, tint = Color(0xFF278666))
                    Spacer(Modifier.width(12.dp))
                    Text(country, modifier = Modifier.weight(1f), color = Color(0xFF52665D))
                    Icon(Icons.Default.ArrowDropDown, null)
                }
                DropdownMenu(expanded = countryExpanded, onDismissRequest = { countryExpanded = false }) {
                    DropdownMenuItem(text = { Text("Pakistan · PKR") }, onClick = { country = "Pakistan · PKR"; countryExpanded = false })
                }
            }
            Text(if (isEnglish) "Payout method" else "收款方式", color = Color(0xFF71877D), style = MaterialTheme.typography.bodySmall)
            Box {
                OutlinedButton(onClick = { methodExpanded = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) {
                    Text(method, modifier = Modifier.weight(1f), color = Color(0xFF52665D))
                    Icon(Icons.Default.ArrowDropDown, null)
                }
                DropdownMenu(expanded = methodExpanded, onDismissRequest = { methodExpanded = false }) {
                    listOf("JazzCash", "EasyPaisa").forEach { item ->
                        DropdownMenuItem(text = { Text(item) }, onClick = { method = item; methodExpanded = false })
                    }
                }
            }
            OutlinedTextField(value = account, onValueChange = { account = it.filter(Char::isDigit).take(11) }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(12.dp), placeholder = { Text(if (isEnglish) "Payout account number *" else "收款账号 *") }, keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number))
            Text(if (isEnglish) "11 digits, starts with 03. Example: 03428888900. Enter your own account number." else "仅限 11 位数字（0–9），以 03 开头。示例：03428888900。请填写本人账号。", color = Color(0xFF789087), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 8.dp))
            OutlinedTextField(value = holder, onValueChange = { holder = it }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(12.dp), placeholder = { Text(if (isEnglish) "Account holder (optional)" else "姓名（选填）") })
            OutlinedTextField(value = phone, onValueChange = { phone = it.filter(Char::isDigit).take(15) }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(12.dp), placeholder = { Text(if (isEnglish) "Phone number (optional)" else "手机号（选填）") }, keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Phone))
            Button(onClick = onSaved, enabled = valid, modifier = Modifier.fillMaxWidth().height(54.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF278666), disabledContainerColor = Color(0xFFB8D7CC))) {
                Text(if (isEnglish) "Save account" else "保存账户", fontWeight = FontWeight.Bold)
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
private fun CommissionHistoryScreen(modifier: Modifier = Modifier, language: String, onBack: () -> Unit) {
    val isEnglish = language == "en"
    var selected by rememberSaveable { mutableIntStateOf(0) }
    var summary by remember { mutableStateOf<JSONObject?>(null) }
    LaunchedEffect(Unit) {
        runCatching { withContext(Dispatchers.IO) { AuthRepository.promotionSummary() } }.onSuccess { summary = it }
    }
    fun amount(key: String): String {
        val totals = summary?.optJSONObject(key) ?: JSONObject()
        val currency = totals.keys().asSequence().firstOrNull() ?: "USD"
        val minor = totals.optString(currency, "0").toBigDecimalOrNull() ?: java.math.BigDecimal.ZERO
        return String.format(java.util.Locale.US, "%.3f %s", minor.divide(java.math.BigDecimal(100)), currency)
    }
    Column(modifier.fillMaxSize().background(Color(0xFFF2F4F6))) {
        Row(Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null, tint = Color(0xFF52665D)) }
            Spacer(Modifier.weight(1f))
            Text(if (isEnglish) "Commission history" else "佣金记录", fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Icon(Icons.Default.HeadsetMic, null, tint = Color(0xFF71877D))
        }
        Row(Modifier.fillMaxWidth().background(Color.White), horizontalArrangement = Arrangement.SpaceEvenly) {
            listOf(if (isEnglish) "All" else "全部", if (isEnglish) "Pending" else "等待处理", if (isEnglish) "Credited" else "已入账").forEachIndexed { index, label ->
                Column(Modifier.weight(1f).clickable { selected = index }.padding(vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(label, color = if (selected == index) Color(0xFF278666) else Color(0xFF667085), fontWeight = if (selected == index) FontWeight.Bold else FontWeight.Normal)
                    Spacer(Modifier.height(8.dp))
                    if (selected == index) Box(Modifier.width(54.dp).height(3.dp).background(Color(0xFF278666), RoundedCornerShape(4.dp)))
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CommissionSummaryCard(Modifier.weight(1f), if (isEnglish) "Total commission" else "累计佣金", amount("totalCommissions"), Icons.Default.AccountBalanceWallet)
            CommissionSummaryCard(Modifier.weight(1f), if (isEnglish) "This month" else "本月佣金", amount("monthCommissions"), Icons.Default.CalendarMonth)
            CommissionSummaryCard(Modifier.weight(1f), if (isEnglish) "Pending" else "历史待处理佣金", "0.000 USD", Icons.Default.Schedule)
        }
        Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(vertical = 34.dp, horizontal = 18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(Icons.Default.AccountBalanceWallet, null, tint = Color(0xFF667085), modifier = Modifier.size(34.dp))
                Text(if (isEnglish) "No commission records" else "暂无佣金记录", color = Color(0xFF17243A), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                Text(if (isEnglish) "Commissions will appear here after eligible invited tasks are reviewed and settled." else "符合条件的受邀任务审核并结算后，佣金会显示在这里。", color = Color(0xFF667085), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
        }
    }
}

@Composable
private fun CommissionSummaryCard(modifier: Modifier, title: String, value: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Card(modifier, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.fillMaxWidth().padding(vertical = 14.dp, horizontal = 5.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Surface(color = Color(0xFFEEF6F2), shape = RoundedCornerShape(50)) { Icon(icon, null, tint = Color(0xFF278666), modifier = Modifier.padding(9.dp).size(20.dp)) }
            Text(title, color = Color(0xFF667085), style = MaterialTheme.typography.labelSmall, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            Text(value, color = Color(0xFF278666), fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall, maxLines = 1)
        }
    }
}

@Composable
private fun PromotionScreen(modifier: Modifier = Modifier, language: String, onWalletClick: () -> Unit, onCommissionClick: () -> Unit) {
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
