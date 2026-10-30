import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockImagePipeline } from '../test/aiMocks'
import { blobToBase64, fitWithin, shrinkImage } from './image'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('fitWithin', () => {
  // plan: fitWithin(4032, 3024, 1600) → { width: 1600, height: 1200 }
  it('가로로 긴 사진은 긴 변 1600에 맞춰 비율을 유지한다', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 })
  })

  // plan: fitWithin(3024, 4032, 1600) → { width: 1200, height: 1600 }
  it('세로로 긴 사진도 긴 변 1600에 맞춰 비율을 유지한다', () => {
    expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  // plan: fitWithin(800, 600, 1600) → unchanged
  it('이미 작은 사진은 키우지 않고 그대로 둔다', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 })
  })

  it('나눠 떨어지지 않으면 반올림하고 한 변이 0이 되지 않게 한다', () => {
    expect(fitWithin(4000, 3001, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(10000, 3, 1600)).toEqual({ width: 1600, height: 1 })
  })
})

describe('shrinkImage', () => {
  // plan: shrinkImage draws at the fitted size, returns a JPEG and closes the bitmap
  it('줄인 크기로 그려 JPEG로 돌려주고 비트맵을 닫는다', async () => {
    const pipeline = mockImagePipeline({ decode: 'ok', toBlob: 'ok' })
    const file = new Blob(['photo'], { type: 'image/png' })

    const out = await shrinkImage(file)

    expect(out.type).toBe('image/jpeg')
    expect(pipeline.decodeCalls).toEqual([{ file, options: { imageOrientation: 'from-image' } }])
    expect(pipeline.draws).toHaveLength(1)
    expect(pipeline.draws[0]).toMatchObject({ args: [0, 0, 1600, 1200], canvasWidth: 1600, canvasHeight: 1200 })
    expect(pipeline.toBlobCalls).toEqual([{ type: 'image/jpeg', quality: 0.85 }])
    expect(pipeline.closed()).toBe(1)
  })

  // JPEG에는 투명이 없어 그냥 그리면 투명 PNG의 빈 곳이 검은색이 된다
  it('그리기 전에 캔버스 전체를 흰색으로 채운다', async () => {
    const pipeline = mockImagePipeline({ decode: 'ok', toBlob: 'ok' })

    await shrinkImage(new Blob(['photo'], { type: 'image/png' }))

    expect(pipeline.fills).toEqual([{ fillStyle: '#ffffff', args: [0, 0, 1600, 1200] }])
    expect(pipeline.steps).toEqual(['fillRect', 'drawImage'])
  })

  it('큰 변과 품질을 바꿔 줄 수 있고, 작은 사진은 크기를 그대로 그린다', async () => {
    const pipeline = mockImagePipeline({ decode: 'ok', toBlob: 'ok', width: 800, height: 600 })

    await shrinkImage(new Blob(['photo']), 1000, 0.5)

    expect(pipeline.draws[0]).toMatchObject({ args: [0, 0, 800, 600], canvasWidth: 800, canvasHeight: 600 })
    expect(pipeline.toBlobCalls).toEqual([{ type: 'image/jpeg', quality: 0.5 }])
  })

  // plan: shrinkImage rejects when decoding fails or toBlob gives null
  it('사진을 열 수 없으면 거절하고 그리지 않는다', async () => {
    const pipeline = mockImagePipeline({ decode: 'fail', toBlob: 'ok' })

    await expect(shrinkImage(new Blob(['heic'], { type: 'image/heic' }))).rejects.toThrow()

    expect(pipeline.draws).toHaveLength(0)
    expect(pipeline.toBlobCalls).toHaveLength(0)
  })

  it('toBlob이 null을 주면 거절하고, 그래도 비트맵은 닫는다', async () => {
    const pipeline = mockImagePipeline({ decode: 'ok', toBlob: 'null' })

    await expect(shrinkImage(new Blob(['photo']))).rejects.toThrow()

    expect(pipeline.closed()).toBe(1)
  })
})

describe('blobToBase64', () => {
  it('data: 머리말 없이 base64 글자만 돌려준다', async () => {
    expect(await blobToBase64(new Blob(['hello'], { type: 'image/jpeg' }))).toBe('aGVsbG8=')
  })

  it('바이트 그대로 인코딩한다', async () => {
    expect(await blobToBase64(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]))).toBe('/9j/4A==')
  })

  it('빈 Blob은 빈 글자를 돌려준다', async () => {
    expect(await blobToBase64(new Blob([]))).toBe('')
  })
})
