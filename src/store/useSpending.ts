import { addSpendingEntry, addSpendingTemplate, EMPTY_SPENDING, parseSpending, SPENDING_KEY, startWeeklyExperiment, type SpendingEntry, type SpendingTemplate } from '../logic/spending'
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
    removeTemplate: (id: string): boolean => {
      const next = { ...store, templates: store.templates.filter((item) => item.id !== id) }
      if (next.experiment?.templateId === id) delete next.experiment
      return commit(next)
    },
    startExperiment: (id: string, today: Date): 'ok' | 'no-baseline' | 'replaced' => {
      const next = startWeeklyExperiment(store, id, today)
      return next === 'no-baseline' ? 'no-baseline' : commit(next) ? 'ok' : 'replaced'
    },
    stopExperiment: (): boolean => {
      const next = { ...store }
      delete next.experiment
      return commit(next)
    },
    addEntry: (entry: SpendingEntry): 'ok' | 'full' | 'replaced' => {
      const next = addSpendingEntry(store, entry)
      return next === 'full' ? 'full' : commit(next) ? 'ok' : 'replaced'
    },
    removeEntry: (id: string): boolean => commit({ ...store, entries: store.entries.filter((item) => item.id !== id) }),
  }
}
