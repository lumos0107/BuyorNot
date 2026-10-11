import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SelectField, TextAreaField, TextField } from './Field'

// GPT 1단계 검토 반영: 호출자가 준 id·aria-describedby가 레이블·안내문 연결을 끊지 않아야 한다 (PRD F06)
describe('입력 컴포넌트', () => {
  it('레이블·안내문·오류문이 입력에 연결된다', () => {
    render(<TextField label="가격" hint="원 단위" error="숫자를 입력해 주세요" />)
    const input = screen.getByLabelText('가격')
    expect(input).toHaveAccessibleDescription('원 단위 숫자를 입력해 주세요')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('호출자가 준 id를 레이블과 입력에 함께 쓴다', () => {
    render(<TextField label="가격" id="price-a" />)
    expect(screen.getByLabelText('가격')).toHaveAttribute('id', 'price-a')
  })

  it('호출자의 aria-describedby를 안내문 id와 합친다', () => {
    render(
      <>
        <p id="outside">바깥 설명</p>
        <TextField label="가격" hint="원 단위" aria-describedby="outside" />
      </>,
    )
    expect(screen.getByLabelText('가격')).toHaveAccessibleDescription('바깥 설명 원 단위')
  })

  it('textarea와 select도 같은 규칙을 따른다', () => {
    render(
      <>
        <TextAreaField label="이유" id="reason" hint="한 줄이면 충분해요" />
        <SelectField label="단위" id="unit" error="단위를 골라 주세요">
          <option value="g">g</option>
        </SelectField>
      </>,
    )
    expect(screen.getByLabelText('이유')).toHaveAttribute('id', 'reason')
    expect(screen.getByLabelText('이유')).toHaveAccessibleDescription('한 줄이면 충분해요')
    expect(screen.getByLabelText('단위')).toHaveAttribute('id', 'unit')
    expect(screen.getByLabelText('단위')).toHaveAccessibleDescription('단위를 골라 주세요')
  })
})
