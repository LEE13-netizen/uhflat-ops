# 아티팩트에서 바꾼 화면을 웹판으로 옮긴다.
# 사용: powershell -ExecutionPolicy Bypass -File tools\port-artifact.ps1 -From <아티팩트 파일을 받은 폴더>
#  - <폴더>\index.html, <폴더>\js\*.js 를 기준으로 웹판 index.html, js\ 를 다시 만든다.
#  - 웹 전용(web\) 파일은 그대로 두고, js\app.js 에 웹 수정([web])을 덧입힌다.
#  - 기준 문장이 정확히 한 번씩 없으면 멈춘다(아티팩트 코드가 바뀌어 수정 위치를 다시 잡아야 함).
param([Parameter(Mandatory = $true)][string]$From)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$utf8 = New-Object System.Text.UTF8Encoding($false)
function ReadText($p) { [IO.File]::ReadAllText($p, $utf8) }
function WriteText($p, $t) { [IO.File]::WriteAllText($p, $t, $utf8) }
if (-not (Test-Path "$From\index.html") -or -not (Test-Path "$From\js\app.js")) { throw "$From 에 index.html 과 js\app.js 가 있어야 합니다." }

# 1) 아티팩트 js 파일 복사(없는 파일은 기존 것 유지)
$js = Join-Path $root "js"
Get-ChildItem "$From\js" -Filter *.js | ForEach-Object { Copy-Item $_.FullName (Join-Path $js $_.Name) -Force }

# 2) app.js 웹 수정
$app = Join-Path $js "app.js"
$t = ReadText $app
$patches = @(
  @{ name = "시작 부서 고정";
     from = '  if (!OPS.DEPTS.some(d => d.id === st.role)) st.role = "FO";';
     to   = "  // [web] 웹 로그인: 허용된 부서만(프로그램 관리자 = 모든 부서)`n  const canRole = id => !OPS.Auth || OPS.Auth.allowed.includes(id);`n  if (!OPS.DEPTS.some(d => d.id === st.role) || !canRole(st.role)) st.role = OPS.Auth ? OPS.Auth.dept : `"FO`";" },
  @{ name = "입구 화면 건너뛰기";
     from = '  try { if (!sessionStorage.getItem("opsEntered")) st.locked = true; } catch (e) {}';
     to   = "  try { if (!sessionStorage.getItem(`"opsEntered`")) st.locked = true; } catch (e) {}`n  if (OPS.Auth) st.locked = false;   // [web] PIN 로그인이 입구" },
  @{ name = "관리자 판단";
     from = '  const adminOk = () => !!st.uReady && (!UAPI || st.owner === true);';
     to   = '  const adminOk = () => OPS.Auth ? !!OPS.Auth.owner : (!!st.uReady && (!UAPI || st.owner === true));   // [web] 프로그램 관리자 계정만' },
  @{ name = "부서 버튼 표시";
     from = '$("roles").innerHTML = STAFF_DEPTS().map(d => {';
     to   = '$("roles").innerHTML = STAFF_DEPTS().filter(d => canRole(d.id)).map(d => {' },
  @{ name = "잠금 = 로그아웃";
     from = '  function lockOn(on) {';
     to   = "  function lockOn(on) {`n    if (on && OPS.Auth) { OPS.Auth.lock(); return; }   // [web] 잠금은 로그아웃(PIN 화면으로)" },
  @{ name = "부서 전환 제한";
     from = '  function switchRole(r) { st.role = r;';
     to   = '  function switchRole(r) { if (!canRole(r)) { flash(OPS.deptName(OPS.Auth.dept) + " 로그인은 다른 부서로 바꿀 수 없습니다. 잠금 후 해당 부서 계정으로 들어오십시오."); return; } st.role = r;   /* [web] */' },
  @{ name = "주소(#) 부서 전환";
     from = 'h !== st.role && (h !== "MG" || adminOk())) {';
     to   = 'h !== st.role && (h !== "MG" || adminOk()) && canRole(h)) {' }
)
$optional = @(
  @{ name = "판 이름"; from = '+ OPS.VERSION + " · 1인 시험판";'; to = '+ OPS.VERSION + (OPS.Auth ? " · 웹" : " · 1인 시험판");' },
  # 상단 메뉴 정리(web/header.js)와 짝: 밝기 표시를 근무 파트(주간·야간)와 헷갈리지 않는 말로
  @{ name = "밝기 표시 말";
     from = '${mode === "auto" ? (dark ? "야간 자동" : "주간 자동") : dark ? "야간" : "주간"}';
     to   = '${OPS.Auth ? (mode === "auto" ? "자동(" + (dark ? "어둡게" : "밝게") + ")" : dark ? "어둡게" : "밝게") : mode === "auto" ? (dark ? "야간 자동" : "주간 자동") : dark ? "야간" : "주간"}' },
  @{ name = "밝기 읽기 말";
     from = '(mode === "auto" ? "자동" : dark ? "야간 고정" : "주간 고정")';
     to   = '(mode === "auto" ? "자동" : dark ? (OPS.Auth ? "어둡게 고정" : "야간 고정") : (OPS.Auth ? "밝게 고정" : "주간 고정"))' },
  # 이름은 상단 "내 계정" 메뉴 한 곳에만: 부서 버튼에서는 부서만
  @{ name = "부서 버튼 이름 빼기";
     from = '${st.me ? " · " + esc(nameOf(st.me.id, $("myName").value.trim()) || "로그인") : ""}';
     to   = '${st.me && !OPS.Auth ? " · " + esc(nameOf(st.me.id, $("myName").value.trim()) || "로그인") : ""}' }
)
foreach ($p in $patches) {
  $n = ([regex]::Matches($t, [regex]::Escape($p.from))).Count
  if ($n -ne 1) { throw "app.js 수정 위치를 찾지 못했습니다: $($p.name) (찾은 수 $n)" }
  $t = $t.Replace($p.from, $p.to)
}
foreach ($p in $optional) { if ($t.Contains($p.from)) { $t = $t.Replace($p.from, $p.to) } else { Write-Warning "선택 수정 건너뜀: $($p.name)" } }
WriteText $app $t

# 3) index.html: 아티팩트 화면 틀 + 웹 로그인
$h = ReadText "$From\index.html"
$srcs = [regex]::Matches($h, '<script src="(js/[^"]+)"></script>') | ForEach-Object { $_.Groups[1].Value }
if (-not ($srcs -contains "js/store.js") -or -not ($srcs -contains "js/app.js")) { throw "index.html에서 js/store.js 또는 js/app.js를 찾지 못했습니다." }
$list = @(); foreach ($s in $srcs) { $list += $s; if ($s -eq "js/store.js") { $list += "web/store-supabase.js" } }
$h = [regex]::Replace($h, '[ \t]*<script src="js/[^"]+"></script>\r?\n?', '')
if (([regex]::Matches($h, '<body>')).Count -ne 1) { throw "index.html의 <body>를 찾지 못했습니다." }
$h = $h.Replace('<body>', '<body class="gated">')
$h = $h.Replace('</head>', "<link rel=`"stylesheet`" href=`"web/web.css`">`n</head>")
$listJs = ($list | ForEach-Object { '"' + $_ + '"' }) -join ","
$tail = @"
<div id="gate" class="gate"><div class="gbox"><div class="glogo">UHC<small>OPERATION SYSTEM · HOTEL INTEGRATED MANAGEMENT</small></div><div class="gmsg">불러오는 중…</div></div></div>
<script>window.OPS_APP_SCRIPTS=[$listJs];</script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
<script src="web/config.js"></script>
<script src="web/staff.js"></script>
<script src="web/header.js"></script>
<script src="web/auth.js"></script>
</body>
"@
$h = $h.Replace('</body>', $tail)
WriteText (Join-Path $root "index.html") $h

$ver = ([regex]::Match((ReadText "$js\model.js"), 'OPS\.VERSION\s*=\s*"([^"]+)"')).Groups[1].Value
Write-Output "완료: 아티팩트 $ver 를 웹판에 옮겼습니다. 스크립트 $($list.Count)개."
