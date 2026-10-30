import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig, type Plugin } from 'vitest/config'
import { buildCsp, productionAiUrlProblem } from './src/csp.ts'

// 배포본에만 콘텐츠 보안 정책(CSP)을 넣는다. GitHub Pages는 응답 헤더를 바꿀 수 없어 meta로 넣고,
// 개발 서버는 인라인 스크립트를 쓰므로 빌드할 때만 넣는다. 스크립트·스타일·글꼴·연결을 이 사이트로만 제한한다 (보안 점검)
// 지시문 목록은 src/csp.ts의 buildCsp가 만든다. AI 서버 주소(VITE_AI_SERVER_URL)가 https이면 그 출처만 connect-src에 더한다.
const contentSecurityPolicy = (csp: string): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
})

// GitHub Pages가 https://lumos0107.github.io/BuyorNot/ 에서 서비스하므로
// 빌드 결과의 모든 경로 앞에 저장소 이름을 붙인다. (PRD #8)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // 운영 빌드에 https가 아닌 AI 서버 주소가 들어가면 CSP가 모든 AI 요청을 막으므로 빌드를 멈춘다(개발 서버의 http://localhost는 그대로)
  if (mode === 'production') {
    const problem = productionAiUrlProblem(env.VITE_AI_SERVER_URL)
    if (problem !== null) throw new Error(problem)
  }
  return {
    base: '/BuyorNot/',
    plugins: [react(), contentSecurityPolicy(buildCsp(env.VITE_AI_SERVER_URL))],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
  }
})
