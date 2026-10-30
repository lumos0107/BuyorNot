// 사진 줄이기: 방향을 바로잡고 비율을 유지해 긴 변 max(기본 1600px)에 맞추고 JPEG로 다시 그린다.
// 캔버스로 다시 그리므로 EXIF(위치 정보 등)가 빠진다.

// 긴 변이 max를 넘을 때만 비율을 유지해 줄인다. 키우지는 않는다.
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max) return { width, height }
  const scale = max / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

// 브라우저가 사진을 열지 못하거나 JPEG로 만들지 못하면 거절한다(서버로 보내지 않는다).
export async function shrinkImage(file: Blob, max = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('canvas 2d context unavailable')
    // JPEG에는 투명이 없어 투명 PNG의 빈 곳이 검게 되므로 먼저 흰색으로 채운다
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob === null ? reject(new Error('canvas.toBlob returned null')) : resolve(blob)),
        'image/jpeg',
        quality,
      )
    })
  } finally {
    bitmap.close()
  }
}

// 서버로 보낼 글자. data: 머리말 없이 base64 본문만 돌려준다.
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.onload = () => {
      const dataUrl = String(reader.result)
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}
