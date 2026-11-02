import { normalizePantryName, recipeAvailability, type PantryItem, type PantryLevel, type PantryRecipe } from './pantry'

export type ShoppingCandidate = {
  key: string
  checkKey: string
  name: string
  source: 'pantry' | 'recipe'
  level?: PantryLevel
  fromRecipe: boolean
}

/** 집에 부족한 것과 고른 요리의 없는 재료를 이름 기준으로 한 번씩 모은다. */
export function shoppingCandidates(items: readonly PantryItem[], recipe?: PantryRecipe | readonly PantryRecipe[] | null): ShoppingCandidate[] {
  const found = new Map<string, ShoppingCandidate>()
  for (const item of items) {
    if (item.level === 'plenty') continue
    const key = normalizePantryName(item.name)
    found.set(key, { key, checkKey: `pantry:${item.id}:${item.updatedAt}`, name: item.name, source: 'pantry', level: item.level, fromRecipe: false })
  }
  const recipes = recipe ? Array.isArray(recipe) ? recipe : [recipe] : []
  for (const selected of recipes) {
    for (const ingredient of recipeAvailability(selected, items).missing) {
      const key = normalizePantryName(ingredient)
      const existing = found.get(key)
      if (existing) found.set(key, { ...existing, fromRecipe: true })
      else found.set(key, { key, checkKey: `recipe:${key}`, name: ingredient.trim(), source: 'recipe', fromRecipe: true })
    }
  }
  const rank = (candidate: ShoppingCandidate) => candidate.level === 'out' ? 0 : candidate.level === 'low' ? 1 : 2
  return [...found.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'ko'))
}
