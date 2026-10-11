// 1단계: 결정 기록 화면의 자리만 잡는다. 실제 기록은 4단계에서 연결한다. (PRD F03)
export function HistoryScreen() {
  return (
    <div className="stack">
      <h2 className="screen-title">결정 기록</h2>

      <div className="empty card">
        <p>아직 결정한 물건이 없어요.</p>
        <p className="note">고민 중인 물건에서 구매함·구매 포기를 고르면 여기에 쌓여요.</p>
      </div>

      <section className="stack" aria-label="결정 기록 예시">
        <p className="section-title">
          이렇게 보여요 <span className="badge-example">예시</span>
        </p>
        <article className="card">
          <div className="card-row">
            <p className="card-title">무선 청소기</p>
            <span className="status">구매함</span>
          </div>
          <p className="price">189,000원</p>
          <p className="card-meta">결정 2026-10-09 · 담은 날 2026-10-02</p>
        </article>
        <article className="card">
          <div className="card-row">
            <p className="card-title">게이밍 키보드</p>
            <span className="status status-muted">구매 포기</span>
          </div>
          <p className="price">149,000원</p>
          <p className="card-meta">결정 2026-10-07 · 담은 날 2026-10-04</p>
        </article>
      </section>
    </div>
  )
}
