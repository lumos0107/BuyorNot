import { isDay, isIntBetween, isRecord, isString, isTimestamp } from './guards'
import { josa, MAX_WON } from './number'
import { unitKind, type Unit } from './bundle'
import { calendarDaysBetween, parseDay } from './dates'

// PRD F54~F58: 집에 있는 것, 산 값, 해 먹은 것과 건너뛴 구매를 한 키에 둔다.
export type PantryKind = 'essential' | 'ingredient'
export type PantryLevel = 'plenty' | 'low' | 'out'
export type PantryPurchase = { id: string; day: string; place: string; amountKrw: number; size: number; unit: Unit; createdAt: string }
export type PantryItem = { id: string; name: string; kind: PantryKind; level: PantryLevel; expiresOn?: string; purchases: PantryPurchase[]; createdAt: string; updatedAt: string }
export type PantryRecipe = { id: string; name: string; ingredients: string[]; estimateKrw?: number; createdAt: string; updatedAt: string }
export type PantryEvent = { id: string; action: 'discarded' | 'cooked' | 'stock'; sourceId: string; name: string; day: string; amountKrw: number; createdAt: string }
export type PantryStore = { schemaVersion: 1; items: PantryItem[]; recipes: PantryRecipe[]; events: PantryEvent[] }
export type PantryLoadResult = { ok: true; store: PantryStore } | { ok: false; reason: 'corrupt' | 'unavailable' }

export const PANTRY_KEY = 'buyornot.pantry.v1'
export const EMPTY_PANTRY: PantryStore = { schemaVersion: 1, items: [], recipes: [], events: [] }
export const PANTRY_ITEM_MAX = 200
export const PANTRY_RECIPE_MAX = 100
export const PANTRY_EVENT_MAX = 2000
export const PANTRY_PURCHASE_MAX = 5
export const PANTRY_NAME_MAX = 40
export const PANTRY_PLACE_MAX = 30
export const PANTRY_ESTIMATE_MAX = 100000
export const PANTRY_KIND_LABEL: Record<PantryKind, string> = { essential: '생필품', ingredient: '식재료' }
export const PANTRY_LEVEL_LABEL: Record<PantryLevel, string> = { plenty: '넉넉', low: '조금', out: '떨어짐' }
export const PANTRY_STORAGE_LABEL = '집에 있는 것 저장 상태'
export const PANTRY_UNAVAILABLE = '이 브라우저에서는 집에 있는 것 기록을 저장할 수 없어요. 새로고침하면 사라져요.'
export const PANTRY_SAVE_FAILED = '집에 있는 것 기록을 저장하지 못했어요. 브라우저 저장 공간이나 설정을 확인한 뒤 다시 저장해 주세요.'
export const PANTRY_REPLACED = '다른 탭에서 저장한 집에 있는 것 기록을 불러왔어요. 이 탭에서 저장하지 않은 변경은 반영되지 않았어요.'
export const PANTRY_CORRUPT = '저장된 집에 있는 것 기록을 읽을 수 없어요. 초기화하기 전까지는 새로 적은 기록이 저장되지 않아요.'
export const PANTRY_RESET_NOTE = '초기화하면 읽을 수 없는 집에 있는 것 기록은 사라지고, 지금 화면의 기록만 저장돼요.'

export const nextPantryLevel = (level: PantryLevel): PantryLevel => level === 'plenty' ? 'low' : level === 'low' ? 'out' : 'plenty'
export const pantryAdded = (name: string) => `‘${name}’${josa(name, '을/를')} 적었어요.`
export const pantryLevelChanged = (name: string, level: PantryLevel) => `‘${name}’의 남은 정도를 ${PANTRY_LEVEL_LABEL[level]}으로 바꿨어요.` // copy-check: ignore josa '의'는 받침과 관계없이 같다. 세 상태 이름은 모두 받침이 있다
export const pantryDeleteConfirm = (name: string) => `‘${name}’${josa(name, '을/를')} 지울까요? 산 값 기록도 함께 지워져요.`
export const pantryDiscardConfirm = (name: string) => `‘${name}’${josa(name, '을/를')} 버린 기록으로 옮길까요?`
export const pantryRecipeDeleteConfirm = (name: string) => `‘${name}’${josa(name, '을/를')} 지울까요? 해 먹은 기록은 그대로 남아요.`

export const normalizePantryName = (name: string) => name.trim().toLocaleLowerCase('ko')
const nonEmpty = (v: unknown, max: number) => isString(v) && v.trim().length >= 1 && v.trim().length <= max
const uniqueIds = (items: readonly { id: string }[]) => new Set(items.map((item) => item.id)).size === items.length

function isPurchase(v: unknown): v is PantryPurchase {
  if (!isRecord(v)) return false
  if (!nonEmpty(v.id, 100) || !isDay(v.day) || !nonEmpty(v.place, PANTRY_PLACE_MAX)) return false
  if (!isIntBetween(v.amountKrw, 1, MAX_WON) || typeof v.size !== 'number' || !Number.isFinite(v.size) || v.size <= 0 || v.size > 10_000_000 || Math.round(v.size * 1000) !== v.size * 1000) return false
  if (!['g', 'kg', 'mL', 'L', 'ea'].includes(v.unit as string) || (v.unit === 'ea' && !Number.isInteger(v.size))) return false
  return isTimestamp(v.createdAt)
}

function isItem(v: unknown): v is PantryItem {
  if (!isRecord(v) || !nonEmpty(v.id, 100) || !nonEmpty(v.name, PANTRY_NAME_MAX)) return false
  if (v.kind !== 'essential' && v.kind !== 'ingredient') return false
  if (v.level !== 'plenty' && v.level !== 'low' && v.level !== 'out') return false
  if (v.expiresOn !== undefined && (v.kind !== 'ingredient' || !isDay(v.expiresOn))) return false
  if (!Array.isArray(v.purchases) || v.purchases.length > PANTRY_PURCHASE_MAX || !v.purchases.every(isPurchase) || !uniqueIds(v.purchases)) return false
  return isTimestamp(v.createdAt) && isTimestamp(v.updatedAt)
}

function isRecipe(v: unknown): v is PantryRecipe {
  if (!isRecord(v) || !nonEmpty(v.id, 100) || !nonEmpty(v.name, PANTRY_NAME_MAX) || !Array.isArray(v.ingredients)) return false
  if (v.ingredients.length < 1 || v.ingredients.length > 10 || !v.ingredients.every((part: unknown) => nonEmpty(part, PANTRY_NAME_MAX))) return false
  if (new Set(v.ingredients.map((part: string) => normalizePantryName(part))).size !== v.ingredients.length) return false
  if (v.estimateKrw !== undefined && !isIntBetween(v.estimateKrw, 1, PANTRY_ESTIMATE_MAX)) return false
  return isTimestamp(v.createdAt) && isTimestamp(v.updatedAt)
}

function isEvent(v: unknown): v is PantryEvent {
  if (!isRecord(v) || !nonEmpty(v.id, 100) || !nonEmpty(v.sourceId, 100) || !nonEmpty(v.name, PANTRY_NAME_MAX)) return false
  if (v.action !== 'discarded' && v.action !== 'cooked' && v.action !== 'stock') return false
  return isDay(v.day) && isIntBetween(v.amountKrw, 0, MAX_WON) && isTimestamp(v.createdAt)
}

export function isPantryStore(v: unknown): v is PantryStore {
  if (!isRecord(v) || Object.keys(v).some((key) => !['schemaVersion', 'items', 'recipes', 'events'].includes(key))) return false
  if (v.schemaVersion !== 1 || !Array.isArray(v.items) || !Array.isArray(v.recipes) || !Array.isArray(v.events)) return false
  if (v.items.length > PANTRY_ITEM_MAX || v.recipes.length > PANTRY_RECIPE_MAX || v.events.length > PANTRY_EVENT_MAX) return false
  if (!v.items.every(isItem) || !v.recipes.every(isRecipe) || !v.events.every(isEvent)) return false
  if (!uniqueIds(v.items) || !uniqueIds(v.recipes) || !uniqueIds(v.events)) return false
  return new Set(v.items.map((item) => normalizePantryName(item.name))).size === v.items.length
}

export function parsePantry(raw: string | null): PantryLoadResult {
  if (raw === null) return { ok: true, store: EMPTY_PANTRY }
  try {
    const parsed: unknown = JSON.parse(raw)
    return isPantryStore(parsed) ? { ok: true, store: parsed } : { ok: false, reason: 'corrupt' }
  } catch { return { ok: false, reason: 'corrupt' } }
}

export function nextPantryItem(store: PantryStore, item: PantryItem): PantryStore | 'full' | 'duplicate' {
  if (store.items.some((existing) => normalizePantryName(existing.name) === normalizePantryName(item.name))) return 'duplicate'
  if (store.items.length >= PANTRY_ITEM_MAX) return 'full'
  return { ...store, items: [...store.items, item] }
}

export function updatePantryItem(store: PantryStore, id: string, update: (item: PantryItem) => PantryItem): PantryStore {
  return { ...store, items: store.items.map((item) => item.id === id ? update(item) : item) }
}

export function removePantryItem(store: PantryStore, id: string): PantryStore {
  return { ...store, items: store.items.filter((item) => item.id !== id) }
}

export function addPantryPurchase(store: PantryStore, itemId: string, purchase: PantryPurchase): PantryStore | 'full' {
  const item = store.items.find((entry) => entry.id === itemId)
  if (!item || item.purchases.length >= PANTRY_PURCHASE_MAX) return 'full'
  return updatePantryItem(store, itemId, (entry) => ({ ...entry, purchases: [...entry.purchases, purchase], updatedAt: purchase.createdAt }))
}

export function addPantryRecipe(store: PantryStore, recipe: PantryRecipe): PantryStore | 'full' {
  return store.recipes.length >= PANTRY_RECIPE_MAX ? 'full' : { ...store, recipes: [...store.recipes, recipe] }
}

export function addPantryEvent(store: PantryStore, event: PantryEvent): PantryStore | 'full' {
  return store.events.length >= PANTRY_EVENT_MAX ? 'full' : { ...store, events: [...store.events, event] }
}

export function latestPantryPurchase(item: PantryItem): PantryPurchase | undefined {
  return [...item.purchases].sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt))[0]
}

export function expiringPantryItems(items: readonly PantryItem[], today: Date): PantryItem[] {
  return items.filter((item) => {
    if (item.kind !== 'ingredient' || !item.expiresOn) return false
    const day = parseDay(item.expiresOn)
    return day !== null && calendarDaysBetween(today, day) <= 3
  }).sort((a, b) => (a.expiresOn ?? '').localeCompare(b.expiresOn ?? '') || a.name.localeCompare(b.name, 'ko'))
}

export function discardedThisMonth(events: readonly PantryEvent[], today: Date): { count: number; amountKrw: number } {
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const discarded = events.filter((event) => event.action === 'discarded' && event.day.slice(0, 7) === month)
  return { count: discarded.length, amountKrw: discarded.reduce((sum, event) => sum + event.amountKrw, 0) }
}

/** 같은 단위 종류면 100g·100mL·1개당 가격. 화면에 보이는 숫자는 소수 둘째 자리 */
export function pantryUnitPrice(purchase: PantryPurchase): { kind: ReturnType<typeof unitKind>; value: number; label: string } {
  const kind = unitKind(purchase.unit)
  const base = purchase.unit === 'kg' || purchase.unit === 'L' ? purchase.size * 1000 : purchase.size
  const reference = kind === 'count' ? 1 : 100
  const value = purchase.amountKrw * reference / base
  return { kind, value, label: kind === 'weight' ? '100g' : kind === 'volume' ? '100mL' : '1개' }
}

export function comparePantryPurchases(a: PantryPurchase, b: PantryPurchase): string {
  const left = pantryUnitPrice(a)
  const right = pantryUnitPrice(b)
  if (left.kind !== right.kind) return '단위가 달라 단가를 비교할 수 없어요.'
  const shown = (value: number) => `${value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원`
  return `${a.place} ${left.label}당 ${shown(left.value)} · ${b.place} ${right.label}당 ${shown(right.value)}`
}

export function recipeAvailability(recipe: PantryRecipe, items: readonly PantryItem[]): { count: number; total: number; missing: string[] } {
  const available = new Set(items.filter((item) => item.kind === 'ingredient' && item.level !== 'out').map((item) => normalizePantryName(item.name)))
  const missing = recipe.ingredients.filter((ingredient) => !available.has(normalizePantryName(ingredient)))
  return { count: recipe.ingredients.length - missing.length, total: recipe.ingredients.length, missing }
}

export function sortPantryRecipes(recipes: readonly PantryRecipe[], items: readonly PantryItem[]): PantryRecipe[] {
  return [...recipes].sort((a, b) => recipeAvailability(b, items).count - recipeAvailability(a, items).count || a.name.localeCompare(b.name, 'ko'))
}

export function pantryAvoidedTotals(events: readonly PantryEvent[]): { cookedCount: number; cookedKrw: number; stockCount: number; stockKrw: number } {
  const cooked = events.filter((event) => event.action === 'cooked')
  const stock = events.filter((event) => event.action === 'stock')
  return {
    cookedCount: cooked.length,
    cookedKrw: cooked.reduce((sum, event) => sum + event.amountKrw, 0),
    stockCount: stock.length,
    stockKrw: stock.reduce((sum, event) => sum + event.amountKrw, 0),
  }
}
