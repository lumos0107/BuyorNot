import { ITEM_CATEGORIES, ITEM_CATEGORY_LABEL, type ItemCategory } from '../logic/itemCategory'
import { CategoryIcon } from './CategoryIcons'

// 물건 분류 고르기(F85, 선택). 아이콘과 분류 이름을 함께 보여 주는 라디오 묶음. '고르지 않음'이면 카드에 첫 글자 표식이 남는다
export function CategoryPicker({ name, value, onChange }: { name: string; value: ItemCategory | undefined; onChange: (next: ItemCategory | undefined) => void }) {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="field-label">분류 (선택)</legend>
      <div className="category-picker">
        <label>
          <input type="radio" name={name} checked={value === undefined} onChange={() => onChange(undefined)} />
          <span>고르지 않음</span>
        </label>
        {ITEM_CATEGORIES.map((category) => (
          <label key={category}>
            <input type="radio" name={name} checked={value === category} onChange={() => onChange(category)} />
            <span className={`card-icon card-icon-${category}`} aria-hidden="true"><CategoryIcon category={category} /></span>
            <span>{ITEM_CATEGORY_LABEL[category]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

// 카드 이름 앞의 동그란 분류 아이콘(장식)
export function CardCategoryIcon({ category }: { category: ItemCategory }) {
  return <span className={`card-icon card-icon-${category}`} aria-hidden="true"><CategoryIcon category={category} /></span>
}
