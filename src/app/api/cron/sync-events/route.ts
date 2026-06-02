import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

function checkCron(req: NextRequest) {
  const secret = req.headers.get('authorization')
  return secret === `Bearer ${process.env.CRON_SECRET}`
}

async function fetchRCEEvents() {
  try {
    const res = await fetch('https://www.robotcombatevents.com/events.json', { next: { revalidate: 0 } })
    if (!res.ok) return []
    const data = await res.json()
    return (Array.isArray(data) ? data : data.events ?? []).map((e: any) => ({
      title: e.name ?? e.title,
      event_source: 'rce',
      external_id: String(e.id ?? e.event_id ?? ''),
      start_date: e.start_date ?? e.date,
      end_date: e.end_date,
      location: e.location ?? e.venue,
      description: e.description,
      status: deriveStatus(e.start_date ?? e.date, e.end_date),
    }))
  } catch {
    return []
  }
}

async function fetchNHRLEvents() {
  try {
    const res = await fetch('https://brettzone.nhrl.io/brettZone/api/events', { next: { revalidate: 0 } })
    if (!res.ok) return []
    const data = await res.json()
    return (Array.isArray(data) ? data : data.events ?? []).map((e: any) => ({
      title: e.name ?? e.title,
      event_source: 'nhrl',
      external_id: String(e.id ?? ''),
      start_date: e.start_date ?? e.date,
      end_date: e.end_date,
      location: e.location ?? 'NHRL',
      description: e.description,
      status: deriveStatus(e.start_date ?? e.date, e.end_date),
      truefinals_url: e.truefinals_url,
    }))
  } catch {
    return []
  }
}

function deriveStatus(startDate: string, endDate?: string): 'upcoming' | 'current' | 'past' {
  if (!startDate) return 'upcoming'
  const now = new Date()
  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000)
  if (now < start) return 'upcoming'
  if (now > end) return 'past'
  return 'current'
}

export async function GET(req: NextRequest) {
  if (!checkCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [rceEvents, nhrlEvents] = await Promise.all([fetchRCEEvents(), fetchNHRLEvents()])
  const allEvents = [...rceEvents, ...nhrlEvents].filter(e => e.title && e.start_date)

  if (allEvents.length === 0) {
    return NextResponse.json({ synced: 0, message: 'No events fetched from external sources' })
  }

  const supabase = await createServiceClient()
  let synced = 0

  for (const event of allEvents) {
    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .eq('external_id', event.external_id)
      .eq('event_source', event.event_source)
      .single()

    if (existing) {
      await supabase.from('events').update({ status: event.status, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('events').insert({ ...event, updated_at: new Date().toISOString() })
      synced++
    }
  }

  // Update status for all events based on current time
  const { data: allDbEvents } = await supabase.from('events').select('id, start_date, end_date')
  for (const e of allDbEvents ?? []) {
    const newStatus = deriveStatus(e.start_date, e.end_date)
    await supabase.from('events').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', e.id)
  }

  return NextResponse.json({ synced, total: allEvents.length })
}
