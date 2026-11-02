import type { ItemCategory } from '../logic/itemCategory'

// 물건 분류 아이콘(F85). 분류 이름과 함께만 쓰는 장식이라 화면 낭독기에는 읽히지 않게 aria-hidden으로 감싼다.
const common = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  focusable: 'false' as const,
}

const paths: Record<ItemCategory, React.ReactNode> = {
  // 게임 패드
  hobby: <><path d="M7 8h10a4 4 0 0 1 4 4v1.5a3.5 3.5 0 0 1-6.3 2.1L14 14.5h-4l-.7 1.1A3.5 3.5 0 0 1 3 13.5V12a4 4 0 0 1 4-4Z" /><path d="M8 10.5v3M6.5 12h3" /><circle cx="16" cy="11" r=".6" /><circle cx="17.5" cy="13" r=".6" /></>,
  // 숟가락·포크
  food: <><path d="M7 3v7a2 2 0 0 0 2 2v9" /><path d="M5 3v5a2 2 0 0 0 2 2M9 3v5a2 2 0 0 1-2 2" /><path d="M17 21V3c-2 1.5-3 4-3 7a3 3 0 0 0 3 3" /></>,
  // 집
  living: <><path d="M4 11 12 4l8 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></>,
  // 티셔츠
  fashion: <path d="M8.5 4 4 6.5 5.5 10 8 9v11h8V9l2.5 1L20 6.5 15.5 4a3.5 3.5 0 0 1-7 0Z" />,
  // 휴대폰
  digital: <><rect x="7" y="3" width="10" height="18" rx="2.2" /><path d="M11 18h2" /></>,
  // 책
  study: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" /></>,
  // 상자
  other: <><path d="M4 8 12 4l8 4v8l-8 4-8-4Z" /><path d="M4 8l8 4 8-4M12 12v8" /></>,
}

export function CategoryIcon({ category }: { category: ItemCategory }) {
  return <svg {...common}>{paths[category]}</svg>
}
