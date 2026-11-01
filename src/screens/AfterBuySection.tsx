import { useState, type FormEvent } from 'react'
import { returnDeadlineLine, returnReviewLine, validateReturnBy } from '../logic/afterBuy'
import { buildReturnIcs, returnGoogleCalendarUrl, returnIcsFileName } from '../logic/calendar'
import { toDayIso } from '../logic/subscriptions'
import type { WishItem } from '../logic/wishlist'
import type { WishlistApi } from '../store/useWishlist'
import { Button } from '../ui/Button'
import { downloadText } from '../ui/download'
import { TextField } from '../ui/Field'

export function AfterBuySection({ wishlist, today }: { wishlist: WishlistApi; today: Date }) {
  const [open, setOpen] = useState(false)
  const bought = wishlist.items.filter((item) => item.status === 'purchased')
  return <details className="card guide" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="card-title">산 뒤에</summary>
    {open ? <div className="stack">{bought.length ? bought.map((item) => <AfterCard key={item.id} item={item} wishlist={wishlist} today={today} />) : <p className="note">구매함에 있는 물건이 없어요.</p>}</div> : null}
  </details>
}

function AfterCard({ item, wishlist, today }: { item: WishItem; wishlist: WishlistApi; today: Date }) {
  const [returnRaw, setReturnRaw] = useState(item.returnBy ?? '')
  const [returnError, setReturnError] = useState('')
  const [confirmReturned, setConfirmReturned] = useState(false)
  const saveReturn = (event: FormEvent) => {
    event.preventDefault()
    const checked = validateReturnBy(returnRaw)
    if (checked.value === undefined) { setReturnError(checked.error ?? ''); return }
    if (wishlist.updateAfter(item.id, (current) => {
      const next = { ...current }
      if (checked.value) next.returnBy = checked.value
      else delete next.returnBy
      return next
    })) setReturnError('')
  }
  return <section className="card stack" aria-label={`${item.name} 산 뒤 확인`}>
    <p className="card-title">{item.name}</p>
    <form className="stack" aria-label={`${item.name} 반품 기한`} onSubmit={saveReturn} noValidate>
      <TextField label="반품 기한 (선택)" type="date" value={returnRaw} error={returnError || undefined} onChange={(event) => { setReturnRaw(event.target.value); setReturnError('') }} />
      <p className="note">판매처 기준을 확인해 주세요.</p>
      <div className="btn-row"><Button type="submit">기한 적기</Button></div>
    </form>
    {returnDeadlineLine(item, today) ? <p>{returnDeadlineLine(item, today)}</p> : null}
    {returnReviewLine(item, today) ? <p className="note">{returnReviewLine(item, today)}</p> : null}
    {item.returnBy ? <div className="stack" role="group" aria-label="반품 기한 캘린더">
      <p className="field-label">반품 기한 캘린더에 넣기:</p>
      <div className="btn-row"><a className="btn" href={returnGoogleCalendarUrl(item)} target="_blank" rel="noopener noreferrer">구글 캘린더</a><Button onClick={() => downloadText(returnIcsFileName(item), buildReturnIcs(item, new Date()), 'text/calendar;charset=utf-8')}>캘린더 파일(.ics)</Button></div>
    </div> : null}
    {item.returnedOn ? <p>{`${item.returnedOn}에 반품했다고 적었어요.`}</p> : confirmReturned ? <div role="group" aria-label="반품 기록 확인" className="stack">
      <p>반품했다고 기록할까요? 실제 환불은 판매처에서 확인해 주세요.</p>
      <div className="btn-row"><Button variant="danger" autoFocus onClick={() => { wishlist.updateAfter(item.id, (current) => ({ ...current, returnedOn: toDayIso(today) })); setConfirmReturned(false) }}>반품했어요</Button><Button onClick={() => setConfirmReturned(false)}>취소</Button></div>
    </div> : <div className="btn-row"><Button aria-label={`${item.name} 반품했어요`} onClick={() => setConfirmReturned(true)}>반품했어요</Button></div>}
  </section>
}
