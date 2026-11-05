from pathlib import Path
import re
import sys

file = Path("android/app/src/main/java/com/wtp/app/ui/TaskHallScreen.kt")
source = file.read_text(encoding="utf-8")

changes = []

def replace_once(pattern, replacement, label):
    global source
    updated, count = re.subn(pattern, replacement, source, count=1, flags=re.MULTILINE | re.DOTALL)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, got {count}")
    source = updated
    changes.append(label)

# 1. Countdown callback parameter
replace_once(
    r'private fun TaskCountdownBadge\(expiresAt: String, isEnglish: Boolean\) \{',
    'private fun TaskCountdownBadge(expiresAt: String, isEnglish: Boolean, onExpired: () -> Unit) {',
    "countdown function signature"
)

# 2. One-shot notification state, strictly after remember block
replace_once(
    r'(    var remainingSeconds by remember\(expiryMillis\) \{\n        mutableStateOf\([^\n]+\)\n    \})\n\n    LaunchedEffect\(expiryMillis\) \{',
    r'\1\n    var expiryNotified by remember(expiryMillis) { mutableStateOf(false) }\n\n    LaunchedEffect(expiryMillis) {',
    "countdown notification state"
)

# 3. Notify once after countdown reaches zero
replace_once(
    r'(        remainingSeconds = \(\(expiryMillis - System\.currentTimeMillis\(\)\) / 1000\)\.coerceAtLeast\(0\))\n    \}\n\n    Surface\(',
    r'\1\n        if (expiryMillis > 0L && remainingSeconds <= 0L && !expiryNotified) {\n            expiryNotified = true\n            onExpired()\n        }\n    }\n\n    Surface(',
    "countdown expiry callback"
)

# 4. Add refresh callback to both card call sites
replace_once(
    r'(notice = if \(isEnglish\) "This task is selected for evidence capture\." else "已将该任务设为当前截图提交任务。"\n\s*\})\n(\s*\))',
    r'\1,\n                                onCountdownExpired = { refresh() }\n\2',
    "in-progress card refresh"
)

replace_once(
    r'(notice = if \(isEnglish\) "This task is selected for resubmission\." else "已选择此任务，可返回 WhatsApp 重新处理。"\n\s*\})\n(\s*\))',
    r'\1,\n                                onCountdownExpired = { refresh() }\n\2',
    "rejected card refresh"
)

# 5. Add callback to card function
replace_once(
    r'(    onViewDetails: \(\) -> Unit,\n    onGoWhatsApp: \(\) -> Unit,\n    onSelect: \(\) -> Unit)\n',
    r'    onViewDetails: () -> Unit,\n    onGoWhatsApp: () -> Unit,\n    onSelect: () -> Unit,\n    onCountdownExpired: () -> Unit\n',
    "card callback parameter"
)

# 6. Local protection state
replace_once(
    r'    val phone = claim\.optString\("assignedPhoneNumber"\)\n    val canOpen = status in setOf\("CLAIMED", "IN_PROGRESS", "REJECTED"\) &&\n        \(submission == null \|\| submission\.optString\("status"\) == "REJECTED"\)',
    '    val phone = claim.optString("assignedPhoneNumber")\n'
    '    var countdownExpired by remember(claim.optString("id")) { mutableStateOf(false) }\n'
    '    val canOpen = !countdownExpired &&\n'
    '        status in setOf("CLAIMED", "IN_PROGRESS", "REJECTED") &&\n'
    '        (submission == null || submission.optString("status") == "REJECTED")',
    "local expiry protection"
)

# 7. Connect badge callback
replace_once(
    r'(?m)^(\s*)TaskCountdownBadge\(expiresAt = expiresAt, isEnglish = isEnglish\)$',
    r'\1TaskCountdownBadge(\n'
    r'\1    expiresAt = expiresAt,\n'
    r'\1    isEnglish = isEnglish,\n'
    r'\1    onExpired = {\n'
    r'\1        if (!countdownExpired) {\n'
    r'\1            countdownExpired = true\n'
    r'\1            onCountdownExpired()\n'
    r'\1        }\n'
    r'\1    }\n'
    r'\1)',
    "badge callback connection"
)

# 8. Disable detail button only in this card
replace_once(
    r'(\s+onClick = onViewDetails,\n\s+modifier = Modifier\.weight\(1f\),\n\s+enabled = )!busy,',
    r'\1!busy && !countdownExpired,',
    "disable expired detail button"
)

# 9. Disable WhatsApp button only in this card
replace_once(
    r'(\s+enabled = )!busy && phone\.isNotBlank\(\) && phone != "null",',
    r'\1!busy && !countdownExpired && phone.isNotBlank() && phone != "null",',
    "disable expired WhatsApp button"
)

# Validate expected results before writing anything
checks = {
    "callback parameter": "onCountdownExpired: () -> Unit",
    "notification state": "var expiryNotified by remember(expiryMillis)",
    "local expiry state": 'var countdownExpired by remember(claim.optString("id"))',
    "callback invocation": "onExpired()",
    "refresh call": "onCountdownExpired = { refresh() }",
    "disabled detail": "!busy && !countdownExpired",
    "disabled WhatsApp": "!countdownExpired && phone.isNotBlank()",
}

for label, token in checks.items():
    if token not in source:
        raise RuntimeError(f"Validation failed: {label}")

if source.count("onCountdownExpired = { refresh() }") != 2:
    raise RuntimeError("Expected exactly two refresh callbacks")

if source.count("TaskCountdownBadge(") != 2:
    raise RuntimeError("Unexpected countdown badge call count")

print("PREVIEW ONLY: all transformations and validations passed.")
print("Changes:")
for item in changes:
    print(" -", item)
print("Original file has NOT been modified.")
