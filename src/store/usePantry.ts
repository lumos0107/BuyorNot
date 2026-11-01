import { addPantryEvent, addPantryPurchase, addPantryRecipe, EMPTY_PANTRY, nextPantryItem, PANTRY_KEY, parsePantry, removePantryItem, updatePantryItem, type PantryEvent, type PantryItem, type PantryPurchase, type PantryRecipe } from '../logic/pantry'
import { useStoredDocument } from './useStoredDocument'

export function usePantry() {
  const document = useStoredDocument(PANTRY_KEY, EMPTY_PANTRY, parsePantry)
  const { store, commit } = document
  return {
    ...document,
    addItem: (item: PantryItem): 'ok' | 'full' | 'duplicate' | 'replaced' => {
      const next = nextPantryItem(store, item)
      return typeof next === 'string' ? next : commit(next) ? 'ok' : 'replaced'
    },
    updateItem: (id: string, update: (item: PantryItem) => PantryItem): boolean => commit(updatePantryItem(store, id, update)),
    removeItem: (id: string): boolean => commit(removePantryItem(store, id)),
    addPurchase: (id: string, purchase: PantryPurchase): 'ok' | 'full' | 'replaced' => {
      const next = addPantryPurchase(store, id, purchase)
      return next === 'full' ? 'full' : commit(next) ? 'ok' : 'replaced'
    },
    addRecipe: (recipe: PantryRecipe): 'ok' | 'full' | 'replaced' => {
      const next = addPantryRecipe(store, recipe)
      return next === 'full' ? 'full' : commit(next) ? 'ok' : 'replaced'
    },
    removeRecipe: (id: string): boolean => commit({ ...store, recipes: store.recipes.filter((recipe) => recipe.id !== id) }),
    addEvent: (event: PantryEvent): 'ok' | 'full' | 'replaced' => {
      const next = addPantryEvent(store, event)
      return next === 'full' ? 'full' : commit(next) ? 'ok' : 'replaced'
    },
    discardItem: (id: string, event: PantryEvent): 'ok' | 'full' | 'replaced' => {
      const withEvent = addPantryEvent(store, event)
      return withEvent === 'full' ? 'full' : commit(removePantryItem(withEvent, id)) ? 'ok' : 'replaced'
    },
  }
}
