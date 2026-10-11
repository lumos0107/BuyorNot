import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 글꼴은 외부 CDN 대신 앱과 함께 배포한다(보안 점검: 외부 CSS 변조 위험과 방문자 IP 전달을 없앰). 쓰는 글자 조각만 내려받는다
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
