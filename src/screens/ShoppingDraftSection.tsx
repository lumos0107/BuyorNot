import { useState } from 'react'
import { PANTRY_LEVEL_LABEL, type PantryItem, type PantryRecipe } from '../logic/pantry'
import { shoppingCandidates } from '../logic/shoppingDraft'

export function ShoppingDraftSection({ items, recipes }: { items: readonly PantryItem[]; recipes: readonly PantryRecipe[] }) {
  const [weekRecipeIds, setWeekRecipeIds] = useState<string[]>([])
  const [weekLimit, setWeekLimit] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(() => new Set())
  const chosen = recipes.filter((entry) => weekRecipeIds.includes(entry.id))
  const candidates = shoppingCandidates(items, chosen)
  const toggle = (key: string) => setChecked((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  return <details className="shopping-draft" role="region" aria-label="장보기 초안" id="shopping-draft">
    <summary className="field-label" id="shopping-draft-title">장보기 초안</summary>
    <div className="stack">
      {recipes.length > 0 ? <div className="stack" role="group" aria-label="이번 주 해 먹을 것">
        <p className="field-label">이번 주 해 먹을 것</p>
        <div className="btn-row">{recipes.map((entry) => <button key={entry.id} type="button" className="btn" aria-label={`${entry.name} 이번 주에 해 먹기`} aria-pressed={weekRecipeIds.includes(entry.id)} onClick={() => {
          if (!weekRecipeIds.includes(entry.id) && weekRecipeIds.length >= 3) { setWeekLimit(true); return }
          setWeekLimit(false)
          setWeekRecipeIds(weekRecipeIds.includes(entry.id) ? weekRecipeIds.filter((id) => id !== entry.id) : [...weekRecipeIds, entry.id])
          setChecked((current) => new Set([...current].filter((key) => !key.startsWith('recipe:'))))
        }}>{entry.name}</button>)}</div>
        {weekLimit ? <p role="status" className="note">이번 주에는 3개까지 고를 수 있어요.</p> : null}
      </div> : null}
      {items.length === 0 && recipes.length === 0 ? <div className="stack"><p className="note">집에 있는 것 한 가지만 적어 보세요.</p><button type="button" className="btn" onClick={() => document.getElementById('pantry-name')?.focus()}>집에 있는 것 적기</button></div> : null}
      {candidates.length === 0 ? <p className="note">지금 장보기 초안에 넣을 항목이 없어요.</p> : <>
        <div className="shopping-draft-list">
          {candidates.map((candidate) => <div className="shopping-draft-row" key={candidate.key}>
            <label className="check-row">
              <input type="checkbox" checked={checked.has(candidate.checkKey)} onChange={() => toggle(candidate.checkKey)} />
              {candidate.name}
            </label>
            <span className="note">{[candidate.source === 'pantry' ? `남은 정도: ${PANTRY_LEVEL_LABEL[candidate.level!]}` : null, candidate.recipeNames.length > 0 ? `${candidate.recipeNames.join(', ')} 재료` : null].filter(Boolean).join(' · ')}</span>
          </div>)}
        </div>
        <p className="note">체크는 장보기 초안에만 남아요. 샀다면 집에 있는 것의 남은 정도를 따로 바꿔 주세요.</p>
      </>}
    </div>
  </details>
}
