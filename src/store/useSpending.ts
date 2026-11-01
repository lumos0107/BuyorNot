import { addSpendingEntry, addSpendingTemplate, EMPTY_SPENDING, parseSpending, SPENDING_KEY, type SpendingEntry, type SpendingTemplate } from '../logic/spending'
import { useStoredDocument } from './useStoredDocument'

export function useSpending() {
  const document = useStoredDocument(SPENDING_KEY, EMPTY_SPENDING, parseSpending)
  const { store, commit } = document
  return {
    ...document,
    addTemplate: (template: SpendingTemplate): 'ok' | 'full' | 'replaced' => {
      const next = addSpendingTemplate(store, template)
      return next === 'full' ? 'full' : commit(next) ? 'ok' : 'replaced'
    },
    removeTemplate: (id: string): boolean => commit({ ...store, templates: store.templates.filter((item) => item.id !== id) }),
    addEntry: (entry: SpendingEntry): 'ok' | 'full' | 'replaced' => {
      const next = addSpendingEntry(store, entry)
      return next === 'full' ? 'full' : commit(next) ? 'ok' : 'replaced'
    },
    removeEntry: (id: string): boolean => commit({ ...store, entries: store.entries.filter((item) => item.id !== id) }),
  }
}
