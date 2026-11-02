import { useState } from 'react'
import { formatWon } from '../../logic/number'
import { Button } from '../../ui/Button'

// 2026-11-02 로컬 Gemini 가격표 시험의 저장된 응답(rt01~rt03). 공개 화면에서는 AI를 호출하지 않는다.
const samples = [
  {
    id: 'rt01', label: '차 진열대 위 칸',
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
    id: 'rt02', label: '차 진열대 가운데 칸',
    items: [
      { name: '현미녹차', price: 2400, count: 25 },
      { name: '한잔용보리차', price: 1950, count: 20 },
      { name: '한잔용옥수수차', price: 2050, count: 20 },
      { name: '루이보스보리차', price: 2300, count: 25 },
      { name: '둥글레차', price: 3150, count: 25 },
    ],
  },
  {
    id: 'rt03', label: '차 진열대 아래 칸',
    items: [
      { name: '동서 한잔용 보리차', price: 8300, count: 100 },
      { name: '동서 한잔용 옥수수차', price: 8400, count: 100 },
      { name: '동서 현미녹차', price: 7600, count: 100 },
      { name: '동서 메밀차', price: 8300, count: 100 },
      { name: '동서 캐모마일 현미녹차', price: 10150, count: 80 },
    ],
  },
] as const

export function DemoPhotoCompare() {
  const [selected, setSelected] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const sample = samples[selected]
  const withCount = sample.items.filter((item) => item.count !== null)
  const cheapest = withCount.length ? [...withCount].sort((a, b) => a.price / a.count! - b.price / b.count!)[0] : null

  return <section className="stack" aria-label="가격표 사진 예시 시연">
    <h3 className="section-title">가격표 사진 예시</h3>
    <div className="card stack">
      <p className="note"><strong>저장된 시연 결과입니다.</strong> 아래 세 사진은 로컬 Gemini로 미리 읽었습니다. 지금 버튼은 사진을 다시 분석하지 않고, 당시 결과만 보여 줍니다. 직접 올린 사진 분석과 온라인 가격 조회는 현재 사용할 수 없습니다.</p>
      <div className="btn-row" role="group" aria-label="예시 사진 선택">
        {samples.map((item, index) => <Button key={item.id} aria-pressed={selected === index} onClick={() => { setSelected(index); setRevealed(false) }}>{item.label}</Button>)}
      </div>
      <img src={`${import.meta.env.BASE_URL}demo/${sample.id}.jpg`} alt={`${sample.label}의 차 상품과 가격표`} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '12px' }} />
      <Button variant="primary" onClick={() => setRevealed(true)}>이 사진의 저장된 결과 보기</Button>
    </div>
    {revealed ? <section className="card stack" aria-label="미리 읽은 품목과 가격 비교">
      <h4 className="card-title">미리 읽은 품목과 가격</h4>
      <p className="note">2026-11-02 로컬 Gemini 응답을 그대로 옮겼습니다. 가격표가 흐려 잘못 읽은 항목이 있을 수 있어요.</p>
      <ul className="result-list demo-photo-results">{sample.items.map((item) => <li key={item.name}><span>{item.name}</span><strong>{formatWon(item.price)}{item.count ? ` · ${item.count}개입, 1개당 ${formatWon(Math.round(item.price / item.count))}` : ''}</strong></li>)}</ul>
      {cheapest ? <p><strong>개당 표시 가격이 가장 낮은 항목:</strong> {cheapest.name} · 약 {formatWon(Math.round(cheapest.price / cheapest.count!))}/개</p> : null}
      <p className="note">서로 다른 차 종류와 포장량을 한 사진에서 비교한 예시입니다. 같은 상품의 최저가나 실제 결제액을 뜻하지 않습니다.</p>
    </section> : null}
  </section>
}
