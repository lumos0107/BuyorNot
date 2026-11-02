import { fireEvent, render, screen } from '@testing-library/react'
import App from '../App'

export function renderWishlistApp() {
  const result = render(<App />)
  fireEvent.click(screen.getByRole('tab', { name: '물건' }))
  return result
}
