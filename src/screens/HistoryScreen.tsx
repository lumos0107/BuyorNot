import { useState } from 'react'
import { formatDate } from '../logic/dates'
import { formatWon } from '../logic/number'
import { sortHistory, type WishItem } from '../logic/wishlist'
import { Button } from '../ui/Button'
import { DeleteConfirm } from './WishlistScreen'

// PRD F03 결정 기록: 최신 결정 순, 구매 이유와 등록 가격, 결정 메모(F08), 필터(F12)
type Props = { items: WishItem[]; onRemove: (id: string) => void }
type Filter = 'all' | 'purchased' | 'skipped'

export function HistoryScreen({ items, onRemove }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const history = sortHistory(items)
  const purchased = history.filter((item) => item.status === 'purchased')
  const skipped = history.filter((item) => item.status === 'skipped')
  const shown = filter === 'all' ? history : filter === 'purchased' ? purchased : skipped
  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: history.length },
    { key: 'purchased', label: '구매함', count: purchased.length },
    { key: 'skipped', label: '구매 포기', count: skipped.length },
  ]

  return (
    <div className="stack">
      <h2 className="screen-title">결정 기록</h2>
      {history.length === 0 ? (
        <div className="empty card">
          <p>아직 결정한 물건이 없어요.</p>
          <p className="note">고민 중인 물건에서 구매함·구매 포기를 고르면 여기에 쌓여요.</p>
        </div>
      ) : (
        <>
          <div className="btn-row filter-row" role="group" aria-label="결정 기록 필터">
            {filters.map(({ key, label, count }) => (
              <Button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                {label} ({count})
              </Button>
            ))}
          </div>
          {shown.length === 0 ? (
            <div className="empty card">
              <p>이 조건의 기록이 없어요.</p>
            </div>
          ) : (
            <section className="stack" aria-label="결정 기록 목록">
              {shown.map((item) => (
                <HistoryCard key={item.id} item={item} onRemove={onRemove} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function HistoryCard({ item, onRemove }: { item: WishItem; onRemove: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false)
  const purchased = item.status === 'purchased'
  return (
    <article className="card stack" aria-label={item.name}>
      <div className="card-row">
        <p className="card-title">{item.name}</p>
        <span className={purchased ? 'status' : 'status status-muted'}>{purchased ? '구매함' : '구매 포기'}</span>
      </div>
      <p className="price">{formatWon(item.priceKrw)}</p>
      <p className="card-meta">
        결정 {item.decidedAt ? formatDate(item.decidedAt) : '-'} · 담은 날 {formatDate(item.createdAt)}
        {item.url ? (
          <>
            {' · '}
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              상품 링크
            </a>
          </>
        ) : null}
      </p>
      <p>{item.reason}</p>
      {item.decisionNote ? (
        <>
          <p className="card-meta">결정 메모</p>
          <p>{item.decisionNote}</p>
        </>
      ) : null}
      {confirming ? (
        <DeleteConfirm name={item.name} onConfirm={() => onRemove(item.id)} onCancel={() => setConfirming(false)} />
      ) : (
        <div className="card-actions">
          <button type="button" className="link-btn" onClick={() => setConfirming(true)}>
            삭제
          </button>
        </div>
      )}
    </article>
  )
}
