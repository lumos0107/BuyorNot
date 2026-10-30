// AI 기능 테스트가 함께 쓰는 가짜 전역. 가짜 전역은 이 파일에만 둔다.
// 쓰는 테스트는 afterEach에서 vi.unstubAllGlobals()·vi.unstubAllEnvs()·vi.useRealTimers()로 되돌린다.
// (canvas의 getContext·toBlob은 전역이 아니라 prototype이라 mockImagePipeline이 테스트가 끝날 때 스스로 되돌린다.)
import { onTestFinished, vi } from 'vitest'

export type DrawCall = {
  image: unknown
  // drawImage에 넘긴 인자(그리는 원본을 뺀 나머지)
  args: number[]
  // 그리는 순간 canvas의 크기
  canvasWidth: number
  canvasHeight: number
}

export type ImagePipelineOptions = {
  decode: 'ok' | 'fail'
  toBlob: 'ok' | 'null'
  // 가짜 비트맵의 크기(기본 4032×3024, 폰 사진 크기)
  width?: number
  height?: number
}

// createImageBitmap과 canvas(getContext('2d')·drawImage·toBlob)를 가짜로 바꾼다.
// decode 'fail'이면 createImageBitmap이 거절하고, toBlob 'null'이면 toBlob이 null을 준다.
export function mockImagePipeline(opts: ImagePipelineOptions) {
  const { decode, toBlob, width = 4032, height = 3024 } = opts
  let closeCount = 0
  const decodeCalls: { file: unknown; options: unknown }[] = []
  const draws: DrawCall[] = []
  const toBlobCalls: { type: string | undefined; quality: number | undefined }[] = []

  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async (file: unknown, options?: unknown) => {
      decodeCalls.push({ file, options })
      if (decode === 'fail') throw new DOMException('The source image could not be decoded.', 'InvalidStateError')
      return {
        width,
        height,
        close: () => {
          closeCount += 1
        },
      }
    }),
  )

  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(function (this: HTMLCanvasElement, contextId: string) {
      if (contextId !== '2d') return null
      return {
        // 화살표 함수라 this는 getContext를 부른 canvas다
        drawImage: (image: unknown, ...args: number[]) => {
          draws.push({ image, args, canvasWidth: this.width, canvasHeight: this.height })
        },
      }
    } as never)

  const toBlobSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation(function (callback: BlobCallback, type?: string, quality?: number) {
      toBlobCalls.push({ type, quality })
      const blob = toBlob === 'ok' ? new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: type ?? 'image/png' }) : null
      // 실제 toBlob처럼 나중에 콜백을 부른다
      void Promise.resolve().then(() => callback(blob))
    } as never)

  onTestFinished(() => {
    getContext.mockRestore()
    toBlobSpy.mockRestore()
  })

  return {
    // 비트맵을 close()한 횟수
    closed: () => closeCount,
    decodeCalls,
    draws,
    toBlobCalls,
  }
}

// URL.createObjectURL·revokeObjectURL을 가짜로 바꾼다. 호출마다 다른 주소를 주고 만든 것과 해제한 것을 기록한다.
// URL 자체는 하위 클래스로 바꿔서 new URL(...)은 그대로 쓸 수 있다.
export function mockObjectUrls() {
  const created: string[] = []
  const revoked: string[] = []

  class FakeURL extends URL {
    static createObjectURL(_object: Blob | MediaSource): string {
      const url = `blob:http://localhost/mock-${created.length + 1}`
      created.push(url)
      return url
    }
    static revokeObjectURL(url: string): void {
      revoked.push(url)
    }
  }
  vi.stubGlobal('URL', FakeURL)

  return { created, revoked }
}

// Task 12(말로 담기)에서 채운다. 지금은 두지 않는다.
// - FakeMediaRecorder: start·stop·ondataavailable·onstop과 isTypeSupported, 트랙 끊김을 흉내
// - mockMicrophone(): navigator.mediaDevices.getUserMedia를 허용·거부·대기로 바꾸고 트랙 stop 횟수를 기록
