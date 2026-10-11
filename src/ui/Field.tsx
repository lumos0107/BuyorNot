import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

// 모든 입력에는 레이블이 있고, 안내문과 오류문은 aria-describedby로 연결된다. (PRD F06)
type FieldProps = {
  label: string
  hint?: string
  error?: string
}

function useFieldIds(hint?: string, error?: string) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return { id, hintId, errorId, describedBy }
}

type ShellProps = FieldProps & {
  id: string
  hintId?: string
  errorId?: string
  children: ReactNode
}

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
  ...rest
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const ids = useFieldIds(hint, error)
  return (
    <FieldShell id={ids.id} label={label} hint={hint} hintId={ids.hintId} error={error} errorId={ids.errorId}>
      <input
        id={ids.id}
        className="input"
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </FieldShell>
  )
}

export function TextAreaField({
  label,
  hint,
  error,
  ...rest
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ids = useFieldIds(hint, error)
  return (
    <FieldShell id={ids.id} label={label} hint={hint} hintId={ids.hintId} error={error} errorId={ids.errorId}>
      <textarea
        id={ids.id}
        className="input"
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </FieldShell>
  )
}

export function SelectField({
  label,
  hint,
  error,
  children,
  ...rest
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const ids = useFieldIds(hint, error)
  return (
    <FieldShell id={ids.id} label={label} hint={hint} hintId={ids.hintId} error={error} errorId={ids.errorId}>
      <select
        id={ids.id}
        className="select"
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  )
}
