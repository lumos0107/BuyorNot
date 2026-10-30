import { describe, expect, it } from 'vitest'
import { aiFailureMessage, PHOTO_DECODE_FAILED, PHOTO_NOTICE, VOICE_NOTICE } from './messages'

// 기대 문장은 PRD 10장 "앱 공통"의 따옴표 안 문장을 그대로 옮긴 것이다.
describe('AI 공통 문구', () => {
  it('사진 안내 한 줄이 PRD 문장 그대로다', () => {
    expect(PHOTO_NOTICE).toBe(
      '사진은 읽기 위해 Google Gemini로 보내져요. 무료 서비스라 구글이 서비스 개선에 쓸 수 있으니 얼굴이나 개인정보가 담기지 않게 해 주세요.',
    )
  })

  it('녹음 안내 한 줄이 PRD 문장 그대로다', () => {
    expect(VOICE_NOTICE).toBe(
      '녹음은 받아쓰기 위해 Google Gemini로 보내져요. 무료 서비스라 구글이 서비스 개선에 쓸 수 있으니 개인정보는 말하지 말아 주세요.',
    )
  })

  it('열 수 없는 사진 문구가 PRD 문장 그대로다', () => {
    expect(PHOTO_DECODE_FAILED).toBe('이 사진을 열 수 없어요. 다른 사진을 고르거나 직접 입력해 주세요.')
  })

  it('실패 종류마다 PRD 실패 문구를 돌려준다', () => {
    expect(aiFailureMessage('rate_limited')).toBe('지금은 사용이 많아요. 잠시 뒤 다시 해 주세요.')
    expect(aiFailureMessage('disabled')).toBe('AI 기능을 잠시 멈췄어요. 직접 입력해 주세요.')
    expect(aiFailureMessage('failed')).toBe('지금은 읽지 못했어요. 직접 입력해 주세요.')
  })

  it('AC76: Gemini 제한 문구가 PRD 문장 그대로다', () => {
    expect(aiFailureMessage('upstream_limited')).toBe('AI 사용이 제한됐어요. 나중에 다시 시도하거나 직접 입력해 주세요.')
  })
})
