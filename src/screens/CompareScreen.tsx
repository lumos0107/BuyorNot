import { useState } from 'react'
import {
  compareBundles,
  unitKind,
  validateBundleInput,
  type BundleFieldErrors,
  type BundleRawInput,
  type Unit,
} from '../logic/bundle'
import { formatFixed, formatWon } from '../logic/number'
import { Button } from '../ui/Button'
import { SelectField, TextField } from '../ui/Field'
import { TabPanel, Tabs, type TabItem } from '../ui/Tabs'

type CompareKind = 'discount' | 'bundle'

const KINDS: readonly TabItem<CompareKind>[] = [
  { id: 'discount', label: '할인 비교' },
  { id: 'bundle', label: '묶음상품 비교' },
]

export function CompareScreen() {
  const [kind, setKind] = useState<CompareKind>('discount')
  return (
    <div className="stack">
      <h2 className="screen-title">가격 비교</h2>
      <Tabs label="가격 비교 종류" tabs={KINDS} value={kind} onChange={setKind} sub />
      <TabPanel id="discount" hidden={kind !== 'discount'}>
        <DiscountLayout />
      </TabPanel>
      <TabPanel id="bundle" hidden={kind !== 'bundle'}>
        <BundleCompare />
      </TabPanel>
    </div>
  )
}

// ---------- 할인 비교 (3단계에서 계산을 연결한다) ----------

function DiscountLayout() {
  return (
    <div className="stack">
      <h3 className="section-title">할인 비교</h3>
      <div className="ab-grid">
        <DiscountCard name="A안" />
        <DiscountCard name="B안" />
      </div>
      <div className="btn-row">
        <Button>예시 넣기</Button>
        <Button>초기화</Button>
      </div>
      <section className="card" aria-label="할인 비교 결과 예시">
        <p className="card-title">
          결과 <span className="badge-example">예시</span>
        </p>
        <ul className="result-list">
          <li>
            <span>A안 결제액</span>
            <span className="price">73,000원</span>
          </li>
          <li>
            <span>B안 결제액</span>
            <span className="price">72,000원</span>
          </li>
        </ul>
        <p className="price price-lg">B안이 1,000원 저렴해요</p>
        <p className="note">계산 근거는 결과 아래에 한 줄씩 보여줄 예정이에요.</p>
      </section>
    </div>
  )
}

function DiscountCard({ name }: { name: string }) {
  return (
    <div className="card stack">
      <p className="card-title">{name}</p>
      <TextField label="상품 금액" inputMode="numeric" placeholder="원" />
      <SelectField label="쿠폰 종류" defaultValue="rate">
        <option value="none">없음</option>
        <option value="rate">정률 (%)</option>
        <option value="amount">정액 (원)</option>
      </SelectField>
      <TextField label="할인율 또는 할인액" inputMode="decimal" placeholder="예: 15" />
      <TextField label="최소 주문액" inputMode="numeric" placeholder="0" hint="비워 두면 0원으로 봐요" />
      <TextField label="최대 할인액" inputMode="numeric" placeholder="없음" hint="정률일 때만 써요" />
      <TextField label="배송비" inputMode="numeric" placeholder="0" />
    </div>
  )
}

// ---------- 묶음상품 비교 (PRD F05) ----------

type BundleField = keyof BundleRawInput
type Touched = Partial<Record<BundleField, boolean>>

const EMPTY_BUNDLE: BundleRawInput = { price: '', unit: 'mL', size: '', count: '' }
// AC10 예시: 900mL × 2개 6,000원 / 1.5L × 1개 5,400원
const EXAMPLE_A: BundleRawInput = { price: '6000', unit: 'mL', size: '900', count: '2' }
const EXAMPLE_B: BundleRawInput = { price: '5400', unit: 'L', size: '1.5', count: '1' }
const ALL_TOUCHED: Touched = { price: true, size: true, count: true }

const KIND_LABEL = { weight: '무게', volume: '부피', count: '개수' } as const

type SideState = { form: BundleRawInput; touched: Touched }

function BundleCompare() {
  const [a, setA] = useState<SideState>({ form: EMPTY_BUNDLE, touched: {} })
  const [b, setB] = useState<SideState>({ form: EMPTY_BUNDLE, touched: {} })

  const checkedA = validateBundleInput(a.form)
  const checkedB = validateBundleInput(b.form)
  const kindMismatch = unitKind(a.form.unit) !== unitKind(b.form.unit)
  const result =
    checkedA.value && checkedB.value && !kindMismatch ? compareBundles(checkedA.value, checkedB.value) : null

  const fillExample = () => {
    setA({ form: EXAMPLE_A, touched: ALL_TOUCHED })
    setB({ form: EXAMPLE_B, touched: ALL_TOUCHED })
  }
  const reset = () => {
    setA({ form: EMPTY_BUNDLE, touched: {} })
    setB({ form: EMPTY_BUNDLE, touched: {} })
  }

  return (
    <div className="stack">
      <h3 className="section-title">묶음상품 비교</h3>
      <div className="ab-grid">
        <BundleCard name="상품 A" state={a} errors={checkedA.errors} onChange={setA} />
        <BundleCard name="상품 B" state={b} errors={checkedB.errors} onChange={setB} />
      </div>
      {kindMismatch ? (
        <p className="field-error" role="alert">
          {KIND_LABEL[unitKind(a.form.unit)]}와 {KIND_LABEL[unitKind(b.form.unit)]}는 비교할 수 없어요. 같은
          종류의 단위를 골라 주세요.
        </p>
      ) : null}
      <div className="btn-row">
        <Button onClick={fillExample}>예시 넣기</Button>
        <Button onClick={reset}>초기화</Button>
      </div>
      {result?.ok ? <BundleResultCard result={result} /> : null}
    </div>
  )
}

type BundleCardProps = {
  name: string
  state: SideState
  errors: BundleFieldErrors
  onChange: (next: SideState) => void
}

function BundleCard({ name, state, errors, onChange }: BundleCardProps) {
  const { form, touched } = state
  const shown = (field: BundleField) => (touched[field] ? errors[field as keyof BundleFieldErrors] : undefined)
  const set = (field: BundleField, value: string) =>
    onChange({ form: { ...form, [field]: value }, touched: { ...touched, [field]: true } })
  const blur = (field: BundleField) => onChange({ form, touched: { ...touched, [field]: true } })
  const isCount = unitKind(form.unit) === 'count'

  return (
    <fieldset className="card stack">
      <legend className="card-title">{name}</legend>
      <TextField
        label="가격"
        inputMode="numeric"
        placeholder="원"
        hint="묶음 전체 가격"
        value={form.price}
        error={shown('price')}
        onChange={(e) => set('price', e.target.value)}
        onBlur={() => blur('price')}
      />
      <SelectField label="단위" value={form.unit} onChange={(e) => set('unit', e.target.value as Unit)}>
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
  const verdictText =
    verdict.cheaper === 'tie'
      ? '두 상품의 단가가 같아요'
      : `상품 ${verdict.cheaper}가 단가 ${formatFixed(verdict.percent, 1)}% 낮아요`
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
            상품 A · {a.referenceLabel}당 <span className="note">(총 {a.totalLabel})</span>
          </span>
          <span className="price">{formatFixed(a.unitPrice, 2)}원</span>
        </li>
        <li>
          <span>
            상품 B · {b.referenceLabel}당 <span className="note">(총 {b.totalLabel})</span>
          </span>
          <span className="price">{formatFixed(b.unitPrice, 2)}원</span>
        </li>
      </ul>
      <p className="price price-lg">{verdictText}</p>
      {verdict.displayTie ? <p className="note">표시 단가는 같지만 아주 작은 차이가 있어요.</p> : null}
      <p className="note">{spendText} 가격만 비교한 결과예요. 품질이나 필요한 양은 따로 생각해 주세요.</p>
    </section>
  )
}
