/* 영문 화면(외국인 근무자용). 기기마다 켜고 끈다.
   방식: 화면에 그려진 글자를 사전으로 바꿔 보여 준다. 저장되는 값(상태·품목·메모)은 한글 그대로라
   한글 화면과 영문 화면을 쓰는 사람이 같은 기록을 본다.
   범위: 키핑·야간 근무자가 쓰는 화면(현황판, 청소·재실 키핑 화면, 불출·분실물, 객실 창, 머리·메뉴) 우선.
   사전에 없는 문장(설정 안내 등)은 한글로 남는다. */
(function (G) {
  const OPS = G.OPS = G.OPS || {};
  // 긴 문장부터 바꾼다(짧은 낱말이 긴 문장을 먼저 망가뜨리지 않게)
  const PHRASES = [
    // 머리·메뉴
    ["통합 업무 시스템", "Hotel Ops"], ["1인 시험판", "single-user trial"], ["작성자 이름", "Your name"], ["주간 파트", "Day shift"], ["야간 파트", "Night shift"],
    ["야간 자동", "Night (auto)"], ["주간 자동", "Day (auto)"], ["이 기기에만 저장", "Saved on this device only"], ["저장 중…", "Saving…"], ["저장 실패", "Save failed"], ["실시간", "Live"],
    ["현황판", "Room board"], ["청소·재실", "Cleaning"], ["불출·분실물", "Supplies & Lost items"], ["할 일", "To-do"], ["교대·인수인계", "Handover"], ["체크리스트", "Checklist"],
    ["이슈 목록", "Issues"], ["이력", "History"], ["통계", "Stats"], ["설정", "Settings"], ["3단계", "later"], ["4단계", "later"], ["준비 중", "Coming soon"], ["매니지먼트", "Management"], ["공유 DB에 연결되지 않았습니다 — 이 화면은 다른 기기와 연동되지 않습니다", "Not connected to the shared database — this screen does not sync with other devices"], ["공유 DB에 연결하는 중…", "Connecting to the shared database…"], ["다시 연결", "Reconnect"], ["링크 복사", "Copy link"], ["부서를 선택해 주십시오", "Choose your department"], ["관리자 화면은 이 시스템 소유자만 들어갈 수 있습니다.", "Only the owner of this system can open the admin screen."], ["부서별 열린 업무(프론트·키핑·시설)", "Open tasks by department (Front, HK, Engineering)"], ["퇴실 청소", "Check-out cleaning"], ["재실 청소", "Stay-over service"], ["할 청소", "To clean"], ["할 재실 청소", "To service"], ["연장·청소 없음", "Extended · no cleaning"], ["요청 없음·청소 X", "No request · no cleaning"], ["청소하지 않는 재실 객실", "stay-over rooms not serviced"], ["퇴실 청소를 모두 마쳤습니다.", "All check-out rooms are done."], ["재실 청소 요청을 모두 마쳤습니다.", "All stay-over requests are done."], ["프론트가 퇴실 완료를 누르면 할 청소로 올라갑니다", "moves up when Front marks checked out"], ["누가 사용합니까? 부서를 누르면 열립니다.", "Who is using this? Tap your department to open."], ["긴급 업무", "Urgent tasks"], ["프론트가 답할 것", "For Front to answer"], ["입실 가능 / 퇴실", "Ready / check-outs"], ["불출 진행 중", "Deliveries open"], ["잠금", "Lock"], ["자동 잠금", "Auto-lock"], ["5분 뒤", "after 5 min"], ["10분 뒤", "after 10 min"], ["30분 뒤", "after 30 min"], ["야간 검수 (직원용)", "Night audit (staff)"], ["야간 검수 (관리자용)", "Night audit (admin)"], ["소유자에게만 보임 · 새 창", "owner only · new window"], ["완료 취소", "Undo done"], ["요청 입력", "Enter request"], ["요청 수정", "Edit request"], ["요청 없음", "No request"], ["청소 요청", "Service requested"], ["재실 청소 요청", "Stay-over service requests"], ["쓰레기 수거", "Trash pickup"], ["수건 교체", "Towel change"], ["침구 교체", "Linen change"], ["비품 전달", "Amenity drop-off"], ["재실 요청 미입력", "Stay-over request not entered"], ["메모(선택) 예: 생수 2", "Memo (optional) e.g. 2 water"], ["시작", "From"], ["끝", "To"], ["저장", "Save"], ["보기 전용", "View only"], ["보기 전용으로 연결되었습니다 — 여기서 누른 내용은 저장되지 않습니다", "Connected as view-only — nothing you do here is saved"], ["또는 화면 아무 곳에 파일을 끌어다 놓기", "or drag the file anywhere onto the screen"], ["예약표는 프론트·관리자만 올릴 수 있습니다", "Only Front Office and Management can upload the reservation sheet"],
    ["프론트", "Front"], ["키핑", "Housekeeping"], ["시설", "Engineering"], ["관리자", "Management"],
    // 현황판
    ["실시간 반영 중", "Live updates on"], ["마지막 변경", "last change"], ["내 저장", "my last save"], ["숙박 상태는 예약표", "stay status from reservation sheet"],
    ["이 기기에만 저장(다른 기기와 공유 안 됨)", "Saved on this device only (not shared)"],
    ["화면에서 아직 안 본 것", ": not seen yet"], ["미확인", "New"], ["긴급 업무", "urgent task"], ["부서별 열린 업무", "open tasks by dept"], ["진행 중 불출", "supply request open"],
    ["업무 있는 객실만", "Rooms with tasks only"], ["호수 검색", "Room no."], ["보기 방식", "View"], ["블록", "Blocks"], ["배치도", "Floor plan"], ["전체 보기", "Show all"],
    ["해당하는 객실이 없습니다.", "No matching rooms."], ["상태:", "status:"], ["반영", "loaded"],
    ["숙박 상태가 아직 없습니다. 객실판은 그대로 쓰고, 예약표를 올리면 퇴실·입실·연박이 표시됩니다", "No stay status yet. Front uploads the reservation sheet to show check-out / check-in / stay-over"],
    // 숙박·청소 상태
    ["퇴실·입실", "C/O + C/I"], ["퇴·입", "C/O+C/I"], ["퇴실→입실", "C/O → C/I"], ["호수 아래 글자 = 숙박 상태", "Text under room no. = stay status"], ["오늘 나가고 15시에 새 손님(먼저 청소)", "leaves today, new guest at 15:00 (clean first)"], ["오늘 나가고 빈 방", "leaves today, stays empty"], ["빈 방에 새 손님", "new guest into empty room"], ["계속 묵는 손님", "guest staying on"], ["손님 없음", "no guest"], ["퇴실 완료·청소 대기", "Checked out · to clean"], ["손님 아직 있음", "HK: guest still in"], ["연장·청소 없음", "Extended · no cleaning"],
    ["무응답·청소 없음", "No reply · no cleaning"], ["쓰레기·수건만", "Trash/towels only"], ["입실 가능", "Inspected · ready"], ["청소 끝(점검 대기)", "Cleaned (to inspect)"],
    ["입실 가능", "Ready"], ["점검 대기", "To inspect"], ["청소 대기", "To clean"], ["청소 중", "Cleaning"], ["청소 시작", "Start cleaning"], ["청소 완료", "Cleaned"], ["청소 없음", "No cleaning"],
    ["손님 아직 있음", "Guest still in"], ["회신 대기", "Waiting reply"], ["발송 전", "Not sent"], ["시간 확정", "Time set"], ["재실 청소", "Stay-over clean"], ["요청만", "Requests only"],
    ["전체재실", "Full stay-over"], ["재실청소", "Stay-over"], ["전체 청소", "Full clean"], ["일반 청소", "Light service"], ["퇴실 청소", "Check-out clean"], ["퇴실 완료", "Checked out"], ["입실 가능", "Ready"], ["점검 대기", "Awaiting inspection"], ["객실청소", "Check-out clean"], ["당일 입실", "Same-day check-in"], ["퇴실 전", "Before check-out"], ["퇴실 완료", "Checked out"],
    ["입실 우선", "priority check-in"], ["우선 준비", "Priority"], ["레이트", "Late C/O"], ["연장", "Extended"], ["무응답", "No reply"], ["청소 X", "No cleaning"], ["청소 끝", "Cleaned"],
    ["퇴실", "Check-out"], ["입실", "Check-in"], ["연박", "Stay-over"], ["공실", "Vacant"], ["재실", "In-house"], ["예상", "est."],
    // 키핑 청소 화면
    ["오늘 할 청소", "Today's cleaning"], ["지금 할 청소가 없습니다.", "Nothing to clean now."], ["아직 없습니다.", "None yet."], ["완료 취소", "Undo"],
    ["아직 손님 있음 → 프론트에 알림", "Guest still inside → tell Front"], ["프론트 답 기다리는 중", "Waiting for Front"], ["알림)", "sent)"],
    ["당일 입실 퇴실 → 퇴실 → 재실 시간순 → 요청만. 깜빡이는 줄은 새로 들어온 내용이니 확인을 눌러 주십시오.", "Same-day check-in rooms first → check-outs → stay-overs by time → requests only. Press OK on highlighted rows (new info)."],
    ["프론트가 퇴실 완료를 누르면 위 목록으로 올라갑니다. 방문했는데 손님이 있으면 알림을 눌러 주십시오. 프론트가 레이트·연장으로 답하면 여기 표시됩니다.", "When Front marks checked out, the room moves up to the list. If a guest is still inside, press the alert. Front's late/extension reply shows here."],
    ["회신 대기", "waiting reply"], ["실은 아직 목록에 없습니다.", " rooms not listed yet."], ["키핑 확인", "HK OK"], ["키핑 미확인", "HK not seen"], ["요청:", "Request:"], ["추가:", "Note:"],
    // 불출·분실물
    ["불출 요청", "Supply request"], ["진행 중인 요청이 없습니다.", "No open requests."], ["끝난 요청 숨기기", "Hide finished"], ["끝난 요청 보기", "Show finished"],
    ["진행 중", "Open"], ["가는 중", "On my way"], ["일부만", "Partly"], ["못 함", "Can't do"], ["일부 완료", "Partly done"], ["다시 요청", "Request again"],
    ["손님 객실 안", "guest in room"], ["수건 재고 (오늘)", "Towel stock (today)"], ["오늘 기록 없음", "No count today"], ["세탁·건조 중 (예: 203호 큰 10)", "Washing/drying (e.g. rm 203 large 10)"],
    ["키핑이 린넨실 수량을 적으면 모두에게 보입니다. 3시간 넘게 갱신이 없으면 시간이 붉게 보입니다.", "Housekeeping enters linen-room counts; everyone sees them. Time turns red after 3 hours without update."],
    ["긴급 → 기한 → 들어온 순. 30분이 넘은 요청은 시간이 붉게 보입니다. 오늘 요청 합계:", "Urgent → deadline → oldest. Requests over 30 min turn red. Today's total:"],
    ["분실물 등록", "Register item"], ["분실물", "Lost & found"], ["발견일", "Found on"], ["물건", "Item"], ["보관 위치", "Stored at"], ["사진 찍어 둠", "Photo taken"], ["사진 있음", "photo"],
    ["찾기 (호수 또는 물건)", "Search (room or item)"], ["찾는 분실물이 없습니다.", "Nothing found."], ["등록된 분실물이 없습니다.", "No items registered."], ["보관으로 되돌리기", "Back to stored"],
    ["고객 전달", "Returned to guest"], ["폐기", "Discarded"], ["보관", "Stored"], ["발견", "found"],
    ["린넨실 분실물 카트", "Linen-room lost cart"], ["본관 프론트", "Main front desk"], ["신관 프론트", "New-wing front desk"], ["객실 냉장고", "Room fridge"],
    ["큰수건", "Large towel"], ["작은수건", "Small towel"], ["생수", "Water"], ["롤휴지", "Toilet paper"], ["각티슈", "Tissue box"], ["베개", "Pillow"], ["이불", "Duvet"], ["토퍼", "Topper"],
    ["세제", "Detergent"], ["쓰레기봉투", "Trash bag"], ["옷걸이", "Hanger"], ["스팀다리미", "Steam iron"], ["쓰레기 수거", "Collect trash"], ["수건 교체", "Replace towels"], ["사용 수건 수거", "Collect used towels"],
    ["문고리+벨링", "Door handle + bell"], ["직접 전달(벨링)", "Ring bell, hand over"], ["부재중 입실", "Guest out, enter"], ["프론트로", "To front desk"], ["문고리", "Door handle"],
    ["큰", "Large"], ["작은", "Small"],
    // 객실 창
    ["투숙 기간", "Stay period"], ["투숙 중", "in house"], ["다음 입실", "Next check-in"], ["오늘 밤이 마지막", "last night tonight"], ["전후 숙박 접기", "Hide other stays"], ["전후 숙박", "Other stays"],
    ["직접 추가", "added manually"], ["예약표 표기 칸(UHC·Miss 등)", "sheet mark (UHC/Miss)"], ["기준 투숙·예정 없음 (예약표 반영 범위 안에서)", "no stay or booking (within sheet range)"],
    ["월 경계 표시를 읽지 못한 파일이라 월말·월초에 걸친 숙박은 둘로 나뉘어 보일 수 있습니다.", "Month-border marks were not read; stays across month end may appear split."],
    ["열린 이슈가 없습니다.", "No open issues."], ["열린 이슈", "Open issues"], ["인수인계 정리", "Handover notes"], ["최근 24시간 동안 이 객실의 처리 기록이 없습니다.", "No activity in the last 24 hours."], ["최근 24시간", "last 24 h"],
    ["부서별 비고", "Notes by department"], ["이 객실로 업무 등록", "New task for this room"], ["이 객실 예약 추가", "Add booking"], ["청소·재실 탭에서 처리", "Open in Cleaning"], ["비어 있음", "Empty"],
    ["세 부서 모두 볼 수 있고, 각 부서는 자기 칸만 고칠 수 있습니다. 카드번호·비밀번호는 자동으로 가려집니다. 투숙객 이름·연락처는 적지 마십시오.", "All departments can read; each edits only its own note. Card numbers and passwords are hidden automatically. Do not write guest names or contacts."],
    ["완료 대기", "Awaiting confirmation"], ["확인 필요", "Needs check"], ["기한 초과", "Overdue"], ["열린 업무", "open tasks"], ["업무", "task"],
    ["\"그 객실 청소 때 발견된 것 있나요?\"는 여기서 호수로 찾습니다. 고객 이름은 적지 않습니다. 사진은 아직 저장하지 않으니 사진이 있는지만 표시합니다.", "Search by room number or item. Do not write guest names. Photos are not stored yet; just mark if one was taken."],
    ["분실물을 등록했습니다.", "item registered."], ["요청을 보냈습니다.", "request sent."], ["재고를 저장했습니다.", "Stock saved."],
    ["객실 → 품목·수량 → 방법. 키핑 화면에 한/영으로 뜨고, 키핑이 그 요청에서 완료를 누르면 여기서 바로 보입니다.", "Room → items → method. Shows in Korean/English for housekeeping; when they press Done it shows here."],
    ["재실: 안내 발송 → 고객 회신(시간 / 청소 X / 무응답) → 키핑 확인 → 완료. 무응답은 청소하지 않습니다. 퇴실: 퇴실 완료 → 키핑 확인 → 완료. 비밀번호를 제공한 객실은 퇴실 완료 때 비번 변경 업무가 생깁니다.", "Stay-over: Front messages guest → guest replies (time / no cleaning / no reply) → HK OK → Done. No reply = no cleaning. Check-out: Front marks checked out → HK OK → Done."],
    ["실. 프로그램(PMS) 재실 수와 다르면 예약표를 확인해 주십시오.", " rooms. If this differs from the PMS in-house count, check the reservation sheet."],
    ["전날 밤 투숙", "Last night in-house"], ["오늘 밤 투숙", "tonight in-house"], ["실 = ", " rooms = "],
    ["공유 DB에 연결되지 않아 이 브라우저에만 저장됩니다. 다른 기기에서는 보이지 않습니다.", "Not connected to the shared DB: saved in this browser only, not visible on other devices."],
    ["기록은 이 페이지의 공유 DB에 저장됩니다. 1인 시험판이며 역할은 화면 위에서 바꿉니다. 실제 투숙객 정보는 넣지 마십시오.", "Records are saved in this page's shared DB. Do not enter real guest information."],
    ["수정", "Edit"], ["쓰기", "Write"], ["저장", "Save"], ["취소", "Cancel"], ["닫기", "Close"], ["완료", "Done"], ["확인", "OK"], ["긴급", "Urgent"], ["불출", "Supplies"], ["비고", "Note"],
    ["예약표", "reservation sheet"], ["오늘", "Today"], ["전체", "All"], ["본관", "Main"], ["신관", "New wing"], ["기준", "basis"]
  ];
  const RULES = [
    [/(\d+)분 전/g, "$1 min ago"], [/(\d+)박째/g, "night $1"], [/(\d+)박 남음/g, "$1 left"], [/(\d+)박/g, "$1 nights"], [/(\d+)일 뒤/g, "in $1 days"],
    [/(\d+)실/g, "$1 rooms"], [/(\d+)건/g, "$1"], [/(\d{1,2}):(\d{2})까지/g, "by $1:$2"], [/(\d{3,4})호/g, "#$1"], [/(\d+)F\b/g, "$1F"],
    [/\((일|월|화|수|목|금|토)\)/g, (m, d) => "(" + { 일: "Sun", 월: "Mon", 화: "Tue", 수: "Wed", 목: "Thu", 금: "Fri", 토: "Sat" }[d] + ")"]
  ];
  // 글자 하나짜리 이름표처럼 다른 낱말 속에도 들어가는 것은 칸 전체가 그 글자일 때만 바꾼다
  const EXACT = { "동": "Building", "호수": "Room", "기타": "Other", "요청": "Request", "방법": "Method", "기한(선택)": "Deadline (optional)", "기타(선택)": "Other (optional)", "메모(선택)": "Memo (optional)", "입실일": "Check-in date", "박수": "Nights", "추가": "Add", "삭제": "Delete", "남기기": "Post", "메뉴": "Menu", "표시 설명": "Legend", "발송": "Sent", "작": "Small", "주간": "Day", "야간": "Night" };
  const sorted = PHRASES.slice().sort((a, b) => b[0].length - a[0].length);
  const HAS_KO = /[가-힣]/;
  function tr(text) {
    if (!text || !HAS_KO.test(text)) return text;
    const k = text.trim();
    if (EXACT[k]) return text.replace(k, EXACT[k]);
    let t = text;
    for (const [ko, en] of sorted) if (t.includes(ko)) t = t.split(ko).join(en);
    for (const [re, to] of RULES) t = t.replace(re, to);
    return t;
  }
  const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT"]);
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { fixText(root); return; }
    if (root.nodeType === 1 && (root.nodeName === "INPUT" || root.nodeName === "TEXTAREA")) { fixAttrs(root); return; }
    if (root.nodeType !== 1 || SKIP.has(root.nodeName) || root.closest && root.closest("[data-noi18n]")) return;
    fixAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: n => n.nodeType === 1 ? (SKIP.has(n.nodeName) || n.hasAttribute("data-noi18n") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) : NodeFilter.FILTER_ACCEPT
    });
    let n; while ((n = tw.nextNode())) { if (n.nodeType === 3) fixText(n); else fixAttrs(n); }
    root.querySelectorAll && root.querySelectorAll("input[placeholder],textarea[placeholder],input[aria-label]").forEach(fixAttrs);
  }
  function fixText(n) {
    const p = n.parentNode;
    if (!p || SKIP.has(p.nodeName)) return;
    const v = n.nodeValue, t = tr(v);
    if (t === v) return;
    // 값 없는 <option>은 글자가 곧 저장 값이므로 원래 글자를 값으로 고정해 둔다
    if (p.nodeName === "OPTION" && !p.hasAttribute("value")) p.setAttribute("value", v);
    n.nodeValue = t;
  }
  function fixAttrs(el) {
    for (const a of ["placeholder", "title", "aria-label"]) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && HAS_KO.test(v)) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
    }
  }
  let obs = null;
  function set(lang) {
    const en = lang === "en";
    document.documentElement.lang = en ? "en" : "ko";
    if (obs) { obs.disconnect(); obs = null; }
    if (!en) return;
    walk(document.body);
    obs = new MutationObserver(ms => {
      obs.disconnect();
      ms.forEach(m => { if (m.type === "characterData") fixText(m.target); else if (m.type === "attributes") fixAttrs(m.target); else m.addedNodes.forEach(walk); });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] });
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] });
  }
  OPS.I18n = { set, tr, walk };
})(typeof window !== "undefined" ? window : globalThis);
