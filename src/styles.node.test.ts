import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// PRD F49 주요 메뉴 다섯 개 (AC98): CSS 원문을 파일로 읽어야 해서 Node 타입이 필요하다.
// 그래서 앱 타입 검사(tsconfig.app.json)에서 빼고 tsconfig.node.json에서 검사한다 (파일 이름 *.node.test.ts)
// 계획은 index.css?raw로 읽으라고 했지만 vitest가 CSS 파일을 빈 문자열로 바꿔서(길이 0) 파일을 직접 읽는다
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

describe('주요 메뉴 다섯 개의 좁은 화면 규칙 (F49)', () => {
  it('AC98: 좁은 화면의 주요 탭 규칙에 최소 너비 44px이 있다', () => {
    // 실제로 한 줄에 들어가는지는 사람이 360px 브라우저로 본다 (jsdom은 배치를 계산하지 않는다)
    const start = css.indexOf('@media (max-width: 420px)')
    expect(start).toBeGreaterThanOrEqual(0)
    const block = css.slice(start, css.indexOf('\n}\n', start) + 3)
    const rule = /\.tabs:not\(\.tabs-sub\) \.tab \{([^}]*)\}/.exec(block)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/min-width:\s*44px/)
  })
})
