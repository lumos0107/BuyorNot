import { useState } from 'react'
import { Button } from '../ui/Button'
import { SelectField, TextField } from '../ui/Field'
import { TabPanel, Tabs, type TabItem } from '../ui/Tabs'

type CompareKind = 'discount' | 'bundle'

const KINDS: readonly TabItem<CompareKind>[] = [
  { id: 'discount', label: '할인 비교' },
  { id: 'bundle', label: '묶음상품 비교' },
]

// 1단계: A·B 입력과 결과 카드의 자리만 잡는다. 계산은 2·3단계에서 연결한다. (PRD F04, F05)
export function CompareScreen() {
  const [kind, setKind] = useState<CompareKind>('discount')
  return (
    <div className="stack">
      <h2 className="screen-title">가격 비교</h2>
      <Tabs label="가격 비교 종류" tabs={KINDS} value={kind} onChange={setKind} sub />
      {kind === 'discount' ? (
        <TabPanel id="discount">
          <DiscountLayout />
        </TabPanel>
      ) : (
        <TabPanel id="bundle">
          <BundleLayout />
        </TabPanel>
      )}
    </div>
  )
}

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

function BundleLayout() {
  return (
    <div className="stack">
      <h3 className="section-title">묶음상품 비교</h3>
      <div className="ab-grid">
        <BundleCard name="상품 A" />
        <BundleCard name="상품 B" />
      </div>
      <div className="btn-row">
        <Button>예시 넣기</Button>
        <Button>초기화</Button>
      </div>
      <section className="card" aria-label="묶음상품 비교 결과 예시">
        <p className="card-title">
          결과 <span className="badge-example">예시</span>
        </p>
        <ul className="result-list">
          <li>
            <span>상품 A · 100mL당</span>
            <span className="price">333.33원</span>
          </li>
          <li>
            <span>상품 B · 100mL당</span>
            <span className="price">360.00원</span>
          </li>
        </ul>
        <p className="price price-lg">상품 A가 단가 7.4% 낮아요</p>
        <p className="note">총지출은 상품 A가 600원 더 커요. 가격만 비교한 결과예요.</p>
      </section>
    </div>
  )
}

function BundleCard({ name }: { name: string }) {
  return (
    <div className="card stack">
      <p className="card-title">{name}</p>
      <TextField label="가격" inputMode="numeric" placeholder="원" hint="묶음 전체 가격" />
      <SelectField label="단위" defaultValue="mL">
        <option value="g">g</option>
        <option value="kg">kg</option>
        <option value="mL">mL</option>
        <option value="L">L</option>
        <option value="ea">개</option>
      </SelectField>
      <TextField label="개당 용량" inputMode="decimal" placeholder="예: 900" />
      <TextField label="묶음 개수" inputMode="numeric" placeholder="예: 2" />
    </div>
  )
}
