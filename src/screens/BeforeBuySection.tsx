import { useState, type FormEvent } from 'react'
import { ALTERNATIVE_LINKS, ALTERNATIVE_NOTE, addPriceNote, beforeBuySummaryLines, bulkUseLine, priceTargetMetLine, usageCostLine, validateBulkUse, validateInstallment, validateSeenPrice, validateTargetPrice, validateUsesPerYear } from '../logic/beforeBuy'
import type { PantryStore } from '../logic/pantry'
import type { WishItem } from '../logic/wishlist'
import { toDayIso } from '../logic/subscriptions'
import type { WishlistApi } from '../store/useWishlist'
import { Button } from '../ui/Button'
import { TextField } from '../ui/Field'
import { useFocusFirstError } from '../ui/useFocusFirstError'

export function BeforeBuySection({ wishlist, pantry, today }: { wishlist: WishlistApi; pantry: PantryStore; today: Date }) {
  const [open, setOpen] = useState(false)
  const considering = wishlist.items.filter((item) => item.status === 'considering')
  return <details className="card guide" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="card-title">사기 전에</summary>
    {open ? <div className="stack">
      {considering.length === 0 ? <p className="note">지금 고민 중인 물건이 없어요.</p> : considering.map((item) => <BeforeCard key={item.id} item={item} wishlist={wishlist} pantry={pantry} today={today} />)}
    </div> : null}
  </details>
}

function BeforeCard({ item, wishlist, pantry, today }: { item: WishItem; wishlist: WishlistApi; pantry: PantryStore; today: Date }) {
  const [months, setMonths] = useState(item.installment ? String(item.installment.months) : '')
  const [monthly, setMonthly] = useState(item.installment ? String(item.installment.monthlyKrw) : '')
  const [errors, setErrors] = useState<ReturnType<typeof validateInstallment>['errors']>({})
  const [uses, setUses] = useState(item.usesPerYear ? String(item.usesPerYear) : '')
  const [usesError, setUsesError] = useState('')
  const [bulkTotal, setBulkTotal] = useState(item.bulkUse ? String(item.bulkUse.total) : '')
  const [bulkMonthly, setBulkMonthly] = useState(item.bulkUse ? String(item.bulkUse.monthlyUse) : '')
  const [bulkExpires, setBulkExpires] = useState(item.bulkUse?.expiresMonths ? String(item.bulkUse.expiresMonths) : '')
  const [bulkErrors, setBulkErrors] = useState<ReturnType<typeof validateBulkUse>['errors']>({})
  const [targetRaw, setTargetRaw] = useState(item.targetPriceKrw ? String(item.targetPriceKrw) : '')
  const [targetError, setTargetError] = useState('')
  const [seenDay, setSeenDay] = useState(toDayIso(today))
  const [seenPrice, setSeenPrice] = useState('')
  const [seenErrors, setSeenErrors] = useState<ReturnType<typeof validateSeenPrice>['errors']>({})
  const [seenFull, setSeenFull] = useState(false)
  const { ref, focusFirstError } = useFocusFirstError<HTMLFormElement>()
  const save = (event: FormEvent) => {
    event.preventDefault()
    const checked = validateInstallment({ months, monthly })
    if (checked.value === undefined) { setErrors(checked.errors); focusFirstError(); return }
    const applied = wishlist.updateBefore(item.id, (current) => {
      const next = { ...current }
      if (checked.value) next.installment = checked.value
      else delete next.installment
      return next
    })
    if (applied) setErrors({})
  }
  const saveUses = (event: FormEvent) => {
    event.preventDefault()
    const checked = validateUsesPerYear(uses)
    if (checked.value === undefined) { setUsesError(checked.error ?? ''); return }
    if (wishlist.updateBefore(item.id, (current) => {
      const next = { ...current }
      if (checked.value !== null) next.usesPerYear = checked.value
      else delete next.usesPerYear
      return next
    })) setUsesError('')
  }
  const saveBulk = (event: FormEvent) => {
    event.preventDefault()
    const checked = validateBulkUse({ total: bulkTotal, monthlyUse: bulkMonthly, expiresMonths: bulkExpires })
    if (checked.value === undefined) { setBulkErrors(checked.errors); return }
    if (wishlist.updateBefore(item.id, (current) => {
      const next = { ...current }
      if (checked.value) next.bulkUse = checked.value
      else delete next.bulkUse
      return next
    })) setBulkErrors({})
  }
  const saveTarget = (event: FormEvent) => {
    event.preventDefault()
    const checked = validateTargetPrice(targetRaw)
    if (checked.value === undefined) { setTargetError(checked.error ?? ''); return }
    if (wishlist.updateBefore(item.id, (current) => {
      const next = { ...current }
      if (checked.value !== null) next.targetPriceKrw = checked.value
      else delete next.targetPriceKrw
      return next
    })) setTargetError('')
  }
  const saveSeen = (event: FormEvent) => {
    event.preventDefault()
    const checked = validateSeenPrice({ day: seenDay, price: seenPrice }, today)
    if (!checked.value) { setSeenErrors(checked.errors); return }
    const next = addPriceNote(item.priceNotes, checked.value)
    if (next === 'full') { setSeenFull(true); return }
    if (wishlist.updateBefore(item.id, (current) => ({ ...current, priceNotes: next }))) { setSeenPrice(''); setSeenErrors({}); setSeenFull(false) }
  }
  return <section className="card stack" aria-label={`${item.name} 사기 전 확인`}>
    <p className="card-title">{item.name}</p>
    <div className="stack" aria-label="한눈에 확인">
      <p className="field-label">한눈에 확인</p>
      {beforeBuySummaryLines(item, pantry.items).map((line) => <p key={line} className="note">{line}</p>)}
    </div>
    <details>
      <summary>자세히 확인·적기</summary>
      <div className="stack">
    <form className="stack" aria-label={`${item.name} 할부`} ref={ref} onSubmit={save} noValidate>
      <p className="field-label">할부 (선택)</p>
      <TextField label="할부 개월" inputMode="numeric" value={months} error={errors.months} onChange={(e) => { setMonths(e.target.value); setErrors({}) }} />
      <TextField label="월 납입금" inputMode="numeric" value={monthly} error={errors.monthly} onChange={(e) => { setMonthly(e.target.value); setErrors({}) }} />
      <div className="btn-row"><Button type="submit">할부 적기</Button></div>
    </form>
    <form className="stack" aria-label={`${item.name} 사용 횟수`} onSubmit={saveUses} noValidate>
      <TextField label="1년에 몇 번 쓸까요? (선택)" inputMode="numeric" value={uses} error={usesError || undefined} onChange={(e) => { setUses(e.target.value); setUsesError('') }} />
      <div className="btn-row"><Button type="submit">횟수 적기</Button></div>
    </form>
    {usageCostLine(item) ? <>
      <p>{usageCostLine(item)}</p>
      <p className="note">{ALTERNATIVE_NOTE}</p>
      <div className="btn-row">{ALTERNATIVE_LINKS.map((link) => <a key={link.href} className="btn" href={link.href} target="_blank" rel="noopener noreferrer">{link.name}</a>)}</div>
    </> : null}
    <form className="stack" aria-label={`${item.name} 대용량 사용`} onSubmit={saveBulk} noValidate>
      <p className="field-label">대용량 사용 (선택)</p>
      <TextField label="총량" inputMode="decimal" value={bulkTotal} error={bulkErrors.total} onChange={(e) => { setBulkTotal(e.target.value); setBulkErrors({}) }} />
      <TextField label="한 달 사용량" inputMode="decimal" value={bulkMonthly} error={bulkErrors.monthlyUse} onChange={(e) => { setBulkMonthly(e.target.value); setBulkErrors({}) }} />
      <TextField label="유통기한 (개월, 선택)" inputMode="numeric" value={bulkExpires} error={bulkErrors.expiresMonths} onChange={(e) => { setBulkExpires(e.target.value); setBulkErrors({}) }} />
      <div className="btn-row"><Button type="submit">사용량 적기</Button></div>
    </form>
    {bulkUseLine(item) ? <p className={bulkUseLine(item)?.warning ? 'field-error' : 'note'}>{bulkUseLine(item)?.line}</p> : null}
    <form className="stack" aria-label={`${item.name} 목표가`} onSubmit={saveTarget} noValidate>
      <TextField label="목표가 (선택)" inputMode="numeric" value={targetRaw} error={targetError || undefined} onChange={(e) => { setTargetRaw(e.target.value); setTargetError('') }} />
      <div className="btn-row"><Button type="submit">목표가 적기</Button></div>
    </form>
    <form className="stack" aria-label={`${item.name} 본 값 적기`} onSubmit={saveSeen} noValidate>
      <TextField label="본 날" type="date" max={toDayIso(today)} value={seenDay} error={seenErrors.day} onChange={(e) => { setSeenDay(e.target.value); setSeenErrors({}) }} />
      <TextField label="본 가격" inputMode="numeric" value={seenPrice} error={seenErrors.price} onChange={(e) => { setSeenPrice(e.target.value); setSeenErrors({}) }} />
      <div className="btn-row"><Button type="submit">본 값 적기</Button></div>
    </form>
    {seenFull ? <p role="alert" className="field-error">본 값은 30개까지 적을 수 있어요.</p> : null}
    {priceTargetMetLine(item) ? <p className="note">{priceTargetMetLine(item)}</p> : null}
      </div>
    </details>
  </section>
}
