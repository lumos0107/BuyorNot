// 앱 쪽 대기 상한: 서버 요청 전체 55초 + 5초 (PRD 10장 "앱 공통"). 가격표 사진은 읽기와 온라인 가격 확인이 따로 요청이라 각각 적용된다.
export const PHOTO_TIMEOUT_MS = 60_000
export const VOICE_TIMEOUT_MS = 60_000

// 빌드 변수 VITE_AI_SERVER_URL을 다듬은 AI 서버 주소. http·https 주소가 아니면 null(이때 AI 기능은 보이지 않는다).
// 모듈을 불러올 때가 아니라 부를 때마다 읽는다.
export function aiServerUrl(): string | null {
  const raw = import.meta.env.VITE_AI_SERVER_URL
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  try {
    const { protocol } = new URL(trimmed)
    if (protocol !== 'http:' && protocol !== 'https:') return null
  } catch {
    return null
  }
  return trimmed.replace(/\/+$/, '')
}
