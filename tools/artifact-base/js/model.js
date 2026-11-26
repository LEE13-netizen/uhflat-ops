/* 데이터 정의: 부서, 업무 종류, 상태, 분류. 화면과 엔진이 모두 이 파일을 기준으로 한다. */
(function (G) {
  const OPS = G.OPS = G.OPS || {};

  OPS.VERSION = "v0.23";

  // 현재 지점·설정 값(설정 화면에서 바뀜)
  OPS.CTX = { propertyId: "p1", propertyName: "", dayStart: "07:00", nightStart: "22:00", pwDept: "FM" };

  // 부서
  OPS.DEPTS = [
    // en·code는 화면 표시용. 저장 값(id)은 그대로 둔다(기존 기록 호환)
    { id: "FO", name: "프론트", en: "Front Office", code: "FO" },
    { id: "HK", name: "키핑", en: "Housekeeping", code: "HK" },
    { id: "FM", name: "시설", en: "Engineering", code: "ENG" },
    { id: "MN", name: "매니지먼트", en: "Management", code: "MGT" },   // v0.23: 매니저·지배인. 모든 부서 업무·통계, 설정은 제외
    { id: "MG", name: "관리자", en: "Administrator", code: "ADM" }     // 프로그램 전체 관리자 = 소유자 전용(오른쪽 위 입구)
  ];
  OPS.isMgr = r => r === "MG" || r === "MN";
  OPS.deptName = id => (OPS.DEPTS.find(d => d.id === id) || {}).name || id || "";

  // 근무 파트: v0.21(2026-11-25)부터 화면에서 구분하지 않음. 예전 기록의 part 값을 읽을 때와 화면 자동 밝기(guessPart)에만 남겨 둠
  OPS.PARTS = [
    { id: "day", name: "주간 파트" },
    { id: "night", name: "야간 파트" }
  ];
  OPS.partName = id => (OPS.PARTS.find(p => p.id === id) || {}).name || "";
  // 가정: 07:00~21:59 주간, 그 외 야간. 화면에서 바꿀 수 있다.
  const hm2min = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };
  OPS.guessPart = (d = new Date()) => {
    const a = hm2min(OPS.CTX.dayStart), b = hm2min(OPS.CTX.nightStart), n = d.getHours() * 60 + d.getMinutes();
    if (a == null || b == null || a === b) return "day";
    return a < b ? (n >= a && n < b ? "day" : "night") : (n >= a || n < b ? "day" : "night");
  };

  // 업무 종류와 기본으로 받는 부서
  OPS.KINDS = [
    { id: "issue", name: "이슈", to: "FO" },
    { id: "request", name: "고객 요청", to: "HK" },
    { id: "clean", name: "청소", to: "HK" },
    { id: "inspect", name: "점검", to: "HK" },
    { id: "repair", name: "수리", to: "FM" },
    { id: "check", name: "체크 미완료", to: "FO" },
    { id: "pwchange", name: "비번 변경", to: "FM" }
  ];
  OPS.kindName = id => (OPS.KINDS.find(k => k.id === id) || {}).name || id || "";
  OPS.defaultTo = kind => (OPS.KINDS.find(k => k.id === kind) || {}).to || "FO";

  // 업무 상태: 데이터는 7단계, 화면은 4묶음
  OPS.STATUS = ["접수", "배정", "진행 중", "완료 대기", "완료", "보류", "취소"];
  OPS.GROUP = { "접수": "대기", "배정": "대기", "진행 중": "진행", "완료 대기": "진행", "완료": "완료", "취소": "완료", "보류": "보류" };
  OPS.OPEN = new Set(["접수", "배정", "진행 중", "완료 대기", "보류"]);

  // 허용되는 상태 이동
  OPS.FLOW = {
    "접수": ["배정", "진행 중", "보류", "취소"],
    "배정": ["진행 중", "접수", "보류", "취소"],
    "진행 중": ["완료 대기", "완료", "보류"],
    "완료 대기": ["완료", "진행 중"],
    "보류": ["진행 중", "접수", "취소"],
    "완료": ["진행 중"],
    "취소": []
  };

  OPS.PRIORITY = ["긴급", "주의", "일반"];
  OPS.PRIORITY_RANK = { "긴급": 0, "주의": 1, "일반": 2 };

  // 컴플레인 기록부(서초·속초)에서 가져온 이슈 분류
  OPS.DEFAULT_CATEGORIES = ["냉방/난방", "수도/배관", "전기/조명", "전자기기/IT", "소음", "안전/보안", "청소/위생", "예약/정산", "직원응대", "기타"];
  OPS.CATEGORIES = OPS.DEFAULT_CATEGORIES.slice();

  // 인수인계 정리(서초)에서 가져온 인수인계 분류
  OPS.HANDOVER_TAGS = ["후속 필요", "예약/결제", "VIP", "픽업", "보관물", "시설/민원", "공지"];

  // 객실 정비 상태. 판매 가능 여부는 윙스가 기준이므로 두지 않는다.
  OPS.HK_STATUS = ["재실", "퇴실·청소 전", "청소 중", "청소 완료·점검 전", "점검 완료", "사용불가"];

  // 그날 객실 상태(예약표 기준)
  OPS.STAY = ["퇴실", "퇴실·입실", "입실", "연박", "공실"];
  // 현황에서 기본으로 숨기는 일상 업무
  OPS.ROUTINE = new Set(["clean", "inspect"]);

  // 저장소 모음 이름
  OPS.COL = {
    property: "property",
    rooms: "rooms",
    staff: "staff",
    shifts: "shifts",
    tasks: "tasks",
    events: "taskEvents",
    checklists: "checklists",
    checkRuns: "checkRuns",
    handovers: "handovers",
    roomDays: "roomDays",
    roomNotes: "roomNotes",
    roomSvc: "roomSvc",
    manualStays: "manualStays",
    deliveries: "deliveries",
    stayIndex: "stayIndex",
    stock: "stock",
    lostFound: "lostFound",
    settings: "settings"
  };
})(typeof window !== "undefined" ? window : globalThis);
