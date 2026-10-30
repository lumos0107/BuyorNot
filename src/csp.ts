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

// 운영 빌드에 넣을 AI 서버 주소를 검사한다. 비어 있으면 AI 기능 없는 빌드라 문제없다.
// 값이 있는데 connect-src에 더할 수 있는 https 주소가 아니면, 화면에는 AI 버튼이 보이는데 CSP가 서버 요청을 모두 막는다.
// 그때 빌드를 멈출 이유(문장)를 돌려준다. vite.config.ts가 운영 빌드에서만 쓴다.
export function productionAiUrlProblem(aiServerUrl?: string): string | null {
  if (aiServerUrl === undefined || aiServerUrl.trim() === '') return null
  if (httpsOrigin(aiServerUrl) !== null) return null
  return (
    `운영 빌드의 VITE_AI_SERVER_URL은 https 주소여야 해요(지금 값: ${aiServerUrl}). ` +
    '배포판 CSP의 connect-src에는 https 출처만 넣어서, 이대로 빌드하면 AI 버튼은 보이지만 서버 요청이 모두 막혀요. ' +
    'AI 기능 없이 빌드하려면 값을 비워 두세요.'
  )
}
