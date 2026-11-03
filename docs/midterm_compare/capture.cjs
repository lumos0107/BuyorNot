// 1차 제출본(v1)과 중간 과제 공개 빌드의 README용 화면을 같은 조건으로 다시 찍는다 (2026-11-02).
//
// GitHub Pages와 같은 묶음을 로컬에 만든 뒤 실행한다. 배포 작업(.github/workflows/deploy.yml)과 같은 방식이다.
//
//   npm run build
//   git worktree add ../v1src v1 && (cd ../v1src && npm ci && npm run build -- --base /BuyorNot/v1/)
//   mkdir -p dist/v1 && cp -a ../v1src/dist/. dist/v1/
//   npx vite preview --port 4173
//   LANG=ko_KR.UTF-8 node docs/midterm_compare/capture.cjs http://localhost:4173/BuyorNot/   (LANG이 없으면 달 입력칸이 영어로 찍힌다)
//
// 모든 사진은 새 브라우저(빈 저장소), 휴대폰 화면 390×844, 2배 해상도로 찍는다.
// 한 화면 사진은 780×1688(같은 비율), 부분 사진은 폭 780 안팎에 내용 높이만큼이다.
// 스크롤 막대를 숨기는 스타일 한 줄만 넣으려고 CSP를 우회한다(앱 동작은 그대로).
const path = require('node:path')
const { chromium } = require('playwright')

const BASE = process.argv[2] ?? 'http://localhost:4173/BuyorNot/'
const OUT = process.argv[3] ?? __dirname
const VIEW = { width: 390, height: 844 }

async function open(browser, url) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, locale: 'ko-KR', bypassCSP: true })
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForLoadState('networkidle')
  await page.addStyleTag({ content: '::-webkit-scrollbar{display:none} html{scrollbar-width:none}' })
  return { context, page }
}

const file = (name) => path.join(OUT, `${name}.png`)

// 요소의 위쪽을 위에 붙은 머리글 바로 아래(여백 72px)에 두고 한 화면을 찍는다.
async function viewAt(page, name, locator) {
  if (locator) {
    await locator.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 72))
  } else {
    await page.evaluate(() => window.scrollTo(0, 0))
  }
  await page.waitForTimeout(150)
  await page.screenshot({ path: file(name) })
}

// 부분 사진에는 아래에 붙은 주요 메뉴가 겹치지 않게 잠시 숨긴다 (2026-11-03)
async function part(page, name, locator) {
  const hideNav = await page.addStyleTag({ content: '.tabs.tabs-main{visibility:hidden}' })
  await locator.scrollIntoViewIfNeeded()
  await locator.screenshot({ path: file(name) })
  await hideNav.evaluate((el) => el.remove())
}

async function tab(page, name) {
  await page.getByRole('tab', { name, exact: true }).click()
  await page.evaluate(() => window.scrollTo(0, 0))
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chromium', args: ['--lang=ko-KR'] })

  // 1차 제출본. 1차 사진(01·03)은 바뀌지 않으므로 SKIP_V1=1이면 v1 빌드 없이 개선본만 다시 찍는다 (2026-11-02)
  if (!process.env.SKIP_V1) {
    const { context, page } = await open(browser, new URL('v1/', BASE).href)
    await viewAt(page, '01-home')
    await tab(page, '구독')
    await page.getByRole('button', { name: '예시 구독 넣기' }).click()
    await viewAt(page, '03-subscriptions')
    await context.close()
  }

  // 중간 과제 공개 빌드
  {
    // 2026-11-02 F86: 첫 화면은 가계부(2026-11-03부터 결제·지출 달력이 맨 위)
    const { context, page } = await open(browser, BASE)
    await viewAt(page, '02-home')
    await viewAt(page, '04-fixed-costs', page.getByRole('region', { name: '결제·지출 달력' }))
    await part(page, '09-calendar-current', page.getByRole('region', { name: '결제·지출 달력' }))
    await part(page, '11-ledger-current', page.getByRole('region', { name: '이달 가계부 요약' }))
    await part(page, '15-ledger-dashboard', page.getByRole('region', { name: '이달 현황판' }))

    // 가격표 사진 예시: 처음 보이는 사진은 라면 진열대라, 다나와 조회값이 있는 차 진열대를 골라 저장된 결과와 다나와 조회값을 나눠 찍는다(한 장으로 찍으면 세로로 너무 길다).
    // 2026-11-03부터 공개 빌드는 AI 서버에 연결돼 저장된 사진 예시 탭이 없다. 그 빌드에서는 12·14번을 다시 찍지 않는다('이전 기록' 사진으로 둠)
    await page.goto(new URL('?tab=photo', BASE).href)
    await page.waitForLoadState('networkidle')
    await page.addStyleTag({ content: '::-webkit-scrollbar{display:none} html{scrollbar-width:none}' })
    if (await page.getByRole('button', { name: '차 진열대', exact: true }).count()) {
    await page.getByRole('button', { name: '차 진열대', exact: true }).click()
    const result = page.getByRole('region', { name: '미리 읽은 품목과 가격 비교' })
    const danawa = page.getByRole('region', { name: '다나와 표시 가격 비교' })
    await result.scrollIntoViewIfNeeded()
    const r = await result.boundingBox()
    const d = await danawa.boundingBox()
    const y = await page.evaluate(() => window.scrollY)
    const split = d.y - 16
    // 아래에 붙은 주요 메뉴가 전체 화면 촬영에서 내용 중간을 가리지 않도록 이 두 사진에서만 숨긴다
    const hideNav = await page.addStyleTag({ content: '.tabs.tabs-main{visibility:hidden}' })
    await page.screenshot({ path: file('12-photo-demo'), fullPage: true, clip: { x: r.x, y: r.y + y, width: r.width, height: split - r.y } })
    await page.screenshot({ path: file('14-danawa-prices'), fullPage: true, clip: { x: r.x, y: split + y, width: r.width, height: r.y + r.height - split } })
    await hideNav.evaluate((el) => el.remove())
    }

    await tab(page, '물건')
    await viewAt(page, '05-wishlist')
    const entry = page.locator('#wish-entry')
    if (!(await entry.evaluate((el) => el.open))) await page.locator('#wish-entry-title').click()
    // AI 서버가 없는 빌드는 준비한 문장으로 채우고, 공개 빌드(말로 담기)는 같은 값을 직접 적는다
    const demoVoice = page.getByRole('button', { name: '예시 음성 결과 채우기' })
    if (await demoVoice.count()) await demoVoice.click()
    else {
      await entry.getByLabel('상품명').fill('무선 헤드폰')
      await entry.getByLabel('가격').fill('80000')
    }
    await viewAt(page, '06-quick-add', entry)

    await tab(page, '모으기')
    await viewAt(page, '10-benefits-current')
    await context.close()
  }

  await browser.close()
})()
