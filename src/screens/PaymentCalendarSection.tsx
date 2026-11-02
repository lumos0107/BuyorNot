import { useRef } from 'react'
import { paymentOccurrences, paymentTotal } from '../logic/paymentCalendar'
import { formatWon } from '../logic/number'
import { toDayIso, type Subscription } from '../logic/subscriptions'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const
const dateLabel = (iso: string) => {
  const [, month, day] = iso.split('-')
  return `${Number(month)}월 ${Number(day)}일`
}

export function PaymentCalendarSection({ subscriptions, today }: { subscriptions: readonly Subscription[]; today: Date }) {
  const rows = paymentOccurrences(subscriptions, today)
  const grouped = new Map<string, typeof rows>()
  for (const row of rows) grouped.set(row.day, [...(grouped.get(row.day) ?? []), row])
  const days = Array.from({ length: 30 }, (_, offset) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 12))
  const firstWeekday = days[0].getDay()
  const rootRef = useRef<HTMLDetailsElement>(null)

  return <details className="card guide payment-calendar" role="region" aria-label="앞으로 30일 결제 달력" ref={rootRef} open>
    <summary className="card-title">
      <span className="payment-calendar-summary">
        <span>앞으로 30일 결제 달력</span>
        <span className="note">{`결제 예정 ${rows.length}건 · 적어 둔 요금 합계 ${formatWon(paymentTotal(rows))}`}</span>
      </span>
    </summary>
    <div className="stack payment-calendar-body">
      <p className="note">실제 청구일과 금액은 서비스에서 확인해 주세요.</p>
      {rows.length === 0 ? <p className="note">앞으로 30일에 적어 둔 결제 예정이 없어요.</p> : <>
        <div className="payment-calendar-grid" role="group" aria-label="30일 날짜">
          {WEEKDAYS.map((weekday) => <span className="payment-calendar-weekday" key={weekday}>{weekday}</span>)}
          {Array.from({ length: firstWeekday }, (_, index) => <span className="payment-calendar-blank" key={`blank-${index}`} />)}
          {days.map((date, index) => {
            const iso = toDayIso(date)
            const count = grouped.get(iso)?.length ?? 0
            const content = <><span className="payment-calendar-month">{index === 0 || date.getDate() === 1 ? `${date.getMonth() + 1}월` : ''}</span><span>{date.getDate()}</span>{count > 0 ? <span className="payment-calendar-dot" aria-hidden="true" /> : null}</>
            return count > 0
              ? <button className="payment-calendar-day payment-calendar-has-event" type="button" key={iso} aria-label={`${iso} 결제 예정 ${count}건`} onClick={() => document.getElementById(`payment-day-${iso}`)?.focus()}>{content}</button>
              : <span className="payment-calendar-day" key={iso}>{content}</span>
          })}
        </div>
        {[...grouped.entries()].map(([day, entries]) => <section className="payment-calendar-list-day" role="region" aria-label={`${day} 결제 예정`} tabIndex={-1} id={`payment-day-${day}`} key={day}>
          {entries.map((entry) => <p key={entry.subscriptionId}>{`${dateLabel(day)} · ${entry.name} · ${formatWon(entry.priceKrw)}`}</p>)}
        </section>)}
      </>}
    </div>
  </details>
}
