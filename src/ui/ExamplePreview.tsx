import type { ItemCategory } from '../logic/itemCategory'
import { CardCategoryIcon } from './CategoryPicker'

// 빈 화면에 보여 주는 저장되지 않는 예시 줄 (2026-11-03 제작자 "전체적으로 비어 있는 데에 기본으로 예시 좀 채워 넣어 줘").
// 누를 수 없는 미리보기이며 기록을 만들지 않는다
export type ExampleRow = { category: ItemCategory; name: string; price: string; meta: string }

export function ExamplePreview({ label, rows }: { label: string; rows: readonly ExampleRow[] }) {
  return (
    <section className="example-preview stack" aria-label={label}>
      <p className="note">이렇게 보여요 (저장되지 않는 예시)</p>
      <ul className="example-preview-list">
        {rows.map((row) => (
          <li key={row.name}>
            <CardCategoryIcon category={row.category} />
            <span className="example-preview-text"><strong>{row.name}</strong><span className="note">{row.meta}</span></span>
            <span className="price">{row.price}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
