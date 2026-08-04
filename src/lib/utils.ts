import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
  })
}

export function formatDateShort(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
  })
}

export const EASTERN_TZ = 'America/New_York'

// Hour (Eastern) at which an event that starts today flips to LIVE.
export const LIVE_START_HOUR = 8

// "Now" in Eastern time. Servers run in UTC, so `new Date().toISOString()` rolls
// over to tomorrow at 8pm ET — which used to knock same-day events out of the
// live list mid-event. All event date math should go through this.
export function easternNow(now: Date = new Date()): { dateStr: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
  }
}
