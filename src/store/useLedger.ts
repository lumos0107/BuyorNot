import { EMPTY_LEDGER, LEDGER_KEY, LEDGER_MAX, parseLedger, type LedgerEntry } from '../logic/ledger'
import { useStoredDocument } from './useStoredDocument'

export function useLedger() {
  const document = useStoredDocument(LEDGER_KEY, EMPTY_LEDGER, parseLedger)
  const { store, commit } = document
  return {
    ...document,
    add: (entry: LedgerEntry): 'ok' | 'full' | 'replaced' => {
      if (store.entries.length >= LEDGER_MAX) return 'full'
      return commit({ ...store, entries: [...store.entries, entry] }) ? 'ok' : 'replaced'
    },
    remove: (id: string): boolean => commit({ ...store, entries: store.entries.filter((entry) => entry.id !== id) }),
  }
}
