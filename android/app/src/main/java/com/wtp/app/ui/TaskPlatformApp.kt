package com.wtp.app.ui

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.media.projection.MediaProjectionManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
            0 -> HomeDashboardScreen(Modifier.padding(padding))
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
private fun HomeDashboardScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<JSONObject?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var overlay by remember { mutableStateOf(Settings.canDrawOverlays(context)) }
    var capture by rememberSaveable { mutableStateOf(false) }
    var permissionStep by remember { mutableIntStateOf(0) }

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
                    Text("提现", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.background(sky, RoundedCornerShape(28.dp)).padding(horizontal = 14.dp, vertical = 9.dp))
                    Spacer(Modifier.width(10.dp))
                    Text(formatMoney(firstBalance(data)), color = ink, fontWeight = FontWeight.Bold)
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
            Row(Modifier.fillMaxWidth().padding(vertical = 18.dp, horizontal = 8.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                Metric("今日已结算", data?.optJSONObject("stats")?.optInt("settledToday")?.toString() ?: if (loading) "…" else "0")
                VerticalDivider(Modifier.height(42.dp), color = Color(0xFFE6ECF1))
                Metric("待审核", data?.optJSONObject("stats")?.optInt("pendingReview")?.toString() ?: if (loading) "…" else "0")
                VerticalDivider(Modifier.height(42.dp), color = Color(0xFFE6ECF1))
                Metric("可提现", formatMoney(firstBalance(data)))
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(14.dp)) {
            Text("推广奖励以平台规则和真实审核结果为准", Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 18.dp), color = sky, fontWeight = FontWeight.Medium)
        }

        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("任务推荐", color = ink, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                val tasks = data?.optJSONArray("tasks")
                if (loading && tasks == null) CircularProgressIndicator(color = sky)
                else if (tasks == null || tasks.length() == 0) Text("目前没有可展示的已发布任务", color = muted)
                else for (i in 0 until tasks.length()) {
                    val item = tasks.optJSONObject(i) ?: continue
                    Surface(color = Color(0xFFF5FAFD), shape = RoundedCornerShape(12.dp)) {
                        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Text(item.optString("title"), color = ink, fontWeight = FontWeight.Bold)
                            Text(item.optString("description"), color = muted)
                            Text("奖励：${item.optString("currency")} ${item.optString("rewardMinor")}（最小货币单位）", color = sky)
                            Text("已领取：${item.optInt("claimedCount")} / ${item.optInt("capacity")}", color = muted)
                        }
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Surface(color = paleSky, shape = RoundedCornerShape(10.dp)) { Text("● 可查看", Modifier.padding(horizontal = 12.dp, vertical = 8.dp), color = Color(0xFF1685B8)) }
                    Button(onClick = { /* Task claiming is intentionally implemented in the task module. */ }, colors = ButtonDefaults.buttonColors(containerColor = sky), shape = RoundedCornerShape(12.dp)) {
                        Text("开始任务  ▷", color = Color.White)
                    }
                }
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
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
                Column(horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Default.PersonAdd, null, tint = Color(0xFFFF8A24), modifier = Modifier.size(30.dp)); Text("邀请好友", color = ink, fontWeight = FontWeight.Bold); Text("赚取更多奖励", color = muted) }
                Column(horizontalAlignment = Alignment.CenterHorizontally) { Icon(Icons.Default.AccountBalanceWallet, null, tint = Color(0xFF1685B8), modifier = Modifier.size(30.dp)); Text("收款账户", color = ink, fontWeight = FontWeight.Bold); Text("管理账户", color = muted) }
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = paleSky), shape = RoundedCornerShape(16.dp)) {
            Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(color = Color.White, shape = RoundedCornerShape(40.dp)) { Icon(Icons.Default.CardGiftcard, null, tint = sky, modifier = Modifier.padding(12.dp).size(28.dp)) }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) { Text("立即开始任务", color = Color(0xFF1685B8), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold); Text("快速开始，完成任务赚取收益", color = muted) }
                Surface(color = sky, shape = RoundedCornerShape(40.dp)) { Icon(Icons.Default.PlayArrow, null, tint = Color.White, modifier = Modifier.padding(12.dp).size(28.dp)) }
            }
        }
        TextButton(onClick = { load() }, modifier = Modifier.fillMaxWidth()) { Text("刷新首页数据", color = sky) }
    }

    LifecycleEventEffect(androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
        overlay = Settings.canDrawOverlays(context)
        if (permissionStep == 1 && overlay) {
            permissionStep = 2
            captureLauncher.launch(context.getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent())
        }
    }
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
private fun formatMoney(minor: String): String = minor

@Composable
private fun SimpleScreen(title: String, description: String, modifier: Modifier = Modifier) {
    Column(modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { Text(title, style = MaterialTheme.typography.headlineSmall); Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant) }
}
