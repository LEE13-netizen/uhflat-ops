/* 웹 배포 설정. publishable 키는 공개되어도 되는 키입니다(데이터는 로그인 + RLS로 보호).
   비밀 키(service_role)와 PIN 비밀값은 절대 여기에 넣지 마십시오. 서버 함수에만 있습니다.
   - 운영: 실제 웹 주소
   - 시험: localhost 에서 열거나 주소 끝에 ?env=staging */
(function () {
  const ENVS = {
    prod: {
      name: "운영",
      supabaseUrl: "https://vtlzettgvppkjrvipvyj.supabase.co",
      supabaseKey: "sb_publishable_ipT-rRiRSFGFj6yN4Mij-Q_fg1WMJmc"
    },
    staging: {
      name: "시험",
      supabaseUrl: "https://vgdavojjtfchdlfzngtk.supabase.co",
      supabaseKey: "sb_publishable_DxKg5RIxrGdYGcIsvPKM7w_ocKnfnfp"
    }
  };
  const q = new URLSearchParams(location.search).get("env");
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const env = q === "prod" ? "prod" : (q === "staging" || local) ? "staging" : "prod";
  window.OPS_CONFIG = Object.assign({}, ENVS[env], {
    env,
    // 병행 기간 동안 부서 공용 PIN(4자리) 로그인 허용. 종료할 때 false 로 바꾼다
    legacyDeptLogin: true,
    // 부서 공용 계정 목록(비밀번호는 PIN으로 만들어지며 코드에 PIN은 없습니다)
    accounts: [
      { id: "FO", label: "프론트", en: "Front Office", email: "fo@ops.uhflat.local" },
      { id: "HK", label: "키핑", en: "Housekeeping", email: "hk@ops.uhflat.local" },
      { id: "FM", label: "시설", en: "Facility", email: "fm@ops.uhflat.local" },
      { id: "MG", label: "관리", en: "Management", email: "mg@ops.uhflat.local" },
      { id: "OWNER", label: "프로그램 관리자", en: "Owner", email: "owner@ops.uhflat.local" }
    ]
  });
})();
