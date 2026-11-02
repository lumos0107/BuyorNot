import { useState } from 'react'
import { formatWon } from '../../logic/number'
import { Button } from '../../ui/Button'

// 2026-11-02 로컬 Gemini(gemini-3.5-flash-lite) /api/read-tag 응답에서 상품명·가격·개수만 고치지 않고 옮겼다.
// ramen·jelly는 제작자가 직접 찍은 사진, rt01은 CC0 차 진열 사진이다. 처음에는 라면 진열대를 보여 준다(2026-11-02 제작자 요청). 공개 화면에서는 AI를 호출하지 않는다.
const samples = [
  {
    id: 'ramen', label: '라면 진열대', alt: '라면 봉지와 컵라면, 선반 가격표가 보이는 라면 진열대',
    items: [
      { name: '농심)사천왕마라탕면컵', price: 2700, count: null },
      { name: '신마이랑신룽푸마라탕면', price: 2000, count: null },
      { name: '농심신라면', price: 1000, count: null },
      { name: '농심)신라면더레드봉지', price: 1500, count: null },
      { name: '농심)신라면블랙', price: 1900, count: null },
    ],
  },
  {
    id: 'rt01', label: '차 진열대', alt: '차 상자 여섯 개와 노란 가격표가 보이는 차 진열대',
    items: [
      { name: '샘표순작연근우엉차', price: 7100, count: null },
      { name: '샘표도라지생강차티백', price: 8300, count: null },
      { name: '샘표순작작두콩차티백', price: 8300, count: null },
      { name: '동서루이보스보리차/50T', price: 4500, count: 50 },
      { name: '동서한잔용옥수수차', price: 4950, count: 50 },
      { name: '(동서)한잔용보리차', price: 4550, count: 50 },
    ],
  },
  {
    id: 'jelly', label: '젤리 진열대', alt: '젤리 봉지가 걸려 있고 가격표가 붙은 젤리 진열대',
    items: [
      { name: '페타구구미', price: 1800, count: null },
      { name: '피니해피소스믹스', price: 1200, count: null },
      { name: '피니콜라보틀', price: 1000, count: null },
      { name: '피니해피믹스', price: null, count: null },
      { name: '피니피지웜', price: null, count: null },
      { name: '구미다요', price: null, count: null },
      { name: '리치알알이', price: 1200, count: null },
      { name: '청포도알알이', price: 1200, count: null },
      { name: '마이구미', price: 1000, count: null },
      { name: '마이구미복숭아포도', price: 1000, count: null },
      { name: '왕꿈틀이', price: 1000, count: null },
      { name: '탱글탱글키위', price: 2500, count: null },
      { name: '레전', price: 1700, count: null },
      { name: '레전사워젤리', price: 1700, count: null },
      { name: '제조애플탱탱', price: 2500, count: null },
      { name: '까먹는포도젤리', price: 2000, count: null },
      { name: '까먹는망고젤리', price: 2000, count: null },
    ],
  },
] as const

// 다나와 상품 페이지(pcode)에서 직접 확인한 표시 가격. 배송비와 쿠폰은 포함하지 않는다. AI가 찾은 값이 아니다.
// 사진의 포장 표기를 완전히 대조할 수 없어 온라인 상품과 동일 상품인지 구매 전에 확인해야 한다.
// 라면·젤리는 낱개(1개) 상품 페이지만 연결했다. 용량이 다르거나(사천왕 마라탕면 54g ↔ 사진 100g 컵)
// 같은 상품을 찾지 못한 것(신룽푸 마라탕면·피니·탱글탱글 키위 등)은 적지 않았다.
const danawaChecks: Record<string, { checkedOn: string; rows: readonly { name: string; shelf: number; online: number; pcode: string }[] }> = {
  rt01: {
    checkedOn: '2026-11-02',
    rows: [
      { name: '순작 연근우엉차 40T', shelf: 7100, online: 3920, pcode: '4282090' },
      { name: '순작 작두콩차 40T', shelf: 8300, online: 4770, pcode: '112191750' },
      { name: '동서 루이보스 보리차 50T', shelf: 4500, online: 2880, pcode: '3731826' },
      { name: '동서 한잔용 보리차 50T', shelf: 4550, online: 2260, pcode: '15463367' },
    ],
  },
  ramen: {
    checkedOn: '2026-11-03',
    rows: [
      { name: '농심 신라면 120g (1개)', shelf: 1000, online: 630, pcode: '1238763' },
      { name: '농심 신라면 더 레드 125g (1개)', shelf: 1500, online: 1160, pcode: '27789860' },
      { name: '농심 신라면 블랙 134g (1개)', shelf: 1900, online: 1480, pcode: '116017382' },
    ],
  },
  jelly: {
    checkedOn: '2026-11-03',
    rows: [
      { name: '오리온 리찌 알맹이 67g (1개)', shelf: 1200, online: 800, pcode: '117066478' },
      { name: '오리온 마이구미 포도 66g (1개)', shelf: 1000, online: 790, pcode: '72221399' },
      { name: '오리온 왕꿈틀이 67g (1개)', shelf: 1000, online: 790, pcode: '116488851' },
    ],
  },
}

export function DemoPhotoCompare() {
  const [selected, setSelected] = useState(0)
  const sample = samples[selected]
  const danawa = danawaChecks[sample.id]
  const withCount = sample.items.filter((item) => item.count !== null && item.price !== null)
  const cheapest = withCount.length ? [...withCount].sort((a, b) => a.price! / a.count! - b.price! / b.count!)[0] : null

  return <section className="stack" aria-label="가격표 사진 예시 시연">
    <h3 className="section-title">가격표 사진 예시</h3>
    <div className="card stack">
      <p className="note"><strong>저장된 시연 결과입니다.</strong> 아래 세 사진은 로컬 Gemini로 미리 읽었습니다. 사진 버튼은 사진을 다시 분석하지 않고, 당시 결과만 보여 줍니다. 직접 올린 사진 분석과 온라인 가격 조회는 현재 사용할 수 없습니다.</p>
      <div className="btn-row" role="group" aria-label="예시 사진 선택">
        {samples.map((item, index) => <Button key={item.id} aria-pressed={selected === index} onClick={() => setSelected(index)}>{item.label}</Button>)}
      </div>
      <img src={`${import.meta.env.BASE_URL}demo/${sample.id}.jpg`} alt={sample.alt} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '12px' }} />
    </div>
    {/* 처음부터 고른 사진의 저장된 결과를 펼쳐 둔다 (F83, 2026-11-02 제작자 요청 "들어가자마자 켜져 있도록") */}
    <section className="card stack" aria-label="미리 읽은 품목과 가격 비교">
      <h4 className="card-title">미리 읽은 품목과 가격</h4>
      <p className="note">2026-11-02 로컬 Gemini 응답을 그대로 옮겼습니다. 가격표가 흐려 잘못 읽은 항목이 있을 수 있어요.</p>
      <ul className="result-list demo-photo-results">{sample.items.map((item) => <li key={item.name}><span>{item.name}</span><strong>{item.price === null ? '가격표를 읽지 못함' : formatWon(item.price)}{item.price !== null && item.count ? ` · ${item.count}개입, 1개당 ${formatWon(Math.round(item.price / item.count))}` : ''}</strong></li>)}</ul>
      {cheapest ? <p><strong>개당 표시 가격이 가장 낮은 항목:</strong> {cheapest.name} · 약 {formatWon(Math.round(cheapest.price! / cheapest.count!))}/개</p> : null}
      <p className="note">한 사진에 보인 여러 상품의 가격표를 읽은 예시입니다. 같은 상품의 다른 판매처 가격이나 실제 결제액과 비교한 결과가 아닙니다.</p>
      {danawa ? <section className="stack" aria-label="다나와 표시 가격 비교">
        <h4 className="card-title">다나와 표시 가격 비교</h4>
        <p className="note">{danawa.checkedOn}에 다나와 상품 페이지에서 확인한 저장된 가격입니다. 사진 가격표와 이름·용량이 비슷한 상품만 연결했고, 같은 상품을 찾지 못한 항목은 적지 않았습니다. 배송비·쿠폰은 빠진 표시 가격이며, 포장과 실제 결제액은 구매 전에 다시 확인하세요. 지금 실시간으로 조회하지 않고 {danawa.checkedOn}에 저장한 가격으로 비교합니다.</p>
        <ul className="result-list demo-photo-results">{danawa.rows.map((item) => <li key={item.pcode} className="danawa-row">
          <span>{item.name}</span>
          <strong>사진 {formatWon(item.shelf)} → 다나와 {formatWon(item.online)}</strong>
          <a className="btn danawa-link" href={`https://prod.danawa.com/info/?pcode=${item.pcode}`} target="_blank" rel="noopener noreferrer" aria-label={`${item.name} 다나와 상품 보기(새 창)`}>다나와 상품 보기</a>
        </li>)}</ul>
      </section> : null}
    </section>
  </section>
}
