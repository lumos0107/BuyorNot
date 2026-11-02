import { fireEvent, render, screen } from '@testing-library/react'
import App from '../App'

export function renderWishlistApp() {
  const result = render(<App />)
  fireEvent.click(screen.getByRole('tab', { name: '물건' }))
  return result
}

// 집에 있는 것·장보기 초안은 2026-11-03 F86부터 장보기 메뉴에 있다
export function renderShoppingApp() {
  const result = render(<App />)
  fireEvent.click(screen.getByRole('tab', { name: '장보기' }))
  return result
}
