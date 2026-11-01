import { useState, type FormEvent } from 'react'
import { installmentLine, validateInstallment } from '../logic/beforeBuy'
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
  </section>
}
