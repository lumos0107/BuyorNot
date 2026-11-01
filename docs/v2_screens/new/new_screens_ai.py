"""v1에 없던 화면 중 실제 AI 결과 (testing-ai-screens '브라우저로 확인할 때' 규칙대로).

- 새 브라우저 컨텍스트 하나, 모의 응답(route) 없음. 끝나면 finally에서 컨텍스트와 브라우저를 닫는다.
- 실제 호출 전에 이 컨텍스트의 페이지에서 /api/read-size에 빈 본문 {}을 보내 400인지 본다. 400이 아니면 멈춘다.
- 사진은 하나에 한 번만 올리고, 결과가 나올 때까지 기다린다. 모델 호출은 가격표 읽기·묶음 사진·치수 읽기 3번.
  온라인 가격 확인(/api/lowest-price)은 다나와 조회가 꺼져 있어 모델을 부르지 않는다.

    python -I new_screens_ai.py <images dir> <shots dir>
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

URL = 'http://localhost:5173/BuyorNot/'
SERVER = 'http://localhost:8787'
IMAGES = Path(sys.argv[1])
SHOTS = Path(sys.argv[2])
W, H = 360, 780
WAIT = 75_000


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    log = []
    api = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome')
        ctx = browser.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2)
        try:
            page = ctx.new_page()
            page.on('request', lambda r: api.append(f'{time.strftime("%H:%M:%S")} {r.method} {r.url}') if '/api/' in r.url else None)
            page.goto(URL)
            page.evaluate('document.fonts.ready')
            expect(page.get_by_role('button', name='말로 담기')).to_be_visible()

            def view(name, target=None, offset=12):
                if target is None:
                    page.evaluate('window.scrollTo(0, 0)')
                else:
                    target.evaluate(f'el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - {offset})')
                page.wait_for_timeout(300)
                page.screenshot(path=SHOTS / f'{name}.png')
                print('view', name)

            def full(name):
                page.screenshot(path=SHOTS / f'{name}-full.png', full_page=True)

            def wait_done(scope, outcome):
                # '읽는 중'/'확인 중'이 사라지고 결과(상자·알림·못 찾음 문장 등)가 보일 때까지. 실패해도 다시 올리지 않는다
                end = time.time() + WAIT / 1000
                while time.time() < end:
                    busy = scope.get_by_text('읽는 중').filter(visible=True).count() + scope.get_by_text('확인 중', exact=True).filter(visible=True).count()
                    found = outcome.or_(scope.get_by_role('alert')).or_(scope.get_by_text('찾지 못했어요')).filter(visible=True)
                    if busy == 0 and found.count() > 0:
                        return True
                    page.wait_for_timeout(250)
                print('WAIT TIMEOUT')
                return False

            # 남은 모의 응답 점검: 이 컨텍스트의 페이지에서 빈 요청 → 서버의 400이어야 한다
            check = page.evaluate(
                """async (server) => {
                    const r = await fetch(server + '/api/read-size', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
                    return { status: r.status, body: await r.text() }
                }""",
                SERVER,
            )
            print('empty request:', json.dumps(check, ensure_ascii=False))
            log.append(('empty', check))
            if check['status'] != 400:
                print('STOP: empty request did not return 400')
                return 2

            # 1) 가격표 사진 읽기 (모델 1번)
            page.get_by_role('tab', name='가격 비교', exact=True).click()
            page.get_by_role('tab', name='가격표 사진', exact=True).click()
            t0 = time.time()
            stamp = time.strftime('%H:%M:%S')
            page.get_by_label('가격표 사진 찍기').set_input_files(str(IMAGES / 'img_pricetag.png'))
            wait_done(page, page.get_by_role('heading', name='읽은 상품'))
            log.append(('read-tag', stamp, round(time.time() - t0, 2)))
            page.wait_for_timeout(500)
            view('tag-read-a', page.get_by_role('heading', name='가격표 사진', exact=True))
            view('tag-read-b', page.get_by_role('heading', name='읽은 상품'))
            full('tag-read')

            # 2) 온라인 가격 확인 (다나와 조회 꺼짐 → 모델 호출 없음)
            t0 = time.time()
            stamp = time.strftime('%H:%M:%S')
            page.get_by_role('button', name='온라인 가격 확인').click()
            result = page.locator('section[aria-label="온라인 가격 확인 결과"]')
            wait_done(page, result)
            log.append(('lowest-price', stamp, round(time.time() - t0, 2)))
            page.wait_for_timeout(500)
            view('online-a', result)
            view('online-b', page.get_by_role('heading', name='읽은 상품'))
            full('online')

            # 3) 묶음상품 비교 '사진으로 채우기' (상품 A, 모델 1번)
            page.get_by_role('tab', name='묶음상품 비교', exact=True).click()
            page.evaluate('window.scrollTo(0, 0)')
            pickers = page.get_by_label('사진으로 채우기')
            print('bundle pickers:', pickers.count())
            t0 = time.time()
            stamp = time.strftime('%H:%M:%S')
            pickers.first.set_input_files(str(IMAGES / 'img_bundle.png'))
            box = page.get_by_role('group', name='확인 상자').or_(page.get_by_role('alert')).or_(page.get_by_text('찾지 못했어요'))
            wait_done(page, box)
            box = box.filter(visible=True)
            log.append(('bundle', stamp, round(time.time() - t0, 2)))
            page.wait_for_timeout(500)
            print('bundle box text:', box.first.inner_text())
            view('bundle-a', box.first, offset=200)
            view('bundle-b', box.first)
            full('bundle')

            # 4) 놓을 자리 확인의 캡처 치수 읽기 (모델 1번). 고민 중인 물건이 있어야 해서 하나 담는다
            page.get_by_role('tab', name='고민 중인 물건', exact=True).click()
            form = page.locator('form[aria-label="물건 담기"]')
            form.get_by_label('상품명').fill('3단 수납 선반')
            form.get_by_label('가격', exact=True).fill('45000')
            form.get_by_label('사고 싶은 이유').fill('베란다에 짐을 정리하려고')
            form.get_by_role('button', name='담아 두기').click()
            expect(page.get_by_text('방금 담았어요.')).to_be_visible()
            card = page.locator('article.card').filter(has_text='3단 수납 선반').first
            card.locator('summary', has_text='놓을 자리 확인').click()
            t0 = time.time()
            stamp = time.strftime('%H:%M:%S')
            card.get_by_label('상품 페이지 캡처에서 치수 읽기').set_input_files(str(IMAGES / 'img_capture.png'))
            sbox = card.get_by_role('group', name='확인 상자').or_(card.get_by_role('alert')).or_(card.get_by_text('찾지 못했어요'))
            wait_done(card, sbox)
            sbox = sbox.filter(visible=True)
            log.append(('read-size', stamp, round(time.time() - t0, 2)))
            page.wait_for_timeout(500)
            print('size box text (before choose):', sbox.first.inner_text())
            radios = sbox.first.get_by_role('radio')
            print('size radios:', radios.count())
            if radios.count() > 0:
                radios.first.check()
                expect(card.get_by_text('사진과 같은지 확인해 주세요').first).to_be_visible()
            enlarge = card.locator('summary', has_text='캡처 크게 보기')
            enlarge.click()
            page.wait_for_timeout(500)
            print('size box text (after choose):', sbox.first.inner_text())
            view('size-a', enlarge)
            view('size-b', sbox.first)
            view('size-c', card.get_by_role('button', name='상품 페이지 캡처에서 치수 읽기').or_(card.get_by_text('상품 페이지 캡처에서 치수 읽기')).first)
            full('size')
        finally:
            ctx.close()
            browser.close()
            print('context closed')
    print('log:', json.dumps(log, ensure_ascii=False))
    print('page /api/ requests:', len(api))
    for line in api:
        print(' ', line)
    return 0


if __name__ == '__main__':
    sys.exit(main())
