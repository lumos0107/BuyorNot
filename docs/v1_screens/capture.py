"""살까말까 화면 캡처 (v1 기준점 기록용, 2026-10-27).

빌드한 사이트를 띄운 뒤 실행한다. 새 브라우저(빈 저장소)에서 예시 데이터만 넣고 찍는다.

    npm run build && npx vite preview --port 4173
    python docs/v1_screens/capture.py http://localhost:4173/BuyorNot/ docs/v1_screens

휴대폰 한 화면(360×780, 2배) 9장과 탭별 전체 화면(360폭, 1배) 5장을 찍는다.
나중 버전도 같은 조건으로 찍어 나란히 비교한다. 버튼 이름이 바뀌면 아래 단계를 고친다.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/BuyorNot/'
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parent
W, H = 360, 780


def flow(page, view, full):
    """사용자가 처음 열어 예시로 둘러보는 순서대로 찍는다."""
    view('01-home')

    page.get_by_role('button', name='예시 물건 넣기').click()
    view('02-wishlist-top')
    card = page.locator('#panel-wishlist article.card').first
    view('03-wishlist-card', card)
    full('wishlist')

    # 사기 전에 한 번 더 (F15): 구매함을 누르면 나오는 점검. 확인하지 않고 취소한다
    card.get_by_role('button', name='구매함', exact=True).click()
    check = page.locator('form[aria-label="구매함 확인"]')
    view('04-before-buy', check)
    check.get_by_role('button', name='취소').click()

    tab(page, '가격 비교')
    view('05-compare-discount', page.locator('[aria-label="할인 비교 결과"]'))
    full('compare-discount')
    page.get_by_role('tab', name='묶음상품 비교', exact=True).click()
    view('06-compare-bundle', page.locator('[aria-label="묶음상품 비교 결과"]'))
    full('compare-bundle')

    tab(page, '결정 기록')
    view('07-history')
    full('history')

    tab(page, '구독')
    page.get_by_role('button', name='예시 구독 넣기').click()
    view('08-subscriptions')
    full('subscriptions')

    page.get_by_text('기록 백업·복원', exact=True).click()
    view('09-backup', page.locator('details.guide').last)


def tab(page, name):
    page.get_by_role('tab', name=name, exact=True).click()
    page.evaluate('window.scrollTo(0, 0)')


def open_page(browser, scale):
    page = browser.new_page(viewport={'width': W, 'height': H}, device_scale_factor=scale)
    page.goto(URL)
    page.evaluate('document.fonts.ready')
    return page


def main():
    (OUT / 'full').mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome')

        page = open_page(browser, 2)

        def view(name, target=None):
            # target이 있으면 그 요소가 화면 위쪽에 오게 스크롤한다
            if target is None:
                page.evaluate('window.scrollTo(0, 0)')
            else:
                target.evaluate('el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 12)')
            page.wait_for_timeout(200)
            page.screenshot(path=OUT / f'{name}.png')
            print('view', name)

        flow(page, view, lambda name: None)
        page.close()

        page = open_page(browser, 1)

        def full(name):
            page.screenshot(path=OUT / 'full' / f'{name}.png', full_page=True)
            print('full', name)

        flow(page, lambda name, target=None: None, full)
        browser.close()


if __name__ == '__main__':
    main()
