import { describe, expect, it } from 'vitest'
import { bundleDraft, discountDraft, isStaleLink, mergePhotoDraft, photoDraftNotice, userWrittenReason } from './draft'

// PRD F21 비교 결과를 고민 목록에 담기: 고른 쪽의 가격과 비교 내용을 담기 폼에 채운다
describe('담기 폼에 채울 내용 (F21)', () => {
  it('할인 비교: 결제액을 가격으로, 할인과 배송비 포함을 이유로', () => {
    expect(discountDraft('B안', { applied: true, baseDiscount: 8000, discount: 8000, total: 72000, steps: [] })).toEqual({
      price: 72000,
      reason: '가격 비교: B안 결제액 72,000원 (할인 8,000원 · 배송비 포함)',
    })
  })

  it('할인 비교: 쿠폰을 못 쓰면 그렇게 적는다', () => {
    expect(
      discountDraft('A안', { applied: false, reason: 'below-min-order', shortfall: 20000, baseDiscount: 0, discount: 0, total: 83000, steps: [] }),
    ).toEqual({ price: 83000, reason: '가격 비교: A안 결제액 83,000원 (쿠폰 적용 불가)' })
  })

  it('묶음 비교: 그 상품의 가격과 단가·총량을 이유로', () => {
    expect(
      bundleDraft('상품 A', { price: 6000, unitPrice: 333.33, unitPriceLabel: '333.33', referenceLabel: '100mL', total: 1800, totalLabel: '1,800mL' }),
    ).toEqual({ price: 6000, reason: '가격 비교: 상품 A 100mL당 333.33원 (총 1,800mL · 6,000원)' })
  })
  it('묶음 비교: 한 달에 쓰는 양을 적었으면 그 기간을 괄호 안에 더한다 (P3)', () => {
    const side = { price: 6000, unitPrice: 333.33, unitPriceLabel: '333.33', referenceLabel: '100mL' as const, total: 1800, totalLabel: '1,800mL' }
    expect(bundleDraft('상품 A', side, { amount: 500, unit: 'mL' }).reason).toBe('가격 비교: 상품 A 100mL당 333.33원 (총 1,800mL · 6,000원 · 한 달 500mL면 약 3.6개월 분량)')
    expect(bundleDraft('상품 A', side, { amount: 1.5, unit: 'L' }).reason).toBe('가격 비교: 상품 A 100mL당 333.33원 (총 1,800mL · 6,000원 · 한 달 1.5L면 약 1.2개월 분량)')
    // 앱이 만든 문장이라 사용자가 쓴 이유에서 뺀다 (F23)
    expect(userWrittenReason(bundleDraft('상품 A', side, { amount: 500, unit: 'mL' }).reason + ' 세일이라').trim()).toBe('세일이라')
  })
})

// PRD F23: 가격 비교에서 가져온 문장은 사용자가 쓴 이유가 아니다 (할인 문구 검사에서 뺀다)
describe('사용자가 쓴 이유만 남기기 (F23)', () => {
  const discount = discountDraft('B안', { applied: true, baseDiscount: 8000, discount: 8000, total: 72000, steps: [] }).reason
  const noCoupon = discountDraft('A안', { applied: false, reason: 'below-min-order', shortfall: 20000, baseDiscount: 0, discount: 0, total: 83000, steps: [] }).reason
  const bundle = bundleDraft('상품 A', { price: 6000, unitPrice: 333.33, unitPriceLabel: '333.33', referenceLabel: '100mL', total: 1800, totalLabel: '1,800mL' }).reason

  it('담기 폼에 채운 비교 문장은 남기지 않는다', () => {
    for (const reason of [discount, noCoupon, bundle]) expect(userWrittenReason(reason).trim()).toBe('')
  })

  it('사용자가 앞뒤에 덧붙인 말은 남긴다', () => {
    expect(userWrittenReason(`세일 중이라 ${discount} 다시 봄`).replace(/\s+/g, ' ').trim()).toBe('세일 중이라 다시 봄')
  })

  it('"가격 비교:"로 시작해도 앱이 만드는 형식이 아니면 사용자가 쓴 것이다 (GPT 후속 확인)', () => {
    expect(userWrittenReason('가격 비교: 세일이라 쌈 (오늘만)')).toBe('가격 비교: 세일이라 쌈 (오늘만)')
    expect(userWrittenReason('가격 비교: 상품 A 100mL당 333.33원 (총 1,800mL · 6,000원)').trim()).toBe('')
    expect(userWrittenReason('가격 비교: 상품 B 1개당 1,234.5원 (총 12개 · 14,814원)').trim()).toBe('')
  })

  it('문장을 고쳐 형식이 달라지면 사용자가 쓴 것으로 본다', () => {
    expect(userWrittenReason('가격 비교: B안 결제액 72,000원 할인')).toBe('가격 비교: B안 결제액 72,000원 할인')
  })
})

// PRD F31 담기 폼에 넣을 때는 빈 칸만 채운다 (AC54): 적어 둔 상품명·가격은 그대로, 링크는 둔 칸으로 세지 않는다
describe('사진 결과를 담기 폼에 합치기 (F31)', () => {
  const photo = { name: '농심 오징어짬뽕 소컵 6입', price: 3980, url: 'https://search.danawa.com/?query=x' }

  // plan: mergePhotoDraft fills only empty fields and lists kept ones
  it('AC54: 폼이 비어 있으면 상품명·가격·링크를 모두 채우고 둔 칸은 없다', () => {
    expect(mergePhotoDraft({ name: '', price: '', url: '' }, photo)).toEqual({
      name: '농심 오징어짬뽕 소컵 6입',
      price: '3980',
      url: 'https://search.danawa.com/?query=x',
      kept: [],
    })
  })

  it('AC54: 상품명 "라면"·가격 "4500"을 적어 뒀으면 그대로 두고 링크만 채우며 둔 칸은 상품명·가격 순이다', () => {
    expect(mergePhotoDraft({ name: '라면', price: '4500', url: '' }, photo)).toEqual({
      name: '라면',
      price: '4500',
      url: 'https://search.danawa.com/?query=x',
      kept: ['상품명', '가격'],
    })
  })

  it('가격만 적어 뒀으면 상품명을 채우고 가격은 그대로 두며 둔 칸은 가격뿐이다', () => {
    expect(mergePhotoDraft({ name: '', price: '4500', url: '' }, photo)).toMatchObject({ name: '농심 오징어짬뽕 소컵 6입', price: '4500', kept: ['가격'] })
  })

  it('상품명만 적어 뒀으면 가격을 채우고 상품명은 그대로 두며 둔 칸은 상품명뿐이다', () => {
    expect(mergePhotoDraft({ name: '라면', price: '', url: '' }, photo)).toMatchObject({ name: '라면', price: '3980', kept: ['상품명'] })
  })

  it('공백만 적힌 칸은 빈 칸으로 보고 채운다', () => {
    expect(mergePhotoDraft({ name: '   ', price: ' ', url: '  ' }, photo)).toEqual({
      name: '농심 오징어짬뽕 소컵 6입',
      price: '3980',
      url: 'https://search.danawa.com/?query=x',
      kept: [],
    })
  })

  it('링크를 이미 적어 뒀으면 그대로 두고 둔 칸으로 세지 않는다', () => {
    expect(mergePhotoDraft({ name: '', price: '', url: 'https://example.com/a' }, photo)).toMatchObject({ url: 'https://example.com/a', kept: [] })
  })

  it('AC54: 안내는 두 문장이고, 둔 칸이 있을 때만 끝에 "이미 적은 칸은 그대로 뒀어요: 상품명·가격"을 붙인다', () => {
    expect(photoDraftNotice([])).toBe('가격표 사진에서 상품명과 가격을 가져왔어요. 사고 싶은 이유를 적고 담아 두세요.')
    expect(photoDraftNotice(['상품명', '가격'])).toBe(
      '가격표 사진에서 상품명과 가격을 가져왔어요. 사고 싶은 이유를 적고 담아 두세요. 이미 적은 칸은 그대로 뒀어요: 상품명·가격',
    )
    expect(photoDraftNotice(['가격'])).toMatch(/ 이미 적은 칸은 그대로 뒀어요: 가격$/)
  })
})

// PRD F31 사진 초안의 링크 (판정 R29-P2): 링크 칸이 사진이 채운 주소 그대로이고 상품명이 달라졌을 때만 낡은 링크다
describe('사진 초안의 낡은 링크 가리기 (F31, AC69)', () => {
  const link = { name: '농심 오징어짬뽕 소컵 6입', url: 'https://search.danawa.com/?query=x' }

  it('AC69: isStaleLink는 링크가 그대로이고 앞뒤 공백을 뺀 상품명이 다를 때만 참이에요', () => {
    // 기준이 없으면(사진이 링크를 채우지 않았거나 이미 지웠거나 손으로 고쳤다) 거짓
    expect(isStaleLink(null, { name: '짬뽕 컵라면', url: link.url })).toBe(false)
    // 앞뒤 공백만 더하면 거짓
    expect(isStaleLink(link, { name: `${link.name} `, url: link.url })).toBe(false)
    expect(isStaleLink(link, { name: `  ${link.name}`, url: link.url })).toBe(false)
    // 링크를 고쳤으면 거짓
    expect(isStaleLink(link, { name: '짬뽕 컵라면', url: 'https://example.com/a' })).toBe(false)
    // 링크는 그대로인데 상품명을 고쳤으면 참
    expect(isStaleLink(link, { name: '짬뽕 컵라면', url: link.url })).toBe(true)
  })
})
