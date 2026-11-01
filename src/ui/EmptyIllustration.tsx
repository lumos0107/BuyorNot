/** 두 담기 화면의 빈 상태에 같은 선·색 체계를 쓰는 장식 그림. */
export function EmptyIllustration({ kind }: { kind: 'wish' | 'fixed' }) {
  return (
    <svg className="empty-illustration" viewBox="0 0 160 100" aria-hidden="true" focusable="false">
      <circle cx="80" cy="50" r="46" fill="var(--accent-soft)" />
      <circle cx="20" cy="27" r="4" fill="var(--accent)" opacity=".35" />
      <circle cx="143" cy="74" r="5" fill="var(--accent)" opacity=".25" />
      <rect x="42" y="21" width="76" height="59" rx="11" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
      {kind === 'wish' ? (
        <>
          <path d="M58 43h43M58 55h30" fill="none" stroke="var(--line)" strokeWidth="5" strokeLinecap="round" />
          <circle cx="99" cy="57" r="12" fill="var(--accent-soft)" />
          <path d="M94 57l4 4 7-8" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d="M42 38h76M59 17v11M101 17v11" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
          <path d="M60 52h12M60 63h12M86 52h12M86 63h12" fill="none" stroke="var(--line)" strokeWidth="5" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}
