import { useState } from 'react'
import { formatDate } from '../logic/dates'
import { formatWon } from '../logic/number'
import { sortHistory, type WishItem } from '../logic/wishlist'
import { DeleteConfirm } from './WishlistScreen'

// PRD F03 결정 기록: 최신 결정 순, 구매 이유와 등록 당시 가격을 보여준다. 합계·통계는 1차 범위 밖.
type Props = { items: WishItem[]; onRemove: (id: string) => void }

export function HistoryScreen({ items, onRemove }: Props) {
  const history = sortHistory(items)
  return (
    <div className="stack">
      <h2 className="screen-title">결정 기록</h2>
      {history.length === 0 ? (
        <div className="empty card">
          <p>아직 결정한 물건이 없어요.</p>
          <p className="note">고민 중인 물건에서 구매함·구매 포기를 고르면 여기에 쌓여요.</p>
        </div>
      ) : (
        <section className="stack" aria-label="결정 기록 목록">
          {history.map((item) => (
            <HistoryCard key={item.id} item={item} onRemove={onRemove} />
          ))}
        </section>
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
