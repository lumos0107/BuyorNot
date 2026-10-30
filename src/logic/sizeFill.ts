import type { SizeCandidate, SizeUnit } from '../ai/types'
import { BASIS_MAX, formatCm, MM_MAX, MM_MIN } from './fit'

// PRD F44 2단계(AI 치수 읽기): 상품 페이지 캡처에서 읽은 치수 표기를 확인 상자 문장과 물건 칸 글자(cm)로 바꾼다.
// 채우기 규칙(F44): 모르는 값은 그 칸을 비우고 기존 값도 지운다. 그래서 누르기 전에 지울 칸을 알린다.
// 확인 상자 문장은 처음 표시와 사용자가 단위를 고른 뒤 모두 candidateView 하나로 만든다.

type Axis = 'w' | 'd' | 'h'
type SizeFields = Record<Axis, string>

const AXES: readonly Axis[] = ['w', 'd', 'h']
const AXIS_NAME: Record<Axis, string> = { w: '가로', d: '깊이', h: '높이' }
const MM_PER: Record<SizeUnit, number> = { mm: 1, cm: 10, m: 1000 }

const KIND_TEXT: Record<SizeCandidate['kind'], string> = {
  product: '제품 치수예요.',
  package: '포장 치수예요. 실제 쓰는 상태의 크기와 다를 수 있어요.',
  unknown: '제품 치수인지 포장 치수인지 적혀 있지 않아요. 확인해 주세요.',
}
const ORDER_TEXT = '축이 분명하지 않아 적힌 순서대로 가로·깊이·높이에 넣어요. 맞는지 확인해 주세요.'
const MIXED_TEXT = '축마다 단위가 달라 자동으로 넣지 않아요. 직접 입력해 주세요.'
const CHOOSE_UNIT_TEXT = '단위를 고르면 넣을 값을 cm로 보여 드려요.'
const UNKNOWN = '모름'
// 읽은 글이 사진에 정말 있는지는 AI가 보증하지 않으므로 사용자에게 대조를 부탁한다 (판정 R29-I1)
const CHECK_TEXT = '사진과 같은지 확인해 주세요'

const BASIS_SEPARATOR = ' · '
const BASIS_KIND: Record<SizeCandidate['kind'], string | null> = { product: null, package: '포장 치수', unknown: '제품·포장 표기 없음' }
const BASIS_ORDER = '적힌 순서로 넣은 치수'

/** 확인 상자에 보일 것. 단위가 mixed면 화면은 read와 notice만 보인다(PRD F44) */
export type CandidateView = {
  /** "AI가 읽은 내용: ‘{text}’"(label이 있으면 앞에 "{label} · "). 표기가 여러 개일 때 라디오 이름 */
  choice: string
  /** 확인 상자 첫 줄: choice 뒤에 " · 사진과 같은지 확인해 주세요" */
  read: string
  /** 제품·포장·표기 없음 문장 */
  kind: string
  /** 축이 분명하지 않을 때(order) 문장 */
  axes: string | null
  /** "넣을 값: …" 또는 단위를 고르라는 줄. 단위가 mixed면 null */
  fill: string | null
  /** "모름인 칸은 지금 값을 지워요: …" — 모르는 값인데 지금 칸에 글자가 있을 때만 */
  clears: string | null
  /** 단위가 mixed일 때의 문장 (판정 R19) */
  notice: string | null
  /** 넣기 버튼 이름. 단위가 mixed면 버튼이 없다(null) */
  applyLabel: '넣기' | '적힌 순서대로 넣기' | null
}

/**
 * 읽은 값 → 물건 칸 글자(cm). value × {mm 1, cm 10, m 1000}이 반올림 전에 1~10000mm일 때만 받고,
 * 반올림한 mm를 소수 첫째 자리 cm로 적는다. 범위 밖·값이나 단위가 null이면 '' (그 칸은 모름).
 * 반올림 뒤에 보면 0.99mm·10000.4mm가 범위 안으로 들어오므로 반드시 먼저 본다.
 */
export function toCmText(value: number | null, unit: SizeUnit | null): string {
  if (value === null || unit === null) return ''
  const mm = value * MM_PER[unit]
  if (!(mm >= MM_MIN && mm <= MM_MAX)) return ''
  return formatCm(Math.round(mm))
}

/** 읽은 단위(mm·cm·m)가 있으면 그것, 없으면 사용자가 고른 단위. mixed면 null(넣지 않는다) */
function unitFor(c: SizeCandidate, chosen: SizeUnit | null): SizeUnit | null {
  if (c.unit === 'mixed') return null
  return c.unit ?? chosen
}

/** 넣을 물건 세 칸 글자. unit은 사용자가 고른 단위이고 읽은 단위가 있으면 그것을 쓴다. 모르는 값은 '' */
export function candidateToFields(c: SizeCandidate, unit: SizeUnit): SizeFields {
  const used = unitFor(c, unit)
  return { w: toCmText(c.w, used), d: toCmText(c.d, used), h: toCmText(c.h, used) }
}

/** 서버가 앞뒤 공백을 지우지만, 빈 글자·공백뿐인 label은 없는 것으로 본다 */
function labelOf(c: SizeCandidate): string | null {
  return c.label !== null && c.label.trim() !== '' ? c.label : null
}

function fillLine(fields: SizeFields): string {
  const value = (axis: Axis) => (fields[axis] === '' ? UNKNOWN : fields[axis])
  // 높이를 모르면 "높이 모름"(단위 cm도 함께 뺀다. F32의 "가격 모름"과 같은 방식)
  const height = fields.h === '' ? UNKNOWN : `${fields.h}cm`
  return `넣을 값: 가로 ${value('w')} · 깊이 ${value('d')} · 높이 ${height}`
}

/**
 * 확인 상자 문장. unit은 읽은 단위가 없을 때 사용자가 고른 단위(아직이면 null), current는 지금 물건 칸 글자.
 * 단위를 아직 모르면 환산 전 숫자를 cm로 오인하지 않게 넣을 값 대신 단위를 고르라는 줄을 보이고 지울 칸도 알리지 않는다.
 */
export function candidateView(c: SizeCandidate, unit: SizeUnit | null, current: SizeFields): CandidateView {
  const label = labelOf(c)
  const choice = `${label === null ? '' : `${label} · `}AI가 읽은 내용: ‘${c.text}’`
  const read = `${choice} · ${CHECK_TEXT}`
  const kind = KIND_TEXT[c.kind]
  if (c.unit === 'mixed') return { choice, read, kind, axes: null, fill: null, clears: null, notice: MIXED_TEXT, applyLabel: null }

  const axes = c.axes === 'order' ? ORDER_TEXT : null
  const applyLabel = c.axes === 'order' ? '적힌 순서대로 넣기' : '넣기'
  const used = unitFor(c, unit)
  if (used === null) return { choice, read, kind, axes, fill: CHOOSE_UNIT_TEXT, clears: null, notice: null, applyLabel }

  const fields = candidateToFields(c, used)
  const cleared = AXES.filter((axis) => fields[axis] === '' && current[axis].trim() !== '')
  const clears = cleared.length > 0 ? `모름인 칸은 지금 값을 지워요: ${cleared.map((axis) => AXIS_NAME[axis]).join('·')}` : null
  return { choice, read, kind, axes, fill: fillLine(fields), clears, notice: null, applyLabel }
}

/** 마지막 글자가 서로게이트 쌍의 앞 반쪽이면 뺀다(잘라서 깨진 글자를 저장하지 않게) */
function dropHalfPair(text: string): string {
  const last = text.charCodeAt(text.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? text.slice(0, -1) : text
}

/**
 * 읽은 치수의 기준: (포장 '포장 치수' / 표기 없음 '제품·포장 표기 없음') · (order면 '적힌 순서로 넣은 치수') · (label).
 * 하나도 없으면 null. BASIS_MAX(30자, 저장 검사 isFit처럼 .length로 셈)를 넘으면 앞의 두 말은 두고 label만 잘라 맞춘다.
 */
export function candidateBasis(c: SizeCandidate): string | null {
  const head = [BASIS_KIND[c.kind], c.axes === 'order' ? BASIS_ORDER : null].filter((part): part is string => part !== null)
  const label = labelOf(c)
  if (label === null) return head.length > 0 ? head.join(BASIS_SEPARATOR) : null
  const prefix = head.length > 0 ? head.join(BASIS_SEPARATOR) + BASIS_SEPARATOR : ''
  // 앞의 두 말은 가장 길어도 29자라 label 자리는 늘 1자 이상 남는다
  const cut = dropHalfPair(label.slice(0, BASIS_MAX - prefix.length))
  if (cut === '') return head.join(BASIS_SEPARATOR)
  return prefix + cut
}
