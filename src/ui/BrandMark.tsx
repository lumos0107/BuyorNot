/** 첫 화면부터 쓰는 작은 장식 표식. 텍스트 이름은 옆의 h1이 읽힌다. */
export function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <rect width="36" height="36" rx="11" fill="var(--accent-soft)" />
    <rect x="9" y="8" width="18" height="21" rx="4" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
    <path d="M13 15h10M13 20h6" fill="none" stroke="var(--line)" strokeWidth="2" strokeLinecap="round" />
    <path d="M18 24l3 3 6-7" fill="none" stroke="var(--accent)" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}
