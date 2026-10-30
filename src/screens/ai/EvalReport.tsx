import { isEvalSummary, reportHeader, reportLines, type FeatureSummary } from '../../ai/evalSummary.ts'

// PRD F43 AI 성적표: "기록 백업·복원" 아래 접이식 카드. 서버와 Gemini를 부르지 않고 저장소에 커밋한 요약 파일만 읽는다.
// 서버 주소가 있을 때만 그리는 것은 App이 정한다. 요약 파일의 모양이 맞지 않거나 기능이 하나도 없으면(처음 값) 그리지 않는다.
// 요약에 없는 기능은 묶음이 없다. 읽은 글(틀린 예의 AI 값)은 글자로만 보인다.
export function EvalReport({ summary }: { summary: unknown }) {
  if (!isEvalSummary(summary) || summary.features.length === 0) return null
  const [model, note] = reportHeader(summary)
  return (
    <details className="card guide">
      <summary className="card-title">AI 성적표</summary>
      <div className="stack">
        <p>{model}</p>
        <p className="note">{note}</p>
        {summary.features.map((feature) => (
          <FeatureReport key={feature.id} feature={feature} />
        ))}
      </div>
    </details>
  )
}

function FeatureReport({ feature }: { feature: FeatureSummary }) {
  const report = reportLines(feature)
  return (
    <section className="stack">
      <h3 className="section-title">{report.title}</h3>
      {report.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <p className="field-label">{report.failureHead}</p>
      {report.failureLines.length > 0 ? (
        <ul className="steps">
          {report.failureLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
