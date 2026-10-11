import { useState } from 'react'
import {
  compareBundles,
  unitKind,
  validateBundleInput,
  type BundleFieldErrors,
  type BundleRawInput,
  type Unit,
} from '../logic/bundle'
import {
  calculateDiscount,
  compareDiscounts,
  validateDiscountInput,
  type CouponKind,
  type DiscountFieldErrors,
  type DiscountRawInput,
  type DiscountSide,
} from '../logic/discount'
import { formatFixed, formatWon } from '../logic/number'
import { Button } from '../ui/Button'
import { SelectField, TextField } from '../ui/Field'
import { TabPanel, Tabs, type TabItem } from '../ui/Tabs'

type CompareKind = 'discount' | 'bundle'

const KINDS: readonly TabItem<CompareKind>[] = [
  { id: 'discount', label: '할인 비교' },
  { id: 'bundle', label: '묶음상품 비교' },
]

export function CompareScreen({ onGoToWishlist }: { onGoToWishlist?: () => void }) {
  const [kind, setKind] = useState<CompareKind>('discount')
  return (
    <div className="stack">
      <h2 className="screen-title">가격 비교</h2>
      <Tabs label="가격 비교 종류" tabs={KINDS} value={kind} onChange={setKind} sub />
      <TabPanel id="discount" hidden={kind !== 'discount'}>
        <DiscountCompare />
      </TabPanel>
      <TabPanel id="bundle" hidden={kind !== 'bundle'}>
        <BundleCompare />
      </TabPanel>
      {onGoToWishlist ? (
        // 비교해 봐도 필요한 소비인지 확실하지 않으면 먼저 담아 둔다 (PRD #4). 입력값은 넘기지 않는다
        <div className="card stack">
          <p>살지 말지 아직 모르겠다면 먼저 담아 두고 며칠 뒤 다시 생각해 보세요.</p>
          <Button onClick={onGoToWishlist}>숙려 리스트에 담으러 가기</Button>
        </div>
      ) : null}
    </div>
  )
}

// 입력은 문자열로 들고 있어 빈 값과 0을 구분한다. 오류는 사용자가 건드린 입력에만 보여준다. (PRD F06)
type SideState<F> = { form: F; touched: Partial<Record<keyof F, boolean>> }

function fresh<F>(form: F): SideState<F> {
  return { form, touched: {} }
}

function filled<F extends object>(form: F): SideState<F> {
  const touched = Object.fromEntries(Object.keys(form).map((key) => [key, true])) as SideState<F>['touched']
  return { form, touched }
}

// ---------- 할인 비교 (PRD F04) ----------

const EMPTY_DISCOUNT: DiscountRawInput = { price: '', coupon: 'rate', value: '', minOrder: '', maxDiscount: '', shipping: '' }
// AC05·AC06 예시: 80,000원에 15%(최대 10,000원)+배송비 3,000원 / 정액 8,000원+배송비 0원
const EXAMPLE_DISCOUNT_A: DiscountRawInput = { price: '80000', coupon: 'rate', value: '15', minOrder: '', maxDiscount: '10000', shipping: '3000' }
const EXAMPLE_DISCOUNT_B: DiscountRawInput = { price: '80000', coupon: 'amount', value: '8000', minOrder: '', maxDiscount: '', shipping: '0' }

function DiscountCompare() {
  const [a, setA] = useState(fresh(EMPTY_DISCOUNT))
  const [b, setB] = useState(fresh(EMPTY_DISCOUNT))

  const checkedA = validateDiscountInput(a.form)
  const checkedB = validateDiscountInput(b.form)
  const sideA = checkedA.value ? calculateDiscount(checkedA.value) : null
  const sideB = checkedB.value ? calculateDiscount(checkedB.value) : null

  return (
    <div className="stack">
      <h3 className="section-title">할인 비교</h3>
      <div className="ab-grid">
        <DiscountCard name="A안" state={a} errors={checkedA.errors} onChange={setA} />
        <DiscountCard name="B안" state={b} errors={checkedB.errors} onChange={setB} />
      </div>
      <div className="btn-row">
        <Button
          onClick={() => {
            setA(filled(EXAMPLE_DISCOUNT_A))
            setB(filled(EXAMPLE_DISCOUNT_B))
          }}
        >
          예시 넣기
        </Button>
        <Button
          onClick={() => {
            setA(fresh(EMPTY_DISCOUNT))
            setB(fresh(EMPTY_DISCOUNT))
          }}
        >
          초기화
        </Button>
      </div>
      <div aria-live="polite">{sideA && sideB ? <DiscountResultCard a={sideA} b={sideB} /> : null}</div>
    </div>
  )
}

type DiscountCardProps = {
  name: string
  state: SideState<DiscountRawInput>
  errors: DiscountFieldErrors
  onChange: (next: SideState<DiscountRawInput>) => void
}

function DiscountCard({ name, state, errors, onChange }: DiscountCardProps) {
  const { form, touched } = state
  type Field = Exclude<keyof DiscountRawInput, 'coupon'>
  const shown = (field: Field) => (touched[field] ? errors[field] : undefined)
  const set = (field: keyof DiscountRawInput, value: string) =>
    onChange({ form: { ...form, [field]: value }, touched: { ...touched, [field]: true } })
  const blur = (field: Field) => onChange({ form, touched: { ...touched, [field]: true } })
  const coupon = form.coupon

  return (
    <fieldset className="card stack">
      <legend className="card-title">{name}</legend>
      <TextField
        label="상품 금액"
        inputMode="numeric"
        placeholder="원"
        hint="쿠폰 적용 전, 배송비 제외"
        value={form.price}
        error={shown('price')}
        onChange={(e) => set('price', e.target.value)}
        onBlur={() => blur('price')}
      />
      <SelectField label="쿠폰 종류" value={coupon} onChange={(e) => set('coupon', e.target.value as CouponKind)}>
        <option value="none">없음</option>
        <option value="rate">정률 (%)</option>
        <option value="amount">정액 (원)</option>
      </SelectField>
      {coupon === 'rate' ? (
        <TextField
          label="할인율 (%)"
          inputMode="decimal"
          placeholder="예: 15"
          hint="소수 둘째 자리까지"
          value={form.value}
          error={shown('value')}
          onChange={(e) => set('value', e.target.value)}
          onBlur={() => blur('value')}
        />
      ) : null}
      {coupon === 'amount' ? (
        <TextField
          label="할인액 (원)"
          inputMode="numeric"
          placeholder="예: 8000"
          value={form.value}
          error={shown('value')}
          onChange={(e) => set('value', e.target.value)}
          onBlur={() => blur('value')}
        />
      ) : null}
      {coupon !== 'none' ? (
        <TextField
          label="최소 주문액"
          inputMode="numeric"
          placeholder="0"
          hint="비워 두면 0원으로 봐요"
          value={form.minOrder}
          error={shown('minOrder')}
          onChange={(e) => set('minOrder', e.target.value)}
          onBlur={() => blur('minOrder')}
        />
      ) : null}
      {coupon === 'rate' ? (
        <TextField
          label="최대 할인액"
          inputMode="numeric"
          placeholder="없음"
          hint="비워 두면 상한이 없어요"
          value={form.maxDiscount}
          error={shown('maxDiscount')}
          onChange={(e) => set('maxDiscount', e.target.value)}
          onBlur={() => blur('maxDiscount')}
        />
      ) : null}
      <TextField
        label="배송비"
        inputMode="numeric"
        placeholder="0"
        hint="비워 두면 0원으로 봐요"
        value={form.shipping}
        error={shown('shipping')}
        onChange={(e) => set('shipping', e.target.value)}
        onBlur={() => blur('shipping')}
      />
    </fieldset>
  )
}

function DiscountResultCard({ a, b }: { a: DiscountSide; b: DiscountSide }) {
  const comparison = compareDiscounts(a, b)
  const verdictText =
    comparison.cheaper === 'tie'
      ? '두 안의 결제액이 같아요'
      : `${comparison.cheaper}안이 ${formatWon(comparison.diff)} 저렴해요`

  return (
    <section className="card stack" aria-label="할인 비교 결과">
      <p className="card-title">결과</p>
      <DiscountSideSummary name="A안" side={a} />
      <DiscountSideSummary name="B안" side={b} />
      <p className="price price-lg">{verdictText}</p>
      <div className="stack">
        <p className="field-label">계산 근거</p>
        <ul className="steps" aria-label="A안 계산 근거">
          {a.steps.map((step) => (
            <li key={step}>A안: {step}</li>
          ))}
        </ul>
        <ul className="steps" aria-label="B안 계산 근거">
          {b.steps.map((step) => (
            <li key={step}>B안: {step}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function DiscountSideSummary({ name, side }: { name: string; side: DiscountSide }) {
  return (
    <div>
      <div className="card-row">
        <span>{name} 결제액</span>
        <span className="price">{formatWon(side.total)}</span>
      </div>
      {side.applied ? (
        <p className="note">
          할인 {formatWon(side.discount)} · 배송비 포함
        </p>
      ) : (
        <p className="field-error">쿠폰 적용 불가 · 최소 주문액까지 {formatWon(side.shortfall ?? 0)} 부족</p>
      )}
    </div>
  )
}

// ---------- 묶음상품 비교 (PRD F05) ----------

const EMPTY_BUNDLE: BundleRawInput = { price: '', unit: 'mL', size: '', count: '' }
// AC10 예시: 900mL × 2개 6,000원 / 1.5L × 1개 5,400원
const EXAMPLE_BUNDLE_A: BundleRawInput = { price: '6000', unit: 'mL', size: '900', count: '2' }
const EXAMPLE_BUNDLE_B: BundleRawInput = { price: '5400', unit: 'L', size: '1.5', count: '1' }

const KIND_LABEL = { weight: '무게', volume: '부피', count: '개수' } as const

function BundleCompare() {
  const [a, setA] = useState(fresh(EMPTY_BUNDLE))
  const [b, setB] = useState(fresh(EMPTY_BUNDLE))

  const checkedA = validateBundleInput(a.form)
  const checkedB = validateBundleInput(b.form)
  const kindMismatch = unitKind(a.form.unit) !== unitKind(b.form.unit)
  const mismatchId = 'bundle-unit-mismatch'
  const result =
    checkedA.value && checkedB.value && !kindMismatch ? compareBundles(checkedA.value, checkedB.value) : null

  return (
    <div className="stack">
      <h3 className="section-title">묶음상품 비교</h3>
      <div className="ab-grid">
        <BundleCard name="상품 A" state={a} errors={checkedA.errors} onChange={setA} unitErrorId={kindMismatch ? mismatchId : undefined} />
        <BundleCard name="상품 B" state={b} errors={checkedB.errors} onChange={setB} unitErrorId={kindMismatch ? mismatchId : undefined} />
      </div>
      {kindMismatch ? (
        <p className="field-error" role="alert" id={mismatchId}>
          {KIND_LABEL[unitKind(a.form.unit)]}와 {KIND_LABEL[unitKind(b.form.unit)]}는 비교할 수 없어요. 같은
          종류의 단위를 골라 주세요.
        </p>
      ) : null}
      <div className="btn-row">
        <Button
          onClick={() => {
            setA(filled(EXAMPLE_BUNDLE_A))
            setB(filled(EXAMPLE_BUNDLE_B))
          }}
        >
          예시 넣기
        </Button>
        <Button
          onClick={() => {
            setA(fresh(EMPTY_BUNDLE))
            setB(fresh(EMPTY_BUNDLE))
          }}
        >
          초기화
        </Button>
      </div>
      {/* 결과가 자동으로 바뀌므로 보조기기에 알린다 */}
      <div aria-live="polite">{result?.ok ? <BundleResultCard result={result} /> : null}</div>
    </div>
  )
}

type BundleCardProps = {
  name: string
  state: SideState<BundleRawInput>
  errors: BundleFieldErrors
  onChange: (next: SideState<BundleRawInput>) => void
  /** 두 상품의 단위 종류가 다를 때, 그 오류문의 id */
  unitErrorId?: string
}

function BundleCard({ name, state, errors, onChange, unitErrorId }: BundleCardProps) {
  const { form, touched } = state
  type Field = Exclude<keyof BundleRawInput, 'unit'>
  const shown = (field: Field) => (touched[field] ? errors[field] : undefined)
  const set = (field: keyof BundleRawInput, value: string) =>
    onChange({ form: { ...form, [field]: value }, touched: { ...touched, [field]: true } })
  const blur = (field: Field) => onChange({ form, touched: { ...touched, [field]: true } })
  const isCount = unitKind(form.unit) === 'count'

  return (
    <fieldset className="card stack">
      <legend className="card-title">{name}</legend>
      <TextField
        label="가격"
        inputMode="numeric"
        placeholder="원"
        hint="묶음 전체 가격 · 배송비까지 비교하려면 포함한 금액"
        value={form.price}
        error={shown('price')}
        onChange={(e) => set('price', e.target.value)}
        onBlur={() => blur('price')}
      />
      <SelectField
        label="단위"
        value={form.unit}
        aria-describedby={unitErrorId}
        invalid={Boolean(unitErrorId)}
        onChange={(e) => set('unit', e.target.value as Unit)}
      >
        <option value="g">g</option>
        <option value="kg">kg</option>
        <option value="mL">mL</option>
        <option value="L">L</option>
        <option value="ea">개</option>
      </SelectField>
      {isCount ? null : (
        <TextField
          label="개당 용량"
          inputMode="decimal"
          placeholder="예: 900"
          value={form.size}
          error={shown('size')}
          onChange={(e) => set('size', e.target.value)}
          onBlur={() => blur('size')}
        />
      )}
      <TextField
        label="묶음 개수"
        inputMode="numeric"
        placeholder="예: 2"
        value={form.count}
        error={shown('count')}
        onChange={(e) => set('count', e.target.value)}
        onBlur={() => blur('count')}
      />
    </fieldset>
  )
}

function BundleResultCard({ result }: { result: Extract<ReturnType<typeof compareBundles>, { ok: true }> }) {
  const { a, b, verdict } = result
  const percentLabel = formatFixed(verdict.percent, 1)
  const verdictText =
    verdict.cheaper === 'tie'
      ? '두 상품의 단가가 같아요'
      : percentLabel === '0.0'
        ? `상품 ${verdict.cheaper}가 단가 아주 조금 낮아요`
        : `상품 ${verdict.cheaper}가 단가 ${percentLabel}% 낮아요`
  const spendText =
    verdict.spendMore === 'same'
      ? '총지출은 같아요.'
      : `총지출은 상품 ${verdict.spendMore}가 ${formatWon(verdict.spendDiff)} 더 커요.`

  return (
    <section className="card stack" aria-label="묶음상품 비교 결과">
      <p className="card-title">결과</p>
      <ul className="result-list">
        <li>
          <span>
            상품 A · {a.referenceLabel}당{' '}
            <span className="note">
              (총 {a.totalLabel} · {formatWon(a.price)})
            </span>
          </span>
          <span className="price">{a.unitPriceLabel}원</span>
        </li>
        <li>
          <span>
            상품 B · {b.referenceLabel}당{' '}
            <span className="note">
              (총 {b.totalLabel} · {formatWon(b.price)})
            </span>
          </span>
          <span className="price">{b.unitPriceLabel}원</span>
        </li>
      </ul>
      <p className="price price-lg">{verdictText}</p>
      {verdict.displayTie ? <p className="note">표시 단가는 같지만 아주 작은 차이가 있어요.</p> : null}
      <p className="note">{spendText} 가격만 비교한 결과예요. 품질이나 필요한 양은 따로 생각해 주세요.</p>
    </section>
  )
}
