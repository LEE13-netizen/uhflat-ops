# 아티팩트 원본(artifact/) + 웹 전용 파일(web/) → 배포용 사이트(index.html, js/)를 만든다.
# 사용: 이 폴더에서  powershell -ExecutionPolicy Bypass -File .\sync.ps1
# artifact/ 는 claude.ai 아티팩트에서 받은 그대로 두고 손으로 고치지 않는다.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$art = Join-Path $root "artifact"
$utf8 = New-Object System.Text.UTF8Encoding($false)
function ReadText($p) { [IO.File]::ReadAllText($p, $utf8) }
function WriteText($p, $t) { [IO.File]::WriteAllText($p, $t, $utf8) }

if (-not (Test-Path "$art\index.html")) { throw "artifact\index.html 이 없습니다. 아티팩트 파일을 먼저 받아 주십시오." }

# 1) 공통 업무 코드: artifact/js → js (그대로 복사)
$js = Join-Path $root "js"
if (Test-Path $js) { Get-ChildItem $js -Filter *.js | Remove-Item -Force }
New-Item -ItemType Directory -Force $js | Out-Null
Copy-Item "$art\js\*.js" $js

# 2) app.js 웹 전용 수정(부서 고정). 기준 문장이 정확히 한 번씩 있어야 한다 — 없으면 멈춘다
$app = Join-Path $js "app.js"
$t = ReadText $app
$patches = @(
  @{ name = "부서 고정 함수";
     from = '  if (!OPS.DEPTS.some(d => d.id === st.role)) st.role = "FO";';
     to   = "  // [web] 웹 로그인: 부서 계정은 자기 부서로 고정, 프로그램 관리자만 모든 부서`n  const canRole = id => !OPS.Auth || OPS.Auth.allowed.includes(id);`n  if (!OPS.DEPTS.some(d => d.id === st.role) || !canRole(st.role)) st.role = OPS.Auth ? OPS.Auth.dept : `"FO`";" },
  @{ name = "부서 버튼 표시";
     from = '$("roles").innerHTML = OPS.DEPTS.map(d => {';
     to   = '$("roles").innerHTML = OPS.DEPTS.filter(d => canRole(d.id)).map(d => {' },
  @{ name = "부서 버튼 클릭";
     from = 'if (r) { st.role = r.dataset.role; fitTab();';
     to   = 'if (r) { if (!canRole(r.dataset.role)) { flash(OPS.deptName(OPS.Auth.dept) + " 로그인은 다른 부서로 바꿀 수 없습니다. 잠금 후 해당 부서 PIN으로 들어오십시오."); return; } st.role = r.dataset.role; fitTab();' },
  @{ name = "주소(#) 부서 전환";
     from = 'h !== st.role) { st.role = h; fitTab(); render(); }';
     to   = 'h !== st.role && canRole(h)) { st.role = h; fitTab(); render(); }' }
)
$optional = @(
  @{ name = "판 이름";
     from = '+ OPS.VERSION + " · 1인 시험판";';
     to   = '+ OPS.VERSION + (OPS.Auth ? " · 웹" : " · 1인 시험판");' }
)
foreach ($p in $patches) {
  $n = ([regex]::Matches($t, [regex]::Escape($p.from))).Count
  if ($n -ne 1) { throw "app.js 수정 위치를 찾지 못했습니다: $($p.name) (찾은 수 $n). 아티팩트 코드가 바뀌었으니 sync.ps1의 기준 문장을 고쳐야 합니다." }
  $t = $t.Replace($p.from, $p.to)
}
foreach ($p in $optional) {
  if ($t.Contains($p.from)) { $t = $t.Replace($p.from, $p.to) } else { Write-Warning "선택 수정 건너뜀: $($p.name)" }
}
WriteText $app $t

# 3) index.html: 아티팩트 화면 틀 + PIN 화면 + Supabase
$h = ReadText "$art\index.html"
$srcs = [regex]::Matches($h, '<script src="(js/[^"]+)"></script>') | ForEach-Object { $_.Groups[1].Value }
if (-not ($srcs -contains "js/store.js") -or -not ($srcs -contains "js/app.js")) { throw "index.html에서 js/store.js 또는 js/app.js를 찾지 못했습니다." }
$list = @()
foreach ($s in $srcs) { $list += $s; if ($s -eq "js/store.js") { $list += "web/store-supabase.js" } }
$h = [regex]::Replace($h, '[ \t]*<script src="js/[^"]+"></script>\r?\n?', '')
if (([regex]::Matches($h, '<body>')).Count -ne 1) { throw "index.html의 <body>를 찾지 못했습니다." }
$h = $h.Replace('<body>', '<body class="locked">')
$h = $h.Replace('</head>', "<link rel=`"stylesheet`" href=`"web/web.css`">`n</head>")
$listJs = ($list | ForEach-Object { '"' + $_ + '"' }) -join ","
$tail = @"
<div id="gate" class="gate"><div class="gbox"><div class="glogo">OPS<small>통합 업무 시스템</small></div><div class="gmsg">불러오는 중…</div></div></div>
<script>window.OPS_APP_SCRIPTS=[$listJs];</script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
<script src="web/config.js"></script>
<script src="web/auth.js"></script>
</body>
"@
$h = $h.Replace('</body>', $tail)
WriteText (Join-Path $root "index.html") $h

$ver = ([regex]::Match((ReadText "$js\model.js"), 'OPS\.VERSION\s*=\s*"([^"]+)"')).Groups[1].Value
Write-Output "완료: 아티팩트 $ver 기준으로 사이트를 만들었습니다. 스크립트 $($list.Count)개."
