import type { Messages } from './core/index.js';

// Keep this object JSON-shaped (double quotes, no trailing commas): the preview tool reads it.
export const messages: Messages = {
  "main.title": "🛰 트레이서",
  "calls.title": "📞 콜",
  "wallets.title": "👛 지갑",
  "status.btn": "지금 상태",
  "calls.list": "콜 목록",
  "calls.mode": "콜 모드",
  "calls.mode.off": "콜 모드 · 끄기",
  "calls.mode.record": "콜 모드 · 기록만",
  "calls.mode.quick": "콜 모드 · 빠르게",
  "wallets.list": "추적 지갑",
  "wallets.watch": "지갑 추가",
  "wallets.watch.ask": "추적할 지갑 주소를 보내세요.",
  "wallets.unwatch": "지갑 추적 해제",
  "wallets.unwatch.ask": "추적을 해제할 지갑 주소를 보내세요.",
  "settings.calls": "콜·레이더",
  "settings.budget": "예산",
  "settings.scoring": "채점",
  "set.radarHit": "레이더 표본률 (적중)",
  "set.radarMiss": "레이더 표본률 (빗나감)",
  "set.forensics": "포렌식 읽기",
  "set.daily": "하루 크레딧",
  "set.share": "포렌식 몫",
  "set.threshold": "알림 점수 기준",
  "alert.callVerdict": "📞 {token} 판정: {verdict}",
  "alert.walletMove": "👛 {wallet} 이동: {detail}",
  "alert.budgetExhausted": "⛽ 오늘 크레딧을 다 썼습니다 ({used}/{limit})",
  "status.calls.today": "오늘 콜",
  "status.wallets.tracked": "추적 지갑",
  "status.budget.used": "쓴 크레딧"
};
