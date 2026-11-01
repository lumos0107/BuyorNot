"""v1에 없던 화면 (AI 호출 없음). 개발 서버(http://localhost:5173/BuyorNot/)를 새 브라우저 컨텍스트에서 연다.
모의 응답(route)을 걸지 않는다. /api/ 요청이 하나라도 나가면 실패로 끝낸다.

    python new_screens_noai.py <repo>/docs/v2_screens/new <scratch dir>
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

URL = 'http://localhost:5173/BuyorNot/'
OUT = Path(sys.argv[1])
SCRATCH = Path(sys.argv[2])
W, H = 360, 780


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    api = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome')
        ctx = browser.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2)
        try:
            page = ctx.new_page()
            page.on('request', lambda r: api.append(f'{r.method} {r.url}') if '/api/' in r.url else None)
            page.goto(URL)
            page.evaluate('document.fonts.ready')

            def view(name, target=None, offset=12, keep=False):
                if not keep:
                    if target is None:
                        page.evaluate('window.scrollTo(0, 0)')
                    else:
                        target.evaluate(f'el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - {offset})')
                page.wait_for_timeout(300)
                page.screenshot(path=OUT / f'{name}.png')
                print('view', name)

            def full(name):
                page.screenshot(path=SCRATCH / f'{name}.png', full_page=True)

            # AI 화면이 켜진 개발 서버인지 먼저 본다
            expect(page.get_by_role('button', name='말로 담기')).to_be_visible()

            # (e) 물건이 없을 때 첫 화면: 서비스 설명 문장이 담기 폼 위
            expect(page.get_by_text('사고 싶은 물건을 담아 두면 날마다 다시 생각해 보고')).to_be_visible()
            view('05-empty-first')

            # (c) 담아 두기 직후 새 카드와 "방금 담았어요."
            form = page.locator('form[aria-label="물건 담기"]')
            form.get_by_label('상품명').fill('전자레인지 위 수납 선반')
            form.get_by_label('가격', exact=True).fill('39000')
            form.get_by_label('사고 싶은 이유').fill('전자레인지 위 공간이 비어 있어서')
            form.get_by_role('button', name='담아 두기').click()
            expect(page.get_by_text('방금 담았어요.')).to_be_visible()
            page.wait_for_timeout(500)
            view('03-just-added', keep=True)  # 앱이 옮긴 스크롤 그대로
            full('dbg-after-add')

            # (b) 놓을 자리 확인 저장과 캘린더 줄
            card = page.locator('article.card').filter(has_text='전자레인지 위 수납 선반').first
            card.locator('summary', has_text='놓을 자리 확인').click()
            card.get_by_label('놓을 곳 이름').fill('전자레인지 위')
            for label, value in [('놓을 곳 가로(cm)', '60'), ('놓을 곳 깊이(cm)', '40'), ('놓을 곳 높이(cm)', '35'),
                                 ('물건 가로(cm)', '55'), ('물건 깊이(cm)', '30'), ('물건 높이(cm)', '32')]:
                card.get_by_label(label, exact=True).fill(value)
            card.get_by_role('button', name='확인하고 저장').click()
            result = card.get_by_text('저장한 치수로 본 결과')
            expect(result).to_be_visible()
            expect(card.get_by_text('고민 기간이 끝나는 날 캘린더에 넣기:')).to_be_visible()
            view('02a-fit-open', card.locator('summary', has_text='놓을 자리 확인'))
            view('02b-fit-result-calendar', result)
            full('dbg-fit-saved')

            # (d) 구매함 확인 뒤 결정 알림과 회고 한 줄
            card.get_by_role('button', name='구매함', exact=True).click()
            page.locator('form[aria-label="구매함 확인"]').get_by_role('button', name='구매함 확인').click()
            notice = page.get_by_role('status', name='결정 알림')
            expect(notice).to_contain_text('7일 뒤부터 결정 기록에서 잘 샀는지 적을 수 있어요.')
            page.wait_for_timeout(300)
            view('04-after-buy-review', notice, offset=120)
            full('dbg-after-buy')

            # (f) 맨 아래: 기록 백업·복원 아래 AI 성적표 자리
            page.get_by_text('기록 백업·복원', exact=True).click()
            page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            view('06-eval-report-bottom', keep=True)
            print('AI 성적표 보임:', page.get_by_text('AI 성적표', exact=True).count())

            # (a) 가격 비교 → 가격표 사진 탭(사진 고르기 전)
            page.get_by_role('tab', name='가격 비교', exact=True).click()
            page.get_by_role('tab', name='가격표 사진', exact=True).click()
            expect(page.get_by_text('가격표 사진 찍기')).to_be_visible()
            view('01-pricetag-tab')
            full('dbg-pricetag-tab')
        finally:
            ctx.close()
            browser.close()
    print('api requests:', len(api))
    for line in api:
        print(' ', line)
    if api:
        sys.exit(1)


if __name__ == '__main__':
    main()
