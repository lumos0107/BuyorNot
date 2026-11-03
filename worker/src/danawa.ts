import type { DanawaRow } from '../../src/ai/types.ts'
import type { Deps } from './env.ts'

const SEARCH_ORIGIN = 'https://search.danawa.com/'
const USER_AGENT = 'BuyorNot-AI/1.0 (+https://lumos0107.github.io/BuyorNot/)'
const MAX_BYTES = 3_000_000
const MAX_ROWS = 30
const MAX_PRICE = 1_000_000_000
const MAX_PACK = 9999

export function danawaSearchUrl(query: string): string {
  const url = new URL(SEARCH_ORIGIN)
  url.searchParams.set('query', query)
  return url.toString()
}

// 리디렉션 목적지가 다나와 검색 주소(https · search.danawa.com · 경로 /)일 때만 주소를 돌려준다.
function checkedRedirect(location: string | null, from: string): string | null {
  if (location === null) return null
  let target: URL
  try {
    target = new URL(location, from)
  } catch {
    return null
  }
  if (
    target.protocol !== 'https:' ||
    target.host !== 'search.danawa.com' ||
    target.pathname !== '/' ||
    target.username !== '' ||
    target.password !== ''
  ) {
    return null
  }
  return target.toString()
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400
}

// 본문을 읽으며 3,000,000바이트를 넘으면 읽기를 멈추고 null
async function readBody(res: Response, onReader: (r: ReadableStreamDefaultReader<Uint8Array>) => void) {
  if (res.body === null) return null
  const reader = res.body.getReader()
  onReader(reader)
  const decoder = new TextDecoder('utf-8')
  let total = 0
  let html = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {})
      return null
    }
    html += decoder.decode(value, { stream: true })
  }
  return html + decoder.decode()
}

// 리디렉션 한 번과 본문 읽기를 모두 하나의 시간 상한 안에서 끝낸다. 던지지 않는다.
export async function fetchDanawa(
  query: string,
  deps: Pick<Deps, 'fetch'>,
  timeoutMs: number,
): Promise<{ ok: true; html: string } | { ok: false }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  // 신호를 무시하는 fetch·본문이 있어도 상한 시각에 반드시 끝나도록 신호와 겨룬다
  const aborted = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('aborted')))
  })
  aborted.catch(() => {})
  const held: { reader: ReadableStreamDefaultReader<Uint8Array> | null } = { reader: null }

  const get = (url: string) =>
    deps.fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    })

  const run = async (): Promise<{ ok: true; html: string } | { ok: false }> => {
    const firstUrl = danawaSearchUrl(query)
    let res = await get(firstUrl)
    if (isRedirect(res.status)) {
      const next = checkedRedirect(res.headers.get('location'), firstUrl)
      void res.body?.cancel().catch(() => {})
      if (next === null) return { ok: false }
      res = await get(next)
    }
    if (res.status !== 200) {
      void res.body?.cancel().catch(() => {})
      return { ok: false }
    }
    const html = await readBody(res, (r) => {
      held.reader = r
    })
    return html === null ? { ok: false } : { ok: true, html }
  }

  try {
    return await Promise.race([run(), aborted])
  } catch {
    // 시간 초과 등으로 끝났다면 받던 본문을 놓는다. 오류 내용에는 요청·페이지 정보가 섞일 수 있어 남기지 않는다.
    void held.reader?.cancel().catch(() => {})
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}

// ---- 줄 뽑기 ----

const NAMED_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  nbsp: ' ',
}

// 한 번만 푼다(&amp;lt; 는 &lt; 로 남는다). 만들 수 없는 숫자는 그대로 둔다.
function decodeEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(lt|gt|amp|quot|nbsp));/g, (whole, dec, hex, name) => {
    if (name !== undefined) return NAMED_ENTITIES[name as string]
    const code = dec !== undefined ? Number(dec) : parseInt(hex as string, 16)
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return whole
    return String.fromCodePoint(code)
  })
}

const PACK_RE = /(?:\d+ 위 )?(\d+)개 ([\d,]+)원\/(\S+) ([\d,]+)원 ([\d,]+\+?) 몰/g
const SINGLE_RE = /관심 상품분류 .*? ([\d,]+)원 ([\d,]+\+?) 몰/
const IMAGE_MARK = ' 이미지 보기 '
const LIST_MARK = '배송비포함 ON OFF'

function toNumber(text: string): number {
  return Number(text.replace(/,/g, ''))
}

function validRow(name: string, packCount: number | null, price: number): boolean {
  if (!Number.isInteger(price) || price < 1 || price > MAX_PRICE) return false
  if (packCount !== null && (!Number.isInteger(packCount) || packCount < 1 || packCount > MAX_PACK)) {
    return false
  }
  return name !== ''
}

// 다나와가 '"…"에 대한 검색결과가 없습니다.'를 보이면 검색은 됐고 결과만 0건이다.
// 이 문장이 없는데 줄도 없으면 페이지 모양이 바뀐 것으로 보고 '가져오지 못함'으로 둔다 (2026-11-03)
export function isDanawaEmpty(html: string): boolean {
  return html.includes('검색결과가 없습니다')
}

export function parseDanawaRows(html: string): DanawaRow[] {
  const mainAt = html.indexOf('<main')
  if (mainAt < 0) return []

  const text = decodeEntities(
    html
      .slice(mainAt)
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
      .replace(/<img\b[^>]*?\balt="([^"]*)"[^>]*>/gi, ' [상품] $1 ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')

  const markAt = text.indexOf(LIST_MARK)
  if (markAt < 0) return []

  const rows: DanawaRow[] = []
  // 첫 조각은 첫 [상품] 앞의 글이라 상품이 아니다
  const chunks = text.slice(markAt + LIST_MARK.length).split('[상품] ').slice(1)
  for (const chunk of chunks) {
    if (rows.length >= MAX_ROWS) break
    const imageAt = chunk.indexOf(IMAGE_MARK)
    if (imageAt < 0) continue
    const name = chunk.slice(0, imageAt).trim()
    if (name.includes('광고')) continue
    const rest = chunk.slice(imageAt + IMAGE_MARK.length)

    const candidates: DanawaRow[] = []
    const packed = [...rest.matchAll(PACK_RE)]
    if (packed.length > 0) {
      for (const m of packed) {
        candidates.push({
          name,
          packCount: Number(m[1]),
          price: toNumber(m[4]),
          unitPriceText: `${m[2]}원/${m[3]}`,
          malls: m[5],
        })
      }
    } else {
      const single = SINGLE_RE.exec(rest)
      if (single !== null) {
        candidates.push({
          name,
          packCount: null,
          price: toNumber(single[1]),
          unitPriceText: null,
          malls: single[2],
        })
      }
    }
    for (const row of candidates) {
      if (rows.length >= MAX_ROWS) break
      if (validRow(row.name, row.packCount, row.price)) rows.push(row)
    }
  }
  return rows
}
