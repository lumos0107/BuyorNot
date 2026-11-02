import { useState } from 'react'
import { PANTRY_LEVEL_LABEL, type PantryItem, type PantryRecipe } from '../logic/pantry'
import { shoppingCandidates } from '../logic/shoppingDraft'
import { SelectField } from '../ui/Field'

export function ShoppingDraftSection({ items, recipes }: { items: readonly PantryItem[]; recipes: readonly PantryRecipe[] }) {
  const [recipeId, setRecipeId] = useState('')
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const recipe = recipes.find((entry) => entry.id === recipeId)
  const candidates = shoppingCandidates(items, recipe)
  const toggle = (key: string) => setChecked((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  return <details className="shopping-draft" role="region" aria-label="장보기 초안">
    <summary className="field-label">장보기 초안</summary>
    <div className="stack">
      {recipes.length > 0 ? <SelectField label="이번에 해 먹을 것 (선택)" value={recipe?.id ?? ''} onChange={(event) => {
        setRecipeId(event.target.value)
        setChecked((current) => new Set([...current].filter((key) => !key.startsWith('recipe:'))))
      }}>
        <option value="">고르지 않음</option>
        {recipes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </SelectField> : null}
      {candidates.length === 0 ? <p className="note">지금 장보기 초안에 넣을 항목이 없어요.</p> : <>
        <div className="shopping-draft-list">
          {candidates.map((candidate) => <div className="shopping-draft-row" key={candidate.key}>
            <label className="check-row">
              <input type="checkbox" checked={checked.has(candidate.checkKey)} onChange={() => toggle(candidate.checkKey)} />
              {candidate.name}
            </label>
            <span className="note">{candidate.source === 'pantry' ? `남은 정도: ${PANTRY_LEVEL_LABEL[candidate.level!]}` : `${recipe?.name ?? '요리'} 재료`}</span>
          </div>)}
        </div>
        <p className="note">체크는 장보기 초안에만 남아요. 샀다면 집에 있는 것의 남은 정도를 따로 바꿔 주세요.</p>
      </>}
    </div>
  </details>
}
