import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

// 배포본에만 콘텐츠 보안 정책(CSP)을 넣는다. GitHub Pages는 응답 헤더를 바꿀 수 없어 meta로 넣고,
// 개발 서버는 인라인 스크립트를 쓰므로 빌드할 때만 넣는다. 스크립트·스타일·글꼴·연결을 이 사이트로만 제한한다 (보안 점검)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const contentSecurityPolicy: Plugin = {
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
}

// GitHub Pages가 https://lumos0107.github.io/BuyorNot/ 에서 서비스하므로
// 빌드 결과의 모든 경로 앞에 저장소 이름을 붙인다. (PRD #8)
export default defineConfig({
  base: '/BuyorNot/',
  plugins: [react(), contentSecurityPolicy],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
