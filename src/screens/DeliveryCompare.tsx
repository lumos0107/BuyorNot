import { useState } from 'react'
import { compareDelivery, deliveryMemberLines, freeDeliveryLine, minimumOrderLine, validateDeliverySide, type DeliveryRaw } from '../logic/delivery'
import { formatWon } from '../logic/number'
import type { Subscription } from '../logic/subscriptions'
import { TextField } from '../ui/Field'

const empty = (): DeliveryRaw => ({ name: '', menu: '', delivery: '', coupon: '', pickup: false, minimum: '', freeDelivery: '' })

export function DeliveryCompare({ subscriptions }: { subscriptions: readonly Subscription[] }) {
  const [a, setA] = useState<DeliveryRaw>(empty)
  const [b, setB] = useState<DeliveryRaw>(empty)
  const checkedA = validateDeliverySide(a)
  const checkedB = validateDeliverySide(b)
  const compared = checkedA.value && checkedB.value ? compareDelivery(checkedA.value, checkedB.value) : null
  const members = deliveryMemberLines(subscriptions)
  return <div className="stack">
    <h3 className="section-title">배달 앱 총액 비교</h3>
    <p className="note">앱에 보이는 메뉴 금액·배달비·쿠폰을 직접 적어 주세요. 값은 저장하지 않아요.</p>
    {members.map((line) => <p key={line} className="note">{line}</p>)}
    <div className="ab-grid">
      <DeliveryForm label="A안" raw={a} onChange={setA} />
      <DeliveryForm label="B안" raw={b} onChange={setB} />
    </div>
    {checkedA.value ? <DeliveryConditions name="A안" value={checkedA.value} /> : null}
    {checkedB.value ? <DeliveryConditions name="B안" value={checkedB.value} /> : null}
    {compared ? <section className="card stack" aria-label="배달 비교 결과">
      <p className="card-title">결과</p>
      <p>{compared.line}</p>
      <p>{`두 결제액 차이 ${formatWon(compared.difference)}`}</p>
      <p className="note">금액은 직접 적은 조건 기준이에요. 어느 앱을 쓸지는 직접 정해 주세요.</p>
    </section> : null}
  </div>
}

function DeliveryConditions({ name, value }: { name: string; value: NonNullable<ReturnType<typeof validateDeliverySide>['value']> }) {
  const minimum = minimumOrderLine(value)
  const free = freeDeliveryLine(value)
  return minimum || free ? <div className="card stack" aria-label={`${name} 주문 조건`}>
    {minimum ? <p>{minimum}</p> : null}
    {free ? <><p>{free}</p><p className="note">추가 상품이 필요한 물건인지는 직접 정해 주세요.</p></> : null}
  </div> : null
}

function DeliveryForm({ label, raw, onChange }: { label: string; raw: DeliveryRaw; onChange: (next: DeliveryRaw) => void }) {
  const checked = validateDeliverySide(raw)
  const [touched, setTouched] = useState<Partial<Record<keyof DeliveryRaw, boolean>>>({})
  const set = <K extends keyof DeliveryRaw>(key: K, value: DeliveryRaw[K]) => { onChange({ ...raw, [key]: value }); setTouched((prev) => ({ ...prev, [key]: true })) }
  const error = (key: keyof DeliveryRaw) => touched[key] ? checked.errors[key] : undefined
  return <form className="card stack" aria-label={`${label} 배달 입력`} onSubmit={(event) => event.preventDefault()} noValidate>
    <p className="card-title">{label}</p>
    <TextField label="앱 이름" value={raw.name} error={error('name')} onChange={(e) => set('name', e.target.value)} />
    <TextField label="메뉴 금액" inputMode="numeric" value={raw.menu} error={error('menu')} onChange={(e) => set('menu', e.target.value)} />
    <TextField label="배달비" inputMode="numeric" value={raw.delivery} error={error('delivery')} onChange={(e) => set('delivery', e.target.value)} />
    <TextField label="쿠폰" inputMode="numeric" value={raw.coupon} error={error('coupon')} onChange={(e) => set('coupon', e.target.value)} />
    <label className="field-label"><input type="checkbox" checked={raw.pickup} onChange={(e) => set('pickup', e.target.checked)} /> 포장</label>
    <TextField label="최소 주문 금액 (선택)" inputMode="numeric" value={raw.minimum} error={error('minimum')} onChange={(e) => set('minimum', e.target.value)} />
    <TextField label="무료배달 기준 (선택)" inputMode="numeric" value={raw.freeDelivery} error={error('freeDelivery')} onChange={(e) => set('freeDelivery', e.target.value)} />
  </form>
}
