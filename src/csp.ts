// 배포본에 넣는 콘텐츠 보안 정책(CSP) 문자열. vite.config.ts가 빌드할 때 쓴다(앱 코드는 가져오지 않는다).
// 스크립트·스타일·글꼴·연결을 이 사이트로만 제한하고(보안 점검), 사진 미리보기를 위해 img-src에 blob:을 더한다.
// AI 서버 주소가 https이면 connect-src에 그 출처만 더한다. http(localhost 포함)는 배포판에 넣지 않는다.
// 녹음을 다시 듣는 기능이 없으므로 media-src는 두지 않는다.

// 주소를 지시문에 그대로 붙여도 안전한 출처(https 호스트와 포트)만 받는다.
const SAFE_HTTPS_ORIGIN = /^https:\/\/[a-z0-9.-]+(:\d+)?$/

function httpsOrigin(serverUrl: string | undefined): string | null {
  if (serverUrl === undefined) return null
  try {
    const url = new URL(serverUrl.trim())
    return url.protocol === 'https:' && SAFE_HTTPS_ORIGIN.test(url.origin) ? url.origin : null
  } catch {
    return null
  }
}

export function buildCsp(aiServerUrl?: string): string {
  const origin = httpsOrigin(aiServerUrl)
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' blob:",
    origin === null ? "connect-src 'self'" : `connect-src 'self' ${origin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}
