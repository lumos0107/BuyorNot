// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { matchesMime } from '../src/magic.ts'

// 앞부분 바이트에 0을 덧붙여 base64로 만든다 (실제 파일처럼 16바이트보다 길게)
function b64(head: number[], total = 32): string {
  const bytes = new Uint8Array(total)
  bytes.set(head)
  return btoa(String.fromCharCode(...bytes))
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

describe('파일 머리(매직 바이트) 검사', () => {
  // plan: accepts the matching head for every format
  it('형식마다 맞는 파일 머리면 통과해요', () => {
    const cases: [string, number[]][] = [
      ['image/jpeg', [0xff, 0xd8, 0xff, 0xe0]],
      ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
      ['image/webp', [...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP')]],
      ['audio/webm', [0x1a, 0x45, 0xdf, 0xa3]],
      ['audio/mp4', [0, 0, 0, 0x20, ...ascii('ftyp')]],
      ['audio/m4a', [0, 0, 0, 0x20, ...ascii('ftyp')]],
      ['audio/ogg', ascii('OggS')],
      ['audio/wav', [...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')]],
      ['audio/mpeg', ascii('ID3')],
      ['audio/mpeg', [0xff, 0xfb, 0x90]],
      ['audio/aac', [0xff, 0xf1, 0x50]],
    ]
    for (const [mime, head] of cases) {
      expect(matchesMime(b64(head), mime), mime).toBe(true)
    }
  })

  it('jpeg라고 했는데 PNG 머리면 거절해요', () => {
    const png = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(matchesMime(png, 'image/jpeg')).toBe(false)
    expect(matchesMime(b64([0xff, 0xd8, 0xff]), 'image/png')).toBe(false)
  })

  it('RIFF만 같고 8번째부터 이름이 다르면 거절해요', () => {
    const wav = b64([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')])
    expect(matchesMime(wav, 'image/webp')).toBe(false)
    const webp = b64([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP')])
    expect(matchesMime(webp, 'audio/wav')).toBe(false)
  })

  it('mpeg와 aac는 둘째 바이트 상위 비트까지 맞아야 해요', () => {
    expect(matchesMime(b64([0xff, 0xe0]), 'audio/mpeg')).toBe(true)
    expect(matchesMime(b64([0xff, 0xc0]), 'audio/mpeg')).toBe(false)
    expect(matchesMime(b64([0xff, 0xf0]), 'audio/aac')).toBe(true)
    expect(matchesMime(b64([0xff, 0xe0]), 'audio/aac')).toBe(false)
    expect(matchesMime(b64([0x00, 0xfb]), 'audio/mpeg')).toBe(false)
  })

  it('빈 문자열, base64가 아닌 글, 모르는 형식은 거절해요', () => {
    expect(matchesMime('', 'image/jpeg')).toBe(false)
    expect(matchesMime('이건 base64가 아니에요!!', 'image/jpeg')).toBe(false)
    expect(matchesMime(b64([0xff, 0xd8, 0xff]), 'image/gif')).toBe(false)
  })

  it('머리 길이가 모자라면 거절해요', () => {
    expect(matchesMime(btoa('\xff\xd8'), 'image/jpeg')).toBe(false)
    expect(matchesMime(btoa('RIFF'), 'image/webp')).toBe(false)
  })
})
