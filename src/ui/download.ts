/**
 * 글을 파일로 내려받는다. 백업 파일 받기(BackupSection)와 같은 방식: Blob → 객체 주소 → 보이지 않는 링크를 눌러 저장하고 주소를 바로 푼다.
 * 서버로 보내지 않는다.
 */
export function downloadText(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
