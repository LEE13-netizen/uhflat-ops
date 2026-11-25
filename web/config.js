/* 웹 배포 설정. publishable 키는 공개되어도 되는 키입니다(데이터는 로그인 + RLS로 보호).
   비밀 키(service_role)는 절대 여기에 넣지 마십시오. */
window.OPS_CONFIG = {
  supabaseUrl: "https://vtlzettgvppkjrvipvyj.supabase.co",
  supabaseKey: "sb_publishable_ipT-rRiRSFGFj6yN4Mij-Q_fg1WMJmc",
  // 부서 로그인 계정(비밀번호는 PIN으로 만들어지며 코드에 PIN은 없습니다)
  accounts: [
    { id: "FO", label: "프론트", en: "Front Office", email: "fo@ops.uhflat.local" },
    { id: "HK", label: "키핑", en: "Housekeeping", email: "hk@ops.uhflat.local" },
    { id: "FM", label: "시설", en: "Engineering", email: "fm@ops.uhflat.local" },
    { id: "MG", label: "관리자", en: "Management", email: "mg@ops.uhflat.local" },
    { id: "OWNER", label: "프로그램 관리자", en: "Owner", email: "owner@ops.uhflat.local" }
  ]
};
