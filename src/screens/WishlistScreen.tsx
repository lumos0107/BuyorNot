import { Button } from '../ui/Button'
import { TextAreaField, TextField } from '../ui/Field'

// 1단계: 등록 폼·상품 카드·빈 목록 안내의 자리만 잡는다. 저장과 숙려 계산은 2~4단계에서 연결한다.
export function WishlistScreen() {
  return (
    <div className="stack">
      <h2 className="screen-title">고민 중인 물건</h2>

      <form className="card stack" onSubmit={(event) => event.preventDefault()}>
        <p className="card-title">물건 담기</p>
        <TextField label="상품명" placeholder="예: 무선 헤드폰" maxLength={80} />
        <TextField label="가격" inputMode="numeric" placeholder="원" />
        <TextAreaField
          label="사고 싶은 이유"
          placeholder="지금 쓰는 제품이 고장 나서, 세일 중이라서…"
          maxLength={500}
        />
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">숙려 기간</legend>
          <div className="radio-group" role="radiogroup" aria-label="숙려 기간">
            <label>
              <input type="radio" name="cooling" value="1" /> 1일
            </label>
            <label>
              <input type="radio" name="cooling" value="3" defaultChecked /> 3일
            </label>
            <label>
              <input type="radio" name="cooling" value="7" /> 7일
            </label>
          </div>
        </fieldset>
        <TextField label="링크 (선택)" type="url" inputMode="url" placeholder="https://" />
        <Button variant="primary" block type="submit">
          담아 두기
        </Button>
      </form>

      <div className="empty card">
        <p>아직 담아 둔 물건이 없어요.</p>
        <p className="note">사고 싶은 물건을 담아 두면 숙려 기간이 지난 뒤 다시 물어봐요.</p>
      </div>

      <section className="stack" aria-label="상품 카드 예시">
        <p className="section-title">
          이렇게 보여요 <span className="badge-example">예시</span>
        </p>
        <article className="card">
          <div className="card-row">
            <p className="card-title">무선 헤드폰</p>
            <span className="status">숙려 중 · D-2</span>
          </div>
          <p className="price">129,000원</p>
          <p className="card-meta">지금 쓰는 유선 이어폰 선이 자꾸 끊겨서</p>
        </article>
        <article className="card stack">
          <div className="card-row">
            <p className="card-title">접이식 건조대</p>
            <span className="status">재검토 가능</span>
          </div>
          <p className="price">38,000원</p>
          <p className="card-meta">담은 날 2026-10-08 · 3일 숙려</p>
          <p>처음 적은 이유: 빨래를 널 곳이 없어서</p>
          <p className="field-label">아직 필요한가요?</p>
          <div className="btn-row">
            <Button variant="primary">구매함</Button>
            <Button>구매 포기</Button>
          </div>
        </article>
      </section>
    </div>
  )
}
