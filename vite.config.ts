import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// GitHub Pages가 https://lumos0107.github.io/BuyorNot/ 에서 서비스하므로
// 빌드 결과의 모든 경로 앞에 저장소 이름을 붙인다. (PRD #8)
export default defineConfig({
  base: '/BuyorNot/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
