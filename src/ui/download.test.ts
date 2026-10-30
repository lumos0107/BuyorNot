import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockObjectUrls } from '../test/aiMocks'
import { downloadText } from './download'

// PRD F35: .ics 내려받기는 백업(F20)과 같은 방식이다. 가짜 객체 주소는 src/test/aiMocks.ts의 것을 쓴다.
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(blob)
  })
}

describe('downloadText', () => {
  it('글을 지정한 형식의 파일 이름으로 내려받고, 링크와 객체 주소를 바로 치운다', async () => {
    const urls = mockObjectUrls()
    const made = vi.spyOn(URL, 'createObjectURL')
    const clicked: { download: string; href: string; connected: boolean }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ download: this.download, href: this.href, connected: this.isConnected })
    })

    downloadText('buyornot-2026-10-14.ics', 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', 'text/calendar;charset=utf-8')

    expect(clicked).toHaveLength(1)
    expect(clicked[0].download).toBe('buyornot-2026-10-14.ics')
    expect(clicked[0].href).toBe(urls.created[0])
    expect(clicked[0].connected).toBe(true) // 일부 브라우저는 문서에 붙어 있어야 저장한다
    const blob = made.mock.calls[0][0] as Blob
    expect(blob.type).toBe('text/calendar;charset=utf-8')
    expect(await readBlob(blob)).toBe('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n')
    expect(urls.revoked).toEqual(urls.created)
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
