import { describe, expect, it } from 'vitest'
import { bundleSummary, type BundleVerdict } from './bundle'
import { isExample } from './wishlist'

// 개선: 묶음 비교 결과를 한 문장으로 (단가와 총지출이 엇갈리는 경우를 분명히), 예시 기록 구분
const verdict = (over: Partial<BundleVerdict>): BundleVerdict => ({
  cheaper: 'A',
  displayTie: false,
  percent: 7.4,
  spendDiff: 600,
  spendMore: 'A',
  ...over,
})

describe('묶음 비교 한 문장 (F05 보강)', () => {
  it('단가가 싼 쪽이 총지출은 더 크면 엇갈린다고 한 문장으로 말한다', () => {
    expect(bundleSummary(verdict({ cheaper: 'A', spendMore: 'A', spendDiff: 600 }))).toBe('단가는 상품 A가 낮지만, 총지출은 상품 B가 600원 적어요')
  })

  it('같은 쪽이 단가도 낮고 총지출도 적으면 그렇게 말한다', () => {
    expect(bundleSummary(verdict({ cheaper: 'A', spendMore: 'B', spendDiff: 500 }))).toBe('상품 A가 단가도 낮고, 총지출도 500원 적어요')
  })

  it('총지출이 같거나 단가가 같은 경우', () => {
    expect(bundleSummary(verdict({ cheaper: 'B', spendMore: 'same', spendDiff: 0 }))).toBe('단가는 상품 B가 낮고, 총지출은 같아요')
    expect(bundleSummary(verdict({ cheaper: 'tie', spendMore: 'B', spendDiff: 300 }))).toBe('단가는 같고, 총지출은 상품 A가 300원 적어요')
    expect(bundleSummary(verdict({ cheaper: 'tie', spendMore: 'same', spendDiff: 0 }))).toBe('단가도 총지출도 같아요')
  })
})

describe('예시 기록 구분', () => {
  it('이름이 "(예시)"로 시작하면 예시다', () => {
    expect(isExample('(예시) 무선 헤드폰')).toBe(true)
    expect(isExample('무선 헤드폰 (예시)')).toBe(false)
    expect(isExample('무선 헤드폰')).toBe(false)
  })
})
