import { useState, type FormEvent } from 'react'
import { ALTERNATIVE_LINKS, ALTERNATIVE_NOTE, installmentLine, usageCostLine, validateInstallment, validateUsesPerYear } from '../logic/beforeBuy'
import { formatWon } from '../logic/number'
import type { PantryStore } from '../logic/pantry'
import type { WishItem } from '../logic/wishlist'
import type { WishlistApi } from '../store/useWishlist'
import { Button } from '../ui/Button'
import { TextField } from '../ui/Field'
import { useFocusFirstError } from '../ui/useFocusFirstError'

export function BeforeBuySection({ wishlist, pantry }: { wishlist: WishlistApi; pantry: PantryStore }) {
  const [open, setOpen] = useState(false)
  const considering = wishlist.items.filter((item) => item.status === 'considering')
  return <details className="card guide" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="card-title">사기 전에</summary>
    {open ? <div className="stack">
      {considering.length === 0 ? <p className="note">지금 고민 중인 물건이 없어요.</p> : considering.map((item) => <BeforeCard key={item.id} item={item} wishlist={wishlist} pantry={pantry} />)}
    </div> : null}
  </details>
}

function BeforeCard({ item, wishlist }: { item: WishItem; wishlist: WishlistApi; pantry: PantryStore }) {
  const [months, setMonths] = useState(item.installment ? String(item.installment.months) : '')
  const [monthly, setMonthly] = useState(item.installment ? String(item.installment.monthlyKrw) : '')
  const [errors, setErrors] = useState<ReturnType<typeof validateInstallment>['errors']>({})
  const [uses, setUses] = useState(item.usesPerYear ? String(item.usesPerYear) : '')
  const [usesError, setUsesError] = useState('')
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
  return <section className="card stack" aria-label={`${item.name} 사기 전 확인`}>
    <p className="card-title">{item.name}</p>
    <p className="note">{`일시불 ${formatWon(item.priceKrw)}`}</p>
    <form className="stack" aria-label={`${item.name} 할부`} ref={ref} onSubmit={save} noValidate>
      <p className="field-label">할부 (선택)</p>
      <TextField label="할부 개월" inputMode="numeric" value={months} error={errors.months} onChange={(e) => { setMonths(e.target.value); setErrors({}) }} />
      <TextField label="월 납입금" inputMode="numeric" value={monthly} error={errors.monthly} onChange={(e) => { setMonthly(e.target.value); setErrors({}) }} />
      <div className="btn-row"><Button type="submit">할부 적기</Button></div>
    </form>
    {installmentLine(item) ? <p>{installmentLine(item)}</p> : null}
    <form className="stack" aria-label={`${item.name} 사용 횟수`} onSubmit={saveUses} noValidate>
      <TextField label="1년에 몇 번 쓸까요? (선택)" inputMode="numeric" value={uses} error={usesError || undefined} onChange={(e) => { setUses(e.target.value); setUsesError('') }} />
      <div className="btn-row"><Button type="submit">횟수 적기</Button></div>
    </form>
    {usageCostLine(item) ? <>
      <p>{usageCostLine(item)}</p>
      <p className="note">{ALTERNATIVE_NOTE}</p>
      <div className="btn-row">{ALTERNATIVE_LINKS.map((link) => <a key={link.href} className="btn" href={link.href} target="_blank" rel="noopener noreferrer">{link.name}</a>)}</div>
    </> : item.usesPerYear ? <p className="note">{`1년에 ${item.usesPerYear}번`}</p> : null}
  </section>
}
