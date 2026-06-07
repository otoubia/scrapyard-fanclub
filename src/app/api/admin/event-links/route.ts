import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const BRETTZONE = 'https://brettzone.nhrl.io/brettZone/backend'
const NHRL_YOUTUBE = 'https://www.youtube.com/@NHRLrobot/live'
const NHRL_SITE = 'https://nhrl.io'

function checkAuth(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.ADMIN_SECRET}`
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function linksForEvent(event: any): Array<{ url: string; label: string; link_type: string; source: string }> {
  const links = []
  if (event.external_id) {
    const rceMatch = event.external_id.match(/rce-event:(\d+)/)
    if (rceMatch) {
      links.push({ url: `https://www.robotcombatevents.com/events/${rceMatch[1]}`, label: 'RCE Event Page', link_type: 'other', source: 'rce' })
    }
    const nhrlMatch = event.external_id.match(/^nhrl:(.+)$/)
    if (nhrlMatch) {
      const tid = nhrlMatch[1]
      links.push({ url: `https://brettzone.nhrl.io/brettZone/bracketView.php?tournamentID=${tid}`, label: 'BrettZone Bracket', link_type: 'bracket', source: 'brettzone' })
      links.push({ url: NHRL_SITE, label: 'NHRL Website', link_type: 'other', source: 'nhrl' })
      // Stream link omitted here — only added when BrettZone confirms live activity today
    }
  }
  if (event.truefinals_url) {
    links.push({ url: event.truefinals_url, label: 'TrueFinals Bracket', link_type: 'bracket', source: 'truefinals' })
  }
  if (event.livestream_url && event.livestream_url !== NHRL_YOUTUBE) {
    links.push({ url: event.livestream_url, label: 'Live Stream', link_type: 'stream', source: 'manual' })
  }
  return links
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const { searchParams } = new URL(req.url)
  const check = searchParams.get('check')
  const eventId = searchParams.get('event_id')
  const today = searchParams.get('today')
  const all = searchParams.get('all')

  if (check === '1') {
    const day = todayStr()
    const { data: todayEvents } = await supabase
      .from('events')
      .select('id, title, external_id, truefinals_url, livestream_url, start_date')
      .gte('start_date', `${day}T00:00:00Z`)
      .lte('start_date', `${day}T23:59:59Z`)

    // Find NHRL tournaments with fights from TODAY (not just last 24h, which bleeds into the next day)
    let liveTournamentIds: string[] = []
    let streamIsLive = false
    try {
      const r = await fetch(`${BRETTZONE}/fightsLast24Hours.php`, { next: { revalidate: 0 } })
      if (r.ok) {
        const d = await r.json()
        const todayFights = (d.fights ?? []).filter((f: any) => {
          // startTime format from BrettZone is typically "YYYY-MM-DD HH:MM:SS"
          return f.startTime?.slice(0, 10) === day
        })
        liveTournamentIds = [...new Set<string>(todayFights.map((f: any) => f.tournamentID as string))]
        streamIsLive = liveTournamentIds.length > 0
      }
    } catch {}

    const candidates: Array<{ event_id: string; event_title: string; url: string; label: string; link_type: string; source: string }> = []

    for (const event of todayEvents ?? []) {
      for (const link of linksForEvent(event)) {
        candidates.push({ event_id: event.id, event_title: event.title, ...link })
      }
    }

    // Add links for live tournaments found via BrettZone that aren't already covered above
    const knownExternalIds = new Set((todayEvents ?? []).map(e => e.external_id))
    for (const tid of liveTournamentIds) {
      const externalId = `nhrl:${tid}`
      const { data: dbEvent } = await supabase.from('events').select('id, title, external_id, truefinals_url, livestream_url').eq('external_id', externalId).single()
      if (!dbEvent) continue
      if (!knownExternalIds.has(externalId)) {
        // This event wasn't in today's date range but IS live — add all its links
        for (const link of linksForEvent(dbEvent)) {
          candidates.push({ event_id: dbEvent.id, event_title: dbEvent.title, ...link })
        }
      }
      // Stream link only when BrettZone confirms fights are happening today
      if (streamIsLive) {
        candidates.push({ event_id: dbEvent.id, event_title: dbEvent.title, url: NHRL_YOUTUBE, label: 'NHRL Live Stream', link_type: 'stream', source: 'nhrl' })
      }
    }

    return NextResponse.json({ candidates, liveTournamentIds, todayEvents: todayEvents ?? [] })
  }

  if (eventId) {
    const { data } = await supabase.from('event_links').select('*').eq('event_id', eventId).order('created_at')
    return NextResponse.json(data ?? [])
  }

  if (today === '1') {
    const day = todayStr()
    const { data: todayEvents } = await supabase
      .from('events').select('id')
      .gte('start_date', `${day}T00:00:00Z`)
      .lte('start_date', `${day}T23:59:59Z`)
    const ids = (todayEvents ?? []).map(e => e.id)
    if (!ids.length) return NextResponse.json([])
    const { data } = await supabase
      .from('event_links')
      .select('*, event:events(id, title, start_date)')
      .in('event_id', ids)
      .order('created_at')
    return NextResponse.json(data ?? [])
  }

  if (all === '1') {
    const { data } = await supabase
      .from('event_links')
      .select('*, event:events(id, title, start_date)')
      .order('created_at', { ascending: false })
    return NextResponse.json(data ?? [])
  }

  return NextResponse.json({ error: 'Specify event_id, check=1, today=1, or all=1' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const body = await req.json()

  if (body.action === 'save-bulk') {
    const links: Array<{ event_id: string; url: string; label: string; link_type: string; source: string }> = body.links ?? []
    if (!links.length) return NextResponse.json({ error: 'No links' }, { status: 400 })
    const { error } = await supabase.from('event_links').insert(links)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, count: links.length })
  }

  const { event_id, url, label, link_type, source } = body
  if (!event_id || !url || !label) return NextResponse.json({ error: 'Missing event_id, url, or label' }, { status: 400 })
  const { data, error } = await supabase.from('event_links').insert({
    event_id, url, label, link_type: link_type ?? 'other', source: source ?? 'manual',
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()
  const { id } = await req.json()
  await supabase.from('event_links').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
