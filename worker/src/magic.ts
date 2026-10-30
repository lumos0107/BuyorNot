// 선언한 형식과 파일 머리(매직 바이트)가 맞는지 본다. 앞 16바이트만 푼다.
const HEAD_BYTES = 16
// 16바이트를 담는 base64는 24글자(패딩 포함)
const HEAD_CHARS = 24

function ascii(bytes: Uint8Array, from: number, text: string): boolean {
  if (bytes.length < from + text.length) return false
  for (let i = 0; i < text.length; i++) {
    if (bytes[from + i] !== text.charCodeAt(i)) return false
  }
  return true
}

function startsWith(bytes: Uint8Array, head: number[]): boolean {
  return bytes.length >= head.length && head.every((b, i) => bytes[i] === b)
}

function readHead(base64: string): Uint8Array | null {
  if (base64 === '') return null
  try {
    const binary = atob(base64.slice(0, HEAD_CHARS))
    const bytes = new Uint8Array(Math.min(binary.length, HEAD_BYTES))
    for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

export function matchesMime(base64: string, mime: string): boolean {
  const bytes = readHead(base64)
  if (bytes === null) return false
  switch (mime) {
    case 'image/jpeg':
      return startsWith(bytes, [0xff, 0xd8, 0xff])
    case 'image/png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/webp':
      return ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')
    case 'audio/webm':
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])
    case 'audio/mp4':
    case 'audio/m4a':
      return ascii(bytes, 4, 'ftyp')
    case 'audio/ogg':
      return ascii(bytes, 0, 'OggS')
    case 'audio/wav':
      return ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WAVE')
    case 'audio/mpeg':
      return ascii(bytes, 0, 'ID3') || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    case 'audio/aac':
      return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf0) === 0xf0
    default:
      return false
  }
}
