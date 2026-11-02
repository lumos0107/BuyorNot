// 주요 메뉴 아이콘. 글자 이름과 함께만 쓰는 장식이라 화면 낭독기에는 읽히지 않는다(Tabs가 aria-hidden으로 감싼다).
const common = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  focusable: 'false' as const,
}

// 가격표
export function IconTag() {
  return <svg {...common}><path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9-9-9Z" /><circle cx="8" cy="8" r="1.6" /></svg>
}

// 장바구니
export function IconBag() {
  return <svg {...common}><path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
}

// 결정 기록
export function IconHistory() {
  return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
}

// 가계부(지갑)
export function IconWallet() {
  return <svg {...common}><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><path d="M16 14.5h2" /></svg>
}

// 모으기(동전 쌓기)
export function IconCoins() {
  return <svg {...common}><ellipse cx="12" cy="6.5" rx="7" ry="2.8" /><path d="M5 6.5v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5" /><path d="M5 11.5v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5" /></svg>
}
