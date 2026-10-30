import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockImagePipeline, mockObjectUrls } from './aiMocks'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

// 가짜 전역이 제대로 동작하고, 테스트가 끝나면 원래대로 돌아오는지 확인한다(다른 테스트가 새지 않게).
describe('mockObjectUrls', () => {
  it('호출마다 다른 주소를 주고 만든 것과 해제한 것을 기록한다', () => {
    const urls = mockObjectUrls()

    const a = URL.createObjectURL(new Blob(['a']))
    const b = URL.createObjectURL(new Blob(['b']))
    URL.revokeObjectURL(a)

    expect(a).not.toBe(b)
    expect(a.startsWith('blob:')).toBe(true)
    expect(urls.created).toEqual([a, b])
    expect(urls.revoked).toEqual([a])
  })

  it('가짜로 바꿔도 new URL은 그대로 쓸 수 있고, 되돌리면 원래 URL이 돌아온다', () => {
    const RealURL = URL
    mockObjectUrls()

    expect(new URL('https://ai.example.com/a?b=1').origin).toBe('https://ai.example.com')
    expect(URL).not.toBe(RealURL)

    vi.unstubAllGlobals()
    expect(URL).toBe(RealURL)
  })
})

describe('mockImagePipeline', () => {
  it('테스트가 끝나면 createImageBitmap과 canvas가 원래대로 돌아온다', async () => {
    const proto = HTMLCanvasElement.prototype
    const originalGetContext = proto.getContext
    expect(typeof createImageBitmap).toBe('undefined')

    mockImagePipeline({ decode: 'ok', toBlob: 'ok' })
    expect(proto.getContext).not.toBe(originalGetContext)
    expect(typeof createImageBitmap).toBe('function')

    vi.unstubAllGlobals()
    expect(typeof createImageBitmap).toBe('undefined')
  })

  it('앞 테스트의 canvas 가짜가 남아 있지 않다', () => {
    expect(vi.isMockFunction(HTMLCanvasElement.prototype.getContext)).toBe(false)
    expect(vi.isMockFunction(HTMLCanvasElement.prototype.toBlob)).toBe(false)
  })
})
