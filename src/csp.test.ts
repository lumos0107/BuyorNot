import { describe, expect, it } from 'vitest'
import { buildCsp, productionAiUrlProblem } from './csp'

// 배포본이 지금까지 넣던 지시문(이 순서). 이번에 바뀌는 것은 img-src(blob: 추가)와 서버 주소가 있을 때의 connect-src뿐이다.
const EXISTING_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
]

function directives(csp: string): string[] {
  return csp.split('; ')
}

function directive(csp: string, name: string): string | undefined {
  return directives(csp).find((d) => d.startsWith(`${name} `))
}

describe('buildCsp', () => {
  // plan: keeps every existing directive
  it('기존 지시문을 모두 그 순서대로 유지한다', () => {
    expect(directives(buildCsp())).toEqual(EXISTING_DIRECTIVES)
    expect(directives(buildCsp('https://ai.example.com')).map((d) => d.split(' ')[0])).toEqual(
      EXISTING_DIRECTIVES.map((d) => d.split(' ')[0]),
    )
  })

  // plan: keeps connect-src self only without a server url
  it('AC61: 서버 주소가 없거나 비어 있으면 connect-src는 self뿐이다', () => {
    for (const url of [undefined, '', '   ']) {
      const csp = buildCsp(url)
      expect(directive(csp, 'connect-src')).toBe("connect-src 'self'")
      expect(csp).not.toContain('http')
    }
  })

  // plan: adds only the origin of an https server url
  it('AC61: https 서버 주소는 출처만 connect-src에 더하고 경로는 넣지 않는다', () => {
    const csp = buildCsp('https://buyornot-ai.example.workers.dev/some/path/')
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://buyornot-ai.example.workers.dev")
    expect(csp).not.toContain('/some/path')
    expect(directive(buildCsp('https://ai.example.com:8443/x'), 'connect-src')).toBe(
      "connect-src 'self' https://ai.example.com:8443",
    )
  })

  // plan: ignores an http localhost url
  it('AC61: http 주소(localhost 포함)는 connect-src에 넣지 않는다', () => {
    for (const url of ['http://localhost:8787', 'http://localhost:8787/', 'http://127.0.0.1:8787', 'http://ai.example.com']) {
      const csp = buildCsp(url)
      expect(directive(csp, 'connect-src')).toBe("connect-src 'self'")
      expect(csp).not.toContain('localhost')
      expect(csp).not.toContain('127.0.0.1')
    }
  })

  // plan: allows blob: images
  it('AC61: 사진 미리보기를 위해 img-src에 blob:을 허용한다', () => {
    expect(directive(buildCsp(), 'img-src')).toBe("img-src 'self' blob:")
    expect(directive(buildCsp('https://ai.example.com'), 'img-src')).toBe("img-src 'self' blob:")
  })

  it('녹음을 다시 듣는 기능이 없으므로 media-src를 두지 않는다', () => {
    expect(directive(buildCsp('https://ai.example.com'), 'media-src')).toBeUndefined()
  })

  it('주소가 아니거나 https가 아닌 값, 지시문을 깨뜨릴 수 있는 값은 무시한다', () => {
    for (const url of ['not a url', 'ftp://ai.example.com', 'https://a.com;script-src *', 'https://a"b.com', 'https://[::1]:8787']) {
      expect(directives(buildCsp(url))).toEqual(EXISTING_DIRECTIVES)
    }
  })
})

// 운영 빌드에 https가 아닌 서버 주소가 들어가면 AI 버튼은 보이는데 CSP가 모든 요청을 막는다. vite.config.ts가 이 판단으로 빌드를 멈춘다(최종 리뷰 F4)
describe('productionAiUrlProblem', () => {
  it('서버 주소가 없거나 비어 있으면 AI 기능 없는 빌드라 문제없다', () => {
    for (const url of [undefined, '', '   ']) expect(productionAiUrlProblem(url), String(url)).toBeNull()
  })

  it('https 서버 주소는 문제없다', () => {
    expect(productionAiUrlProblem('https://buyornot-ai.example.workers.dev')).toBeNull()
    expect(productionAiUrlProblem('https://ai.example.com:8443/x/')).toBeNull()
  })

  it('https가 아닌 주소(localhost 포함)나 주소가 아닌 값이면 변수 이름과 이유를 적은 문장을 돌려준다', () => {
    for (const url of ['http://localhost:8787', 'http://ai.example.com', 'ftp://ai.example.com', 'not a url']) {
      const problem = productionAiUrlProblem(url)
      expect(problem, url).not.toBeNull()
      expect(problem, url).toContain('VITE_AI_SERVER_URL')
      expect(problem, url).toContain('https')
      expect(problem, url).toContain(url)
    }
  })

  it('https여도 CSP에 넣을 수 없는 주소면 같은 이유로 문제다', () => {
    expect(productionAiUrlProblem('https://[::1]:8787')).not.toBeNull()
  })
})
