import { useRef, useState, type FormEvent } from 'react'
import { comparePantryPurchases, type PantryPurchase } from '../logic/pantry'
import { formatWon } from '../logic/number'
import { parseDecimal, parseInteger } from '../logic/number'
import { parseDay } from '../logic/dates'
import {
  PANTRY_CORRUPT, PANTRY_KIND_LABEL, PANTRY_LEVEL_LABEL, PANTRY_REPLACED, PANTRY_RESET_NOTE,
  PANTRY_SAVE_FAILED, PANTRY_STORAGE_LABEL, PANTRY_UNAVAILABLE, nextPantryLevel,
  normalizePantryName, pantryAdded, pantryDeleteConfirm, pantryDiscardConfirm, pantryLevelChanged, pantryRecipeDeleteConfirm, pantryStockSaved,
  discardedThisMonth, expiringPantryItems, latestPantryPurchase, type PantryItem, type PantryKind,
  recipeAvailability, sortPantryRecipes, type PantryRecipe,
} from '../logic/pantry'
import { kindOf, toDayIso, type Subscription } from '../logic/subscriptions'
import { newId } from '../logic/wishlist'
import { usePantry } from '../store/usePantry'
import { deliveryOverlapLine } from '../logic/savingActions'
import { Button } from '../ui/Button'
import { SelectField, TextField } from '../ui/Field'
import { ResetConfirm } from '../ui/ResetConfirm'
import { useFocusFirstError } from '../ui/useFocusFirstError'
import { ShoppingDraftSection } from './ShoppingDraftSection'

type Props = { pantry: ReturnType<typeof usePantry>; subscriptions: readonly Subscription[]; today: Date; onCompare: (purchase: PantryPurchase) => void }
const LEVEL_ORDER = { out: 0, low: 1, plenty: 2 }

export function PantrySection({ pantry, subscriptions, today, onCompare }: Props) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<PantryKind>('essential')
  const [expiresOn, setExpiresOn] = useState('')
  const [expiryError, setExpiryError] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [discardId, setDiscardId] = useState<string | null>(null)
  const [stockConfirmId, setStockConfirmId] = useState<string | null>(null)
  const [eventFull, setEventFull] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const summaryRef = useRef<HTMLElement>(null)
  const items = [...pantry.store.items].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.name.localeCompare(b.name, 'ko'))
  const expiring = expiringPantryItems(items, today)
  const expiringIds = new Set(expiring.map((item) => item.id))
  const needed = items.filter((item) => item.level !== 'plenty' && !expiringIds.has(item.id))
  const other = items.filter((item) => item.level === 'plenty' && !expiringIds.has(item.id))
  const discarded = discardedThisMonth(pantry.store.events, today)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (!cleanName || cleanName.length > 40) { setError('이름은 1~40자로 적어 주세요.'); formRef.current?.querySelector('input')?.focus(); return }
    if (kind === 'ingredient' && expiresOn && !parseDay(expiresOn)) { setExpiryError('올바른 날짜를 골라 주세요'); return }
    const at = new Date().toISOString()
    const item: PantryItem = { id: newId(), name: cleanName, kind, level: 'plenty', ...(kind === 'ingredient' && expiresOn ? { expiresOn } : {}), purchases: [], createdAt: at, updatedAt: at }
    const result = pantry.addItem(item)
    if (result === 'duplicate') { setError('같은 이름이 이미 있어요.'); formRef.current?.querySelector('input')?.focus(); return }
    if (result === 'full') { setError('집에 있는 것은 200개까지 적을 수 있어요.'); formRef.current?.querySelector('input')?.focus(); return }
    if (result === 'replaced') { setMessage(''); return }
    setError('')
    setName('')
    setExpiresOn('')
    setExpiryError('')
    setMessage(pantryAdded(cleanName))
  }

  const changeLevel = (item: PantryItem) => {
    const level = nextPantryLevel(item.level)
    if (pantry.updateItem(item.id, (current) => ({ ...current, level, updatedAt: new Date().toISOString() }))) setMessage(pantryLevelChanged(item.name, level))
    else setMessage('')
  }

  const recordStock = (item: PantryItem, now: Date) => {
    const latest = latestPantryPurchase(item)
    if (!latest) return
    const event = { id: newId(), action: 'stock' as const, sourceId: item.id, name: item.name, day: toDayIso(today), amountKrw: latest.amountKrw, createdAt: now.toISOString() }
    const result = pantry.addEvent(event)
    setStockConfirmId(null)
    if (result === 'full') { setEventFull(true); return }
    setEventFull(false)
    if (result === 'ok') setMessage(pantryStockSaved(item.name))
    else setMessage('')
  }

  const row = (item: PantryItem) => {
    const delivery = subscriptions.some((sub) => !sub.cancelledOn && kindOf(sub) === 'delivery' && normalizePantryName(sub.name) === normalizePantryName(item.name))
    const overlap = deliveryOverlapLine(item, subscriptions, today)
    const latest = latestPantryPurchase(item)
    return <div className="card stack" role="group" aria-label={item.name} key={item.id}>
      <p className="card-title">{item.name}</p>
      <p className="card-meta">{PANTRY_KIND_LABEL[item.kind]}</p>
      {item.expiresOn ? <p className="card-meta">{`유통기한 ${item.expiresOn}`}</p> : null}
      {latest ? <p className="note">{`마지막으로 산 값: ${latest.place} · ${formatWon(latest.amountKrw)}`}</p> : null}
      {delivery ? <p className="note">정기배송으로 와요.</p> : null}
      {overlap ? <p className="note">{overlap}</p> : null}
      <div className="btn-row">
        <Button aria-label={`${item.name} 남은 정도: ${PANTRY_LEVEL_LABEL[item.level]}`} onClick={() => changeLevel(item)}>남은 정도: {PANTRY_LEVEL_LABEL[item.level]}</Button>
        <Button onClick={() => setDeleteId(item.id)}>지우기</Button>
        {item.kind === 'ingredient' ? <Button aria-label={`${item.name} 버렸어요`} onClick={() => setDiscardId(item.id)}>버렸어요</Button> : null}
        {latest ? <Button aria-label={`${item.name} 있어서 안 샀어요`} onClick={() => {
          if (pantry.store.events.some((event) => event.action === 'stock' && event.sourceId === item.id && event.day === toDayIso(today))) setStockConfirmId(item.id)
          else recordStock(item, new Date())
        }}>있어서 안 샀어요</Button> : null}
      </div>
      {deleteId === item.id ? <div role="group" aria-label="집에 있는 것 지우기 확인" className="stack">
        <p>{pantryDeleteConfirm(item.name)}</p>
        <div className="btn-row">
          <Button variant="danger" autoFocus onClick={() => { if (pantry.removeItem(item.id)) { setDeleteId(null); summaryRef.current?.focus() } else setDeleteId(null) }}>지우기</Button>
          <Button onClick={() => setDeleteId(null)}>취소</Button>
        </div>
      </div> : null}
      {stockConfirmId === item.id ? <div role="group" aria-label="같은 날 기록 확인" className="stack">
        <p>오늘 이미 적었어요. 한 번 더 적을까요?</p>
        <div className="btn-row"><Button autoFocus onClick={() => recordStock(item, new Date())}>한 번 더 적기</Button><Button onClick={() => setStockConfirmId(null)}>취소</Button></div>
      </div> : null}
      {discardId === item.id ? <div role="group" aria-label="식재료 버리기 확인" className="stack">
        <p>{pantryDiscardConfirm(item.name)}</p>
        <div className="btn-row">
          <Button variant="danger" autoFocus onClick={() => {
            const event = { id: newId(), action: 'discarded' as const, sourceId: item.id, name: item.name, day: toDayIso(today), amountKrw: latest?.amountKrw ?? 0, createdAt: new Date().toISOString() }
            const result = pantry.discardItem(item.id, event)
            setDiscardId(null)
            if (result === 'full') setEventFull(true)
            else setEventFull(false)
            if (result === 'ok') summaryRef.current?.focus()
          }}>버렸어요</Button>
          <Button onClick={() => setDiscardId(null)}>취소</Button>
        </div>
      </div> : null}
      <PurchaseRecorder item={item} pantry={pantry} today={today} onCompare={onCompare} />
    </div>
  }

  return <details className="card guide">
    <summary className="card-title" ref={summaryRef}>집에 있는 것</summary>
    <div className="stack">
      {pantry.status.kind !== 'ok' ? <div className="banner stack" role="status" aria-label={PANTRY_STORAGE_LABEL}>
        {pantry.status.kind === 'unavailable' ? <p>{PANTRY_UNAVAILABLE}</p> : null}
        {pantry.status.kind === 'save-failed' ? <><p>{PANTRY_SAVE_FAILED}</p><Button onClick={pantry.retrySave}>다시 저장</Button></> : null}
        {pantry.status.kind === 'replaced' ? <><p>{PANTRY_REPLACED}</p><Button onClick={pantry.dismissNotice}>확인</Button></> : null}
        {pantry.status.kind === 'corrupt' ? <><p>{PANTRY_CORRUPT}</p><ResetConfirm label="집에 있는 것 기록 초기화" note={PANTRY_RESET_NOTE} onReset={pantry.resetStorage} /></> : null}
      </div> : null}
      <form className="stack" aria-label="집에 있는 것 적기" ref={formRef} onSubmit={submit} noValidate>
        <TextField label="이름" value={name} error={error || undefined} onChange={(event) => { setName(event.target.value); setError('') }} />
        <SelectField label="종류" value={kind} onChange={(event) => { setKind(event.target.value as PantryKind); if (event.target.value !== 'ingredient') setExpiresOn('') }}>
          <option value="essential">생필품</option><option value="ingredient">식재료</option>
        </SelectField>
        {kind === 'ingredient' ? <TextField label="유통기한 (선택)" type="date" value={expiresOn} error={expiryError || undefined} onChange={(event) => { setExpiresOn(event.target.value); setExpiryError('') }} /> : null}
        <div className="btn-row"><Button variant="primary" type="submit">적기</Button></div>
      </form>
      <p role="status" aria-label="집에 있는 것 알림" className="note">{message}</p>
      {eventFull ? <p role="alert" className="field-error">기록이 너무 많아 더 적을 수 없어요.</p> : null}
      {items.length === 0 ? <p className="note">아직 적은 것이 없어요.</p> : null}
      {expiring.length > 0 ? <section className="stack" aria-label="먼저 쓸 것"><p className="card-title">먼저 쓸 것</p>{expiring.map(row)}</section> : null}
      {needed.length > 0 ? <section className="stack" aria-label="살 때가 된 것"><p className="card-title">살 때가 된 것</p>{needed.map(row)}</section> : null}
      <ShoppingDraftSection items={pantry.store.items} recipes={pantry.store.recipes} />
      {other.length > 0 ? <details><summary>{`집에 있는 것 (${other.length}개)`}</summary><div className="stack">{other.map(row)}</div></details> : null}
      {discarded.count > 0 ? <details><summary>{`버린 식재료 ${discarded.count}개 · ${formatWon(discarded.amountKrw)}`}</summary>
        <div className="stack">{pantry.store.events.filter((event) => event.action === 'discarded' && event.day.slice(0, 7) === toDayIso(today).slice(0, 7)).map((event) => <p key={event.id}>{`${event.day} · ${event.name} · ${formatWon(event.amountKrw)}`}</p>)}</div>
      </details> : null}
      <RecipesSection pantry={pantry} today={today} />
    </div>
  </details>
}

function RecipesSection({ pantry, today }: { pantry: ReturnType<typeof usePantry>; today: Date }) {
  const [name, setName] = useState('')
  const [ingredientsRaw, setIngredientsRaw] = useState('')
  const [estimateRaw, setEstimateRaw] = useState('')
  const [errors, setErrors] = useState<Partial<Record<'name' | 'ingredients' | 'estimate', string>>>({})
  const [message, setMessage] = useState('')
  const [full, setFull] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { ref, focusFirstError } = useFocusFirstError<HTMLFormElement>()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const cleanName = name.trim()
    const parts = [...new Map(ingredientsRaw.split(',').map((part) => part.trim()).filter(Boolean).map((part) => [normalizePantryName(part), part])).values()]
    const estimate = estimateRaw.trim() ? parseInteger(estimateRaw) : null
    const nextErrors: typeof errors = {}
    if (!cleanName || cleanName.length > 40) nextErrors.name = '이름은 1~40자로 적어 주세요.'
    if (parts.length < 1 || parts.length > 10 || parts.some((part) => part.length > 40)) nextErrors.ingredients = '재료는 1~10개를 쉼표로 나누어 적어 주세요.'
    if (estimateRaw.trim() && (estimate === null || estimate < 1 || estimate > 100000)) nextErrors.estimate = '금액은 1원~10만 원 사이여야 해요.'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); focusFirstError(); return }
    const at = new Date().toISOString()
    const recipe: PantryRecipe = { id: newId(), name: cleanName, ingredients: parts, ...(estimate !== null ? { estimateKrw: estimate } : {}), createdAt: at, updatedAt: at }
    const result = pantry.addRecipe(recipe)
    if (result === 'full') { setFull(true); return }
    if (result === 'replaced') return
    setName(''); setIngredientsRaw(''); setEstimateRaw(''); setErrors({}); setFull(false)
  }
  const cook = (recipe: PantryRecipe, now: Date) => {
    const event = { id: newId(), action: 'cooked' as const, sourceId: recipe.id, name: recipe.name, day: toDayIso(today), amountKrw: recipe.estimateKrw ?? 0, createdAt: now.toISOString() }
    const result = pantry.addEvent(event)
    if (result === 'full') { setFull(true); return }
    if (result === 'ok') setMessage(`‘${recipe.name}’ 해 먹은 기록을 적었어요.`)
    else setMessage('')
  }
  return <section className="stack" aria-label="자주 해 먹는 것">
    <p className="card-title">자주 해 먹는 것</p>
    <form className="stack" aria-label="자주 해 먹는 것 적기" ref={ref} onSubmit={submit} noValidate>
      <TextField label="이름" value={name} error={errors.name} onChange={(e) => { setName(e.target.value); setErrors({}) }} />
      <TextField label="재료 이름" hint="쉼표로 나누어 적어 주세요." value={ingredientsRaw} error={errors.ingredients} onChange={(e) => { setIngredientsRaw(e.target.value); setErrors({}) }} />
      <TextField label="배달 대신 썼을 금액 (선택)" inputMode="numeric" value={estimateRaw} error={errors.estimate} onChange={(e) => { setEstimateRaw(e.target.value); setErrors({}) }} />
      <div className="btn-row"><Button type="submit">적기</Button></div>
    </form>
    {full ? <p role="alert" className="field-error">기록이 너무 많아 더 적을 수 없어요.</p> : null}
    <p role="status" aria-label="해 먹은 것 알림" className="note">{message}</p>
    {sortPantryRecipes(pantry.store.recipes, pantry.store.items).map((recipe) => {
      const available = recipeAvailability(recipe, pantry.store.items)
      return <div key={recipe.id} className="card stack" role="group" aria-label={recipe.name}>
        <p className="card-title">{recipe.name}</p>
        <p>{`있는 재료 ${available.count}/${available.total}개`}</p>
        {available.missing.length ? <p className="note">{`부족한 재료: ${available.missing.join(', ')}`}</p> : null}
        {recipe.estimateKrw ? <p className="note">{`배달 대신 썼을 금액 ${formatWon(recipe.estimateKrw)}`}</p> : null}
        <div className="btn-row"><Button aria-label={`${recipe.name} 해 먹었어요`} onClick={() => cook(recipe, new Date())}>해 먹었어요</Button><Button onClick={() => setDeleteId(recipe.id)}>지우기</Button></div>
        {deleteId === recipe.id ? <div className="stack" role="group" aria-label="자주 해 먹는 것 지우기 확인"><p>{pantryRecipeDeleteConfirm(recipe.name)}</p><div className="btn-row"><Button variant="danger" autoFocus onClick={() => { pantry.removeRecipe(recipe.id); setDeleteId(null) }}>지우기</Button><Button onClick={() => setDeleteId(null)}>취소</Button></div></div> : null}
      </div>
    })}
  </section>
}

function PurchaseRecorder({ item, pantry, today, onCompare }: { item: PantryItem; pantry: ReturnType<typeof usePantry>; today: Date; onCompare: (purchase: PantryPurchase) => void }) {
  const [place, setPlace] = useState('')
  const [amount, setAmount] = useState('')
  const [size, setSize] = useState('')
  const [unit, setUnit] = useState<PantryPurchase['unit']>('g')
  const [day, setDay] = useState(toDayIso(today))
  const [errors, setErrors] = useState<Partial<Record<'place' | 'amount' | 'size' | 'day', string>>>({})
  const [full, setFull] = useState(false)
  const { ref, focusFirstError } = useFocusFirstError<HTMLFormElement>()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: typeof errors = {}
    const cleanPlace = place.trim()
    const parsedAmount = parseInteger(amount)
    const parsedSize = parseDecimal(size)
    if (!cleanPlace || cleanPlace.length > 30) nextErrors.place = '곳은 1~30자로 적어 주세요.'
    if (parsedAmount === null || parsedAmount < 1 || parsedAmount > 1_000_000_000) nextErrors.amount = '금액은 1원~10억 원 사이여야 해요.'
    if (parsedSize === null || parsedSize <= 0 || parsedSize > 10_000_000 || Math.round(parsedSize * 1000) !== parsedSize * 1000 || (unit === 'ea' && !Number.isInteger(parsedSize))) nextErrors.size = '용량을 올바르게 적어 주세요.'
    if (!parseDay(day) || day > toDayIso(today)) nextErrors.day = '산 날은 오늘이거나 그 전이어야 해요.'
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); focusFirstError(); return }
    const purchase: PantryPurchase = { id: newId(), day, place: cleanPlace, amountKrw: parsedAmount!, size: parsedSize!, unit, createdAt: new Date().toISOString() }
    const result = pantry.addPurchase(item.id, purchase)
    if (result === 'full') { setFull(true); return }
    if (result === 'replaced') return
    setPlace(''); setAmount(''); setSize(''); setErrors({}); setFull(false)
  }
  const pair = item.purchases.slice(-2)
  const latest = latestPantryPurchase(item)
  return <details>
    <summary>산 값 적기·비교</summary>
    <div className="stack">
      <form className="stack" aria-label={`${item.name} 산 값 적기`} ref={ref} onSubmit={submit} noValidate>
        <TextField label="산 날" type="date" max={toDayIso(today)} value={day} error={errors.day} onChange={(e) => { setDay(e.target.value); setErrors({}) }} />
        <TextField label="곳" value={place} error={errors.place} onChange={(e) => { setPlace(e.target.value); setErrors({}) }} />
        <TextField label="금액" inputMode="numeric" value={amount} error={errors.amount} onChange={(e) => { setAmount(e.target.value); setErrors({}) }} />
        <TextField label="용량" inputMode="decimal" value={size} error={errors.size} onChange={(e) => { setSize(e.target.value); setErrors({}) }} />
        <SelectField label="단위" value={unit} onChange={(e) => setUnit(e.target.value as PantryPurchase['unit'])}>
          <option value="g">g</option><option value="kg">kg</option><option value="mL">mL</option><option value="L">L</option><option value="ea">개</option>
        </SelectField>
        <div className="btn-row"><Button type="submit">산 값 적기</Button></div>
      </form>
      {full ? <p role="alert" className="field-error">산 값은 5개까지예요</p> : null}
      {item.purchases.map((purchase) => <p key={purchase.id}>{`${purchase.day} · ${purchase.place} · ${formatWon(purchase.amountKrw)} · ${purchase.size}${purchase.unit === 'ea' ? '개' : purchase.unit}`}</p>)}
      {pair.length === 2 ? <><p>{comparePantryPurchases(pair[0], pair[1])}</p><p className="note">실제로 필요한 양과 총지출도 함께 보세요.</p></> : null}
      {latest ? <div className="btn-row"><Button onClick={() => onCompare(latest)}>묶음 비교로 보내기</Button></div> : null}
    </div>
  </details>
}
