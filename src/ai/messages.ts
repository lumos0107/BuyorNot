// AI 기능 공통 문구. 모두 PRD 10장 "앱 공통"의 문장 그대로다(고치려면 PRD부터).
import type { AiFailure } from './client'

// 안내 한 줄: 버튼 바로 아래, 누르기 전에 보이게 둔다.
export const PHOTO_NOTICE =
  '사진은 읽기 위해 Google Gemini로 보내져요. 무료 서비스라 구글이 서비스 개선에 쓸 수 있으니 얼굴이나 개인정보가 담기지 않게 해 주세요.'
export const VOICE_NOTICE =
  '녹음은 받아쓰기 위해 Google Gemini로 보내져요. 무료 서비스라 구글이 서비스 개선에 쓸 수 있으니 개인정보는 말하지 말아 주세요.'

// 브라우저가 열 수 없는 사진(예: 일부 HEIC)
export const PHOTO_DECODE_FAILED = '이 사진을 열 수 없어요. 다른 사진을 고르거나 직접 입력해 주세요.'

// 실패 문구. 취소는 사용자가 한 일이라 문구가 없다.
export function aiFailureMessage(error: Exclude<AiFailure, 'cancelled'>): string {
  switch (error) {
    case 'rate_limited':
      return '지금은 사용이 많아요. 잠시 뒤 다시 해 주세요.'
    case 'upstream_limited':
      return 'AI 사용이 제한됐어요. 나중에 다시 시도하거나 직접 입력해 주세요.'
    case 'disabled':
      return 'AI 기능을 잠시 멈췄어요. 직접 입력해 주세요.'
    case 'failed':
      return '지금은 읽지 못했어요. 직접 입력해 주세요.'
  }
}
