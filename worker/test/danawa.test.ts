// @vitest-environment node
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixtureHtml from './fixtures/danawa-search.html?raw'
import { danawaSearchUrl, fetchDanawa, parseDanawaRows } from '../src/danawa.ts'

const SEARCH_URL =
  'https://search.danawa.com/?query=%EB%86%8D%EC%8B%AC+%EC%98%A4%EC%A7%95%EC%96%B4%EC%A7%AC%EB%BD%95+%EC%86%8C%EC%BB%B5'
const QUERY = '농심 오징어짬뽕 소컵'
const USER_AGENT = 'BuyorNot-AI/1.0 (+https://lumos0107.github.io/BuyorNot/)'
const LIMIT = 3_000_000

afterEach(() => {
  vi.useRealTimers()
})

// "배송비포함 ON OFF" 표시 뒤에 줄 조각을 붙인 작은 페이지
function wrap(inner: string): string {
  return `<html><body><main><div>배송비포함 ON OFF</div>${inner}</main></body></html>`
}

describe('다나와 검색 주소', () => {
  // plan: danawaSearchUrl encodes the query
  it('검색어를 주소에 담아 인코딩해요', () => {
    expect(danawaSearchUrl(QUERY)).toBe(SEARCH_URL)
  })

  it('검색어에 섞인 &·#·? 는 주소 구조를 바꾸지 못해요', () => {
    const url = new URL(danawaSearchUrl('a&b=c#d?e'))
    expect(url.origin + url.pathname).toBe('https://search.danawa.com/')
    expect([...url.searchParams.keys()]).toEqual(['query'])
    expect(url.searchParams.get('query')).toBe('a&b=c#d?e')
    expect(url.hash).toBe('')
  })
})

describe('다나와 줄 뽑기', () => {
  // plan: parseDanawaRows reads the fixture
  it('고정 자료에서 광고를 빼고 네 줄을 뽑아요', () => {
    expect(parseDanawaRows(fixtureHtml)).toEqual([
      { name: '농심 오징어짬뽕컵 67g', packCount: 1, price: 800, unitPriceText: '800원/1개', malls: '44' },
      { name: '농심 오징어짬뽕컵 67g', packCount: 6, price: 4900, unitPriceText: '817원/1개', malls: '573' },
      {
        name: '농심 오징어짬뽕컵 67g',
        packCount: 30,
        price: 24120,
        unitPriceText: '804원/1개',
        malls: '999+',
      },
      {
        name: '농심 오징어짬뽕 소컵/박스/6입',
        packCount: null,
        price: 8180,
        unitPriceText: null,
        malls: '7',
      },
    ])
  })

  // plan: parseDanawaRows returns [] without <main> or without the 배송비포함 marker
  it('<main>이 없으면 빈 목록이에요', () => {
    const noMain = fixtureHtml
      .replace('<main class="dnw-search-contents">', '<div>')
      .replace('</main>', '</div>')
    expect(parseDanawaRows(noMain)).toEqual([])
  })

  it('배송비포함 ON OFF 표시가 없으면 빈 목록이에요', () => {
    const noMarker = fixtureHtml.replace('배송비포함 ON OFF', '')
    expect(parseDanawaRows(noMarker)).toEqual([])
  })

  it('빈 글과 엉뚱한 글은 빈 목록이에요', () => {
    expect(parseDanawaRows('')).toEqual([])
    expect(parseDanawaRows('<main>안녕하세요</main>')).toEqual([])
  })

  // plan: parseDanawaRows drops a row with price 0
  it('가격이 0원인 줄은 버려요', () => {
    const html = wrap('<img alt="우유 1L" src="a.jpg"> <a>이미지 보기</a> 관심 상품분류 유제품 &gt; 우유 0원 3 몰')
    expect(parseDanawaRows(html)).toEqual([])
  })

  it('가격이 10억원을 넘는 줄은 버리고 10억원은 남겨요', () => {
    const over = wrap('<img alt="우유" src="a.jpg"> 이미지 보기 관심 상품분류 가 1,000,000,001원 3 몰')
    const edge = wrap('<img alt="우유" src="a.jpg"> 이미지 보기 관심 상품분류 가 1,000,000,000원 3 몰')
    expect(parseDanawaRows(over)).toEqual([])
    expect(parseDanawaRows(edge)).toEqual([
      { name: '우유', packCount: null, price: 1_000_000_000, unitPriceText: null, malls: '3' },
    ])
  })

  it('묶음 개수가 0이거나 10000 이상인 줄은 버려요', () => {
    const zero = wrap('<img alt="물" src="a.jpg"> 이미지 보기 관심 상품분류 음료 0개 100원/1개 500원 3 몰')
    const big = wrap('<img alt="물" src="a.jpg"> 이미지 보기 관심 상품분류 음료 10000개 100원/1개 500원 3 몰')
    const edge = wrap('<img alt="물" src="a.jpg"> 이미지 보기 관심 상품분류 음료 9999개 1원/1개 500원 3 몰')
    expect(parseDanawaRows(zero)).toEqual([])
    expect(parseDanawaRows(big)).toEqual([])
    expect(parseDanawaRows(edge)).toEqual([
      { name: '물', packCount: 9999, price: 500, unitPriceText: '1원/1개', malls: '3' },
    ])
  })

  it('이미지 보기가 없는 조각과 앞부분에 광고가 있는 조각은 건너뛰어요', () => {
    const html = wrap(
      '<img alt="광고 어떤 상품" src="a.jpg"> 이미지 보기 관심 상품분류 가 100원 1 몰 ' +
        '<img alt="그냥 상품" src="b.jpg"> 관심 상품분류 가 200원 1 몰 ' +
        '<img alt="진짜 상품" src="c.jpg"> 이미지 보기 관심 상품분류 가 300원 1 몰',
    )
    expect(parseDanawaRows(html).map((r) => r.name)).toEqual(['진짜 상품'])
  })

  it('이미지 보기 뒤에 광고라는 글이 있어도 건너뛰지 않아요', () => {
    const html = wrap('<img alt="진짜 상품" src="c.jpg"> 이미지 보기 광고 관심 상품분류 가 300원 1 몰')
    expect(parseDanawaRows(html)).toHaveLength(1)
  })

  it('스크립트와 스타일 안의 글은 읽지 않아요', () => {
    const html = wrap(
      "<script>var s='[상품] 가짜 이미지 보기 관심 상품분류 가 100원 1 몰';</script>" +
        "<style>.a::after{content:'[상품] 가짜2 이미지 보기 관심 상품분류 가 100원 1 몰'}</style>" +
        '<img alt="진짜" src="c.jpg"> 이미지 보기 관심 상품분류 가 300원 1 몰',
    )
    expect(parseDanawaRows(html).map((r) => r.name)).toEqual(['진짜'])
  })

  it('이름 속 HTML 엔티티를 한 번만 풀어요', () => {
    const html = wrap(
      '<img alt="A&#39;s &#x42;&amp;lt; &quot;C&quot; &amp;" src="c.jpg"> 이미지 보기 관심 상품분류 가 300원 1 몰',
    )
    expect(parseDanawaRows(html)[0].name).toBe(`A's B&lt; "C" &`)
  })

  it('만들 수 없는 숫자 엔티티는 그대로 두어요', () => {
    const html = wrap('<img alt="X&#99999999;Y" src="c.jpg"> 이미지 보기 관심 상품분류 가 300원 1 몰')
    expect(parseDanawaRows(html)[0].name).toBe('X&#99999999;Y')
  })

  it('최대 30줄만 뽑아요', () => {
    const items = Array.from(
      { length: 40 },
      (_, i) => `<img alt="상품${i}" src="c.jpg"> 이미지 보기 관심 상품분류 가 ${i + 1}00원 1 몰`,
    )
    const rows = parseDanawaRows(wrap(items.join('\n')))
    expect(rows).toHaveLength(30)
    expect(rows[29].name).toBe('상품29')
  })
})

// ---- 가져오기 ----

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } })
}

function page(html: string, status = 200): Response {
  return new Response(html, { status })
}

function setup() {
  const fetchMock = vi.fn<typeof fetch>()
  const deps = { fetch: fetchMock as unknown as typeof fetch }
  return { fetchMock, deps }
}

// 바이트 수를 정해 조각으로 내보내는 본문. 읽기를 멈추면(cancel) onCancel이 불린다.
// keepOpen 이면 조각을 다 보낸 뒤에도 닫지 않는다(끝없이 이어지는 본문).
function bytesBody(chunkSizes: number[], onCancel: () => void = () => {}, keepOpen = false): Response {
  let i = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunkSizes.length) controller.enqueue(new Uint8Array(chunkSizes[i++]).fill(0x61))
      else if (keepOpen) return new Promise<void>(() => {})
      else controller.close()
      return undefined
    },
    cancel() {
      onCancel()
    },
  })
  return new Response(stream, { status: 200 })
}

describe('다나와 가져오기', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  // plan: fetchDanawa follows one redirect to https://search.danawa.com/
  it('search.danawa.com 으로 가는 리디렉션은 한 번 따라가요', async () => {
    const { fetchMock, deps } = setup()
    fetchMock
      .mockResolvedValueOnce(redirect('https://search.danawa.com/'))
      .mockResolvedValueOnce(page('<main>ok</main>'))
    const result = await fetchDanawa(QUERY, deps, 10_000)
    expect(result).toEqual({ ok: true, html: '<main>ok</main>' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe(SEARCH_URL)
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://search.danawa.com/')
  })

  it('상대 주소 리디렉션은 첫 주소를 기준으로 풀어요', async () => {
    const { fetchMock, deps } = setup()
    fetchMock.mockResolvedValueOnce(redirect('/')).mockResolvedValueOnce(page('x'))
    const result = await fetchDanawa(QUERY, deps, 10_000)
    expect(result).toEqual({ ok: true, html: 'x' })
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://search.danawa.com/')
  })

  it('두 요청 모두 redirect manual 과 User-Agent 를 보내요', async () => {
    const { fetchMock, deps } = setup()
    fetchMock
      .mockResolvedValueOnce(redirect('https://search.danawa.com/'))
      .mockResolvedValueOnce(page('x'))
    await fetchDanawa(QUERY, deps, 10_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.redirect).toBe('manual')
      expect(new Headers(init?.headers).get('User-Agent')).toBe(USER_AGENT)
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
  })

  // plan: fetchDanawa refuses a redirect to another host, to http, to another path, and a second redirect
  it.each([
    ['다른 호스트', 'https://www.danawa.com/'],
    ['비슷한 이름의 호스트', 'https://search.danawa.com.evil.example/'],
    ['포트가 붙은 주소', 'https://search.danawa.com:8443/'],
    ['아이디가 붙은 주소', 'https://user:pw@search.danawa.com/'],
    ['http', 'http://search.danawa.com/'],
    ['다른 경로', 'https://search.danawa.com/other'],
    ['주소가 아닌 글', 'http://'],
  ])('%s 로 가는 리디렉션은 따라가지 않아요', async (_label, target) => {
    const { fetchMock, deps } = setup()
    fetchMock.mockResolvedValueOnce(redirect(target)).mockResolvedValueOnce(page('x'))
    expect(await fetchDanawa(QUERY, deps, 10_000)).toEqual({ ok: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('Location 이 없는 리디렉션은 실패해요', async () => {
    const { fetchMock, deps } = setup()
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302 }))
    expect(await fetchDanawa(QUERY, deps, 10_000)).toEqual({ ok: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('리디렉션 뒤에 또 리디렉션이 오면 실패해요', async () => {
    const { fetchMock, deps } = setup()
    fetchMock
      .mockResolvedValueOnce(redirect('https://search.danawa.com/'))
      .mockResolvedValueOnce(redirect('https://search.danawa.com/'))
      .mockResolvedValueOnce(page('x'))
    expect(await fetchDanawa(QUERY, deps, 10_000)).toEqual({ ok: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // plan: fetchDanawa fails on 404
  it('404 이면 실패해요', async () => {
    const { fetchMock, deps } = setup()
    fetchMock.mockResolvedValueOnce(page('없어요', 404))
    expect(await fetchDanawa(QUERY, deps, 10_000)).toEqual({ ok: false })
  })

  it('리디렉션 뒤 응답이 200 이 아니어도 실패해요', async () => {
    const { fetchMock, deps } = setup()
    fetchMock
      .mockResolvedValueOnce(redirect('https://search.danawa.com/'))
      .mockResolvedValueOnce(page('x', 500))
    expect(await fetchDanawa(QUERY, deps, 10_000)).toEqual({ ok: false })
  })

  it('본문이 없는 200 응답은 실패해요', async () => {
    const { fetchMock, deps } = setup()
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
    expect(await fetchDanawa(QUERY, deps, 10_000)).toEqual({ ok: false })
  })

  it('fetch 가 던져도 던지지 않고 실패로 답해요', async () => {
    const { fetchMock, deps } = setup()
    fetchMock.mockRejectedValueOnce(new Error('네트워크 끊김'))
    expect(await fetchDanawa(QUERY, deps, 10_000)).toEqual({ ok: false })
  })

  it('한글 본문을 utf-8 로 풀어요', async () => {
    const { fetchMock, deps } = setup()
    fetchMock.mockResolvedValueOnce(page('<main>오징어짬뽕</main>'))
    expect(await fetchDanawa(QUERY, deps, 10_000)).toEqual({ ok: true, html: '<main>오징어짬뽕</main>' })
  })

  // plan: fetchDanawa stops reading past 3,000,000 bytes
  it('3,000,000바이트를 넘게 받으면 읽기를 멈추고 실패해요', async () => {
    const { fetchMock, deps } = setup()
    const onCancel = vi.fn()
    fetchMock.mockResolvedValueOnce(bytesBody([1_000_000, 1_000_000, 1_000_000, 1], onCancel, true))
    expect(await fetchDanawa(QUERY, deps, 10_000)).toEqual({ ok: false })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('정확히 3,000,000바이트는 받아요', async () => {
    const { fetchMock, deps } = setup()
    const onCancel = vi.fn()
    fetchMock.mockResolvedValueOnce(bytesBody([1_000_000, 1_000_000, 1_000_000], onCancel))
    const result = await fetchDanawa(QUERY, deps, 10_000)
    expect(result.ok).toBe(true)
    expect(result.ok && result.html.length).toBe(LIMIT)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('헤더가 오지 않은 채 시간이 지나면 실패해요', async () => {
    const { fetchMock, deps } = setup()
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const pending = fetchDanawa(QUERY, deps, 10_000)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await pending).toEqual({ ok: false })
  })

  it('본문을 받다가 시간이 지나도 실패해요', async () => {
    const { fetchMock, deps } = setup()
    let sent = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) return new Promise<void>(() => {}) // 더는 오지 않는 본문
        sent = true
        controller.enqueue(new TextEncoder().encode('<main>'))
        return undefined
      },
    })
    fetchMock.mockResolvedValueOnce(new Response(stream, { status: 200 }))
    const pending = fetchDanawa(QUERY, deps, 10_000)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await pending).toEqual({ ok: false })
  })

  it('리디렉션과 본문 읽기가 하나의 시간 상한을 나눠 써요', async () => {
    const { fetchMock, deps } = setup()
    fetchMock
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => setTimeout(() => resolve(redirect('/')), 6_000)),
      )
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => setTimeout(() => resolve(page('x')), 6_000)),
      )
    const pending = fetchDanawa(QUERY, deps, 10_000)
    await vi.advanceTimersByTimeAsync(12_000)
    expect(await pending).toEqual({ ok: false })
  })
})
