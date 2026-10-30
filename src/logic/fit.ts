// PRD F44 놓을 자리 확인: 입력한 치수만 비교하고, 사라·말라는 말하지 않는다.
// 치수는 mm 정수로 저장·계산한다(입력 cm × 10). 부동소수 뺄셈으로 판정하지 않는다.

/** 가로(w)·깊이(d)·높이(h), 모두 mm 정수 1~10000 */
export type Dims = { w: number; d: number; h: number }
export type Fit = { place: string; space: Dims; item: Dims; basis?: string; savedAt: string }
export type FitVerdict = 'fits' | 'tight' | 'no'

/** 빠듯함 기준(mm). 검증한 안전 여유가 아니라 임시 안내 기준이다 (PRD F44). 다른 곳에 이 값을 다시 적지 않는다 */
export const TIGHT_MM = 20
export const PLACE_MAX = 20
export const BASIS_MAX = 30

const MM_MIN = 1
const MM_MAX = 10000

const NOT_CM = 'cm로 적어 주세요(예: 40 또는 40.5)'
const ONE_DECIMAL = '소수 첫째 자리까지 적어 주세요'
const OUT_OF_RANGE = '0.1~1000cm 사이로 적어 주세요'

const CM_FORMAT = /^(\d+(\.\d)?|\.\d)$/
const TOO_MANY_DECIMALS = /^\d*\.\d{2,}$/

/** cm 입력 → mm 정수. 정수부와 소수 한 자리를 문자열에서 따로 읽어 부동소수 곱셈을 쓰지 않는다 */
export function parseCm(raw: string): { mm?: number; error?: string } {
  const text = raw.trim()
  if (!CM_FORMAT.test(text)) {
    return { error: TOO_MANY_DECIMALS.test(text) ? ONE_DECIMAL : NOT_CM }
  }
  const [whole = '', tenth = ''] = text.split('.')
  const mm = (whole === '' ? 0 : Number(whole)) * 10 + (tenth === '' ? 0 : Number(tenth))
  if (mm < MM_MIN || mm > MM_MAX) return { error: OUT_OF_RANGE }
  return { mm }
}

/** 놓을 곳 이름: 앞뒤 공백을 지우고 1~PLACE_MAX자. 글자 수는 앱의 다른 입력 상한처럼 `.length`로 센다 */
export function validatePlace(raw: string): { value?: string; error?: string } {
  const value = raw.trim()
  if (value.length === 0) return { error: '놓을 곳 이름을 적어 주세요' }
  if (value.length > PLACE_MAX) return { error: `놓을 곳 이름은 ${PLACE_MAX}자 이하로 적어 주세요` }
  return { value }
}

/** 0 이상의 mm → 소수 첫째 자리 cm, 끝의 .0은 뺀다. 80 → '8', 1 → '0.1', 471 → '47.1' */
export function formatCm(mm: number): string {
  const whole = Math.floor(mm / 10)
  const tenth = mm % 10
  return tenth === 0 ? String(whole) : `${whole}.${tenth}`
}

const RANK: Record<FitVerdict, number> = { no: 0, tight: 1, fits: 2 }

function verdictOf(margins: Dims): FitVerdict {
  const least = Math.min(margins.w, margins.d, margins.h)
  if (least < 0) return 'no'
  return least < TIGHT_MM ? 'tight' : 'fits'
}

function orientation(space: Dims, item: Dims): { margins: Dims; verdict: FitVerdict } {
  const margins = { w: space.w - item.w, d: space.d - item.d, h: space.h - item.h }
  return { margins, verdict: verdictOf(margins) }
}

/**
 * 높이 축은 고정(눕히지 않음). 방향 1은 물건 가로를 놓을 곳 가로에, 방향 2는 바닥에서 90도 돌려 물건 깊이를 놓을 곳 가로에 맞춘다.
 * 물건 가로와 깊이가 같으면 방향 2는 없다. 결과는 두 방향 중 나은 쪽(같으면 방향 1).
 */
export function checkFit(space: Dims, item: Dims): { verdict: FitVerdict; orientations: { margins: Dims; verdict: FitVerdict }[] } {
  const first = orientation(space, item)
  if (item.w === item.d) return { verdict: first.verdict, orientations: [first] }
  const second = orientation(space, { w: item.d, d: item.w, h: item.h })
  const best = RANK[second.verdict] > RANK[first.verdict] ? second : first
  return { verdict: best.verdict, orientations: [first, second] }
}

const VERDICT_TEXT: Record<FitVerdict, string> = { fits: '들어가요', tight: '빠듯해요', no: '안 들어가요' }

const ROTATED_NOTE = '방향 2는 물건을 바닥에서 90도 돌려 놓은 경우예요.'
const LAST_LINE = '입력한 치수만 비교했어요. 눕혀 놓는 경우와 문 여닫는 공간·손잡이·전선·환기 공간은 따로 확인해 주세요.'

const basisSuffix = (basis: string | undefined) => (basis ? ` (${basis} 기준)` : '')

function marginText(label: string, mm: number): string {
  if (mm === 0) return `${label} 꼭 맞음`
  return mm > 0 ? `${label} ${formatCm(mm)}cm 남음` : `${label} ${formatCm(-mm)}cm 넘침`
}

function headline(place: string, verdict: FitVerdict): string {
  if (verdict === 'tight') {
    return `입력 치수상 ${place}에 들어가지만 빠듯해요(한 축 이상에서 남는 곳이 ${formatCm(TIGHT_MM)}cm보다 적어요). 줄자로 다시 재 보세요.`
  }
  return `입력 치수상 ${place}에 ${VERDICT_TEXT[verdict]}.`
}

/** 결과 문장 목록: 첫 줄(기준이 있으면 끝에 붙임), 방향마다 한 줄, (방향 2가 있으면) 설명, 마지막 줄 */
export function fitLines(fit: Pick<Fit, 'place' | 'space' | 'item' | 'basis'>): string[] {
  const { verdict, orientations } = checkFit(fit.space, fit.item)
  const lines = [headline(fit.place, verdict) + basisSuffix(fit.basis)]
  orientations.forEach(({ margins, verdict: own }, index) => {
    const axes = [marginText('가로', margins.w), marginText('깊이', margins.d), marginText('높이', margins.h)]
    lines.push(`방향 ${index + 1}: ${axes.join(' · ')} → ${VERDICT_TEXT[own]}`)
  })
  if (orientations.length > 1) lines.push(ROTATED_NOTE)
  lines.push(LAST_LINE)
  return lines
}

/** 접힌 제목에 쓰는 요약. 마침표와 기준은 붙이지 않는다 */
export function fitSummary(fit: Pick<Fit, 'place' | 'space' | 'item'>): string {
  return `입력 치수상 ${fit.place}에 ${VERDICT_TEXT[checkFit(fit.space, fit.item).verdict]}`
}

/** 사기 전에 한 번 더(F15)에 넘길 걸리는 점. 들어가요면 null */
export function fitSignal(fit: Pick<Fit, 'place' | 'space' | 'item' | 'basis'>): string | null {
  const { verdict } = checkFit(fit.space, fit.item)
  if (verdict === 'fits') return null
  return `입력한 치수로는 '${fit.place}'에 ${VERDICT_TEXT[verdict]}${basisSuffix(fit.basis)}`
}

function isDims(v: unknown): v is Dims {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return [o.w, o.d, o.h].every((n) => Number.isInteger(n) && (n as number) >= MM_MIN && (n as number) <= MM_MAX)
}

/** 저장·복원 검사 (storage.ts의 isTimestamp와 같은 기준: 문자열이고 Date.parse가 유한한 값) */
export function isFit(v: unknown): v is Fit {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.place !== 'string' || o.place.length < 1 || o.place.length > PLACE_MAX || o.place !== o.place.trim()) return false
  if (!isDims(o.space) || !isDims(o.item)) return false
  if (o.basis !== undefined && !(typeof o.basis === 'string' && o.basis.length >= 1 && o.basis.length <= BASIS_MAX)) return false
  return typeof o.savedAt === 'string' && Number.isFinite(Date.parse(o.savedAt))
}
