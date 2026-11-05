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

    val captureLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        capture = result.resultCode == Activity.RESULT_OK && result.data != null
        permissionStep = 0
    }
    fun load() {
        scope.launch {
            loading = true; error = null
            try { data = withContext(Dispatchers.IO) { AuthRepository.dashboard() } }
            catch (e: Exception) { error = e.message ?: "首页数据加载失败" }
            finally { loading = false }
        }
    }
    LaunchedEffect(Unit) { load() }

    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Surface(color = Color.White, shape = RoundedCornerShape(30.dp)) {
                Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("提现", color = Color.White, modifier = Modifier.background(Color(0xFF35A9DF), RoundedCornerShape(20.dp)).padding(horizontal = 12.dp, vertical = 5.dp))
                    Spacer(Modifier.width(8.dp)); Text(formatMoney(firstBalance(data)), fontWeight = FontWeight.Bold)
                }
            }
            Text("首页", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("客服  ◎", color = MaterialTheme.colorScheme.primary)
        }
        if (error != null) Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF1F0))) {
            Column(Modifier.padding(14.dp)) { Text("首页数据暂时无法加载", color = Color(0xFFB42318), fontWeight = FontWeight.Bold); Text(error!!, color = Color(0xFFB42318)); TextButton(onClick = { load() }) { Text("重新加载") } }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFEAF7FD))) {
            Column(Modifier.padding(16.dp)) { Text("重要提醒", color = Color(0xFF187CA8), fontWeight = FontWeight.Bold); Spacer(Modifier.height(6.dp)); Text("请遵守 WhatsApp 使用规则，仅向已同意接收消息的用户开展任务。禁止骚扰信息、伪造任务证据或规避平台规则。", color = Color(0xFF24627D)) }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Row(Modifier.fillMaxWidth().padding(vertical = 18.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                Metric("今日已结算", data?.optJSONObject("stats")?.optInt("settledToday")?.toString() ?: "—")
                Metric("待审核", data?.optJSONObject("stats")?.optInt("pendingReview")?.toString() ?: "—")
                Metric("可提现", formatMoney(firstBalance(data)))
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White)) { Text("推广奖励以平台规则和真实审核结果为准", Modifier.padding(18.dp), color = Color(0xFF1685B8)) }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("任务推荐", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                if (loading) CircularProgressIndicator()
                val tasks = data?.optJSONArray("tasks")
                if (tasks == null || tasks.length() == 0) Text(if (loading) "正在加载任务…" else "目前没有可展示的已发布任务", color = MaterialTheme.colorScheme.onSurfaceVariant)
                else for (i in 0 until tasks.length()) {
                    val item = tasks.optJSONObject(i) ?: continue
                    HorizontalDivider()
                    Text(item.optString("title"), fontWeight = FontWeight.Bold)
                    Text(item.optString("description"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("奖励：${item.optString("currency")} ${item.optString("rewardMinor")}（最小货币单位）", color = MaterialTheme.colorScheme.primary)
                    Text("已领取：${item.optInt("claimedCount")} / ${item.optInt("capacity")}")
                }
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) { Text("▣", color = MaterialTheme.colorScheme.primary); Spacer(Modifier.width(12.dp)); Column { Text("任务使用教程", fontWeight = FontWeight.Bold); Text("了解任务规则、流程与注意事项", color = MaterialTheme.colorScheme.onSurfaceVariant) } }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("设备与权限状态", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                PermissionLine("悬浮窗权限", if (overlay) "已开启" else "未开启", overlay)
                PermissionLine("屏幕截图授权", if (capture) "本次已授权" else "尚未授权", capture)
                Button(onClick = {
                    if (!overlay) {
                        permissionStep = 1
                        context.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")))
                    } else {
                        val manager = context.getSystemService(MediaProjectionManager::class.java)
                        captureLauncher.launch(manager.createScreenCaptureIntent())
                    }
                }, modifier = Modifier.fillMaxWidth()) { Text(if (!overlay) "一键开启权限（第 1 步）" else "一键开启权限（截图授权）") }
                Text("Android 要求分别确认悬浮窗和屏幕捕获权限。截图授权仅对本次授权会话有效。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
            Row(Modifier.fillMaxWidth().padding(18.dp), horizontalArrangement = Arrangement.SpaceEvenly) { Text("邀请好友", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold); Text("收款账户", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold) }
        }
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) { Text("立即开始任务", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.Bold) }
        TextButton(onClick = { load() }, modifier = Modifier.fillMaxWidth()) { Text("刷新首页数据") }
    }

    androidx.lifecycle.LifecycleEventEffect(androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
        overlay = Settings.canDrawOverlays(context)
        if (permissionStep == 1 && overlay) {
            permissionStep = 2
            captureLauncher.launch(context.getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent())
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
