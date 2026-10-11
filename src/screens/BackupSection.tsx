import { useId, useRef, useState, type ChangeEvent } from 'react'
import { backupFileName, describeBackup, makeBackup, parseBackup, type BackupData } from '../logic/backup'
import { Button } from '../ui/Button'

// PRD F20 백업·복원: 기록은 이 브라우저에만 있으므로 파일로 받아 옮기거나 보관한다.
// 불러오기는 파일 내용을 확인한 뒤에만 지금 기록을 바꾼다.
type Props = {
  data: BackupData
  onImport: (data: BackupData) => void
}

const READ_ERROR = '백업 파일을 읽을 수 없어요. 살까말까에서 받은 백업 파일인지 확인해 주세요.'

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

export function BackupSection({ data, onImport }: Props) {
  const inputId = useId()
  const errorId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const [pending, setPending] = useState<BackupData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const download = () => {
    const now = new Date()
    const url = URL.createObjectURL(new Blob([makeBackup(data, now)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = backupFileName(now)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setMessage('백업 파일을 내려받았어요. 안전한 곳에 보관해 주세요.')
  }

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setMessage('')
    if (!file) return
    const parsed = parseBackup(await readText(file).catch(() => ''))
    if (!parsed.ok) {
      setPending(null)
      setError(READ_ERROR)
      return
    }
    setError(null)
    setPending(parsed.data)
  }

  const clearFile = () => {
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <details className="card guide">
      <summary className="card-title">기록 백업·복원</summary>
      <div className="stack">
        <p className="note">다른 기기나 브라우저로 옮기거나 보관하려면 백업 파일을 받아 두세요. 불러오면 지금 기록이 파일의 기록으로 바뀌어요.</p>
        <div className="btn-row">
          <Button onClick={download}>백업 파일 받기</Button>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={inputId}>
            백업 파일 불러오기
          </label>
          <input
            id={inputId}
            ref={fileRef}
            className="input file-input"
            type="file"
            accept="application/json,.json"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={choose}
          />
          {error ? (
            <p className="field-error" id={errorId}>
              {error}
            </p>
          ) : null}
        </div>
        {pending ? (
          <div className="stack" role="group" aria-label="백업 불러오기 확인">
            <p className="field-label">{`이 파일에는 ${describeBackup(pending)}이 들어 있어요. 지금 기록을 이 파일의 기록으로 바꿀까요?`}</p>
            <div className="btn-row">
              <Button
                variant="danger"
                autoFocus
                onClick={() => {
                  onImport(pending)
                  setPending(null)
                  clearFile()
                  setMessage('백업 파일의 기록으로 바꿨어요.')
                  statusRef.current?.focus()
                }}
              >
                바꾸기
              </Button>
              <Button
                onClick={() => {
                  setPending(null)
                  clearFile()
                  fileRef.current?.focus()
                }}
              >
                취소
              </Button>
            </div>
          </div>
        ) : null}
        <p className="note" role="status" aria-label="백업 상태" tabIndex={-1} ref={statusRef}>
          {message}
        </p>
      </div>
    </details>
  )
}
