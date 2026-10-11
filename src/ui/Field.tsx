import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

// 모든 입력에는 레이블이 있고, 안내문과 오류문은 aria-describedby로 연결된다. (PRD F06)
// 호출자가 id나 aria-describedby를 주면 덮어쓰지 않고 함께 쓴다.
type FieldProps = {
  label: string
  hint?: string
  error?: string
}

type Linked = {
  id: string
  hintId?: string
  errorId?: string
  describedBy?: string
}

function useLinkedIds(givenId: string | undefined, givenDescribedBy: string | undefined, hint?: string, error?: string): Linked {
  const generated = useId()
  const id = givenId ?? generated
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [givenDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined
  return { id, hintId, errorId, describedBy }
}

type ShellProps = FieldProps & Linked & { children: ReactNode }

function FieldShell({ id, label, hint, hintId, error, errorId, children }: ShellProps) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function TextField({
  label,
  hint,
  error,
  id,
  'aria-describedby': describedBy,
  ...rest
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const linked = useLinkedIds(id, describedBy, hint, error)
  return (
    <FieldShell label={label} hint={hint} error={error} {...linked}>
      <input
        {...rest}
        id={linked.id}
        className="input"
        aria-describedby={linked.describedBy}
        aria-invalid={error ? true : undefined}
      />
    </FieldShell>
  )
}

export function TextAreaField({
  label,
  hint,
  error,
  id,
  'aria-describedby': describedBy,
  ...rest
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const linked = useLinkedIds(id, describedBy, hint, error)
  return (
    <FieldShell label={label} hint={hint} error={error} {...linked}>
      <textarea
        {...rest}
        id={linked.id}
        className="input"
        aria-describedby={linked.describedBy}
        aria-invalid={error ? true : undefined}
      />
    </FieldShell>
  )
}

export function SelectField({
  label,
  hint,
  error,
  id,
  'aria-describedby': describedBy,
  children,
  ...rest
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const linked = useLinkedIds(id, describedBy, hint, error)
  return (
    <FieldShell label={label} hint={hint} error={error} {...linked}>
      <select
        {...rest}
        id={linked.id}
        className="select"
        aria-describedby={linked.describedBy}
        aria-invalid={error ? true : undefined}
      >
        {children}
      </select>
    </FieldShell>
  )
}
