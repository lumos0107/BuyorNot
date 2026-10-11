import type { ComponentProps } from 'react'

type ButtonProps = ComponentProps<'button'> & {
  variant?: 'default' | 'primary' | 'danger'
  block?: boolean
}

// 기본 button 요소라 Enter·Space 키로 누를 수 있고 포커스 표시가 보인다. (PRD F06)
// React 19에서는 ref도 일반 prop으로 넘어와 포커스를 되돌릴 때 쓴다.
export function Button({ variant = 'default', block, className, type = 'button', ...rest }: ButtonProps) {
  const classes = [
    'btn',
    variant === 'primary' ? 'btn-primary' : '',
    variant === 'danger' ? 'btn-danger' : '',
    block ? 'btn-block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
  return <button type={type} className={classes} {...rest} />
}
