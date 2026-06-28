import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

function checkAuth(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.ADMIN_SECRET}`
}

// GET: return upcoming events with their registered bots, or a single event's registrations
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()
  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('event_id')

  if (eventId) {
    const [robotsRes, resultsRes] = await Promise.all([
      supabase.from('robots').select('id, name, slug').eq('active', true).order('name'),
      supabase.from('robot_results')
        .select('id, robot_id, wins, losses, placement')
        .eq('event_id', eventId),
    ])
    return NextResponse.json({
      robots: robotsRes.data ?? [],
      registrations: (resultsRes.data ?? []).map(r => ({
        resultId: r.id,
        robotId: r.robot_id,
        wins: r.wins,
        losses: r.losses,
        placement: r.placement,
      })),
    })
  }

  const [eventsRes, robotsRes, resultsRes] = await Promise.all([
    supabase.from('events').select('id, title, start_date, status, event_source')
      .in('status', ['upcoming', 'current']).order('start_date', { ascending: true }),
    supabase.from('robots').select('id, name, slug').eq('active', true).order('name'),
    supabase.from('robot_results').select('id, robot_id, event_id, wins, losses')
      .is('placement', null),
  ])

  const events = eventsRes.data ?? []
  const robots = robotsRes.data ?? []
  const results = resultsRes.data ?? []

  // Sort: live (current) events first, then upcoming by date
  events.sort((a, b) => {
    if (a.status === 'current' && b.status !== 'current') return -1
    if (b.status === 'current' && a.status !== 'current') return 1
    return (a.start_date ?? '').localeCompare(b.start_date ?? '')
  })

  const registrations: Record<string, { resultId: string, robotId: string, wins: number, losses: number }[]> = {}
  for (const r of results) {
    if (!registrations[r.event_id]) registrations[r.event_id] = []
    registrations[r.event_id].push({ resultId: r.id, robotId: r.robot_id, wins: r.wins ?? 0, losses: r.losses ?? 0 })
  }

  return NextResponse.json({ events, robots, registrations })
}

// POST: add or remove a bot from an upcoming event
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { action, robotId, eventId } = await req.json()
  const supabase = await createServiceClient()

  if (action === 'add') {
    const { error } = await supabase.from('robot_results').insert({
      robot_id: robotId, event_id: eventId,
      wins: 0, losses: 0, placement: null, is_highlight: false, notes: 'manual registration',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (action === 'remove') {
    const { error } = await supabase.from('robot_results')
      .delete()
      .eq('robot_id', robotId)
      .eq('event_id', eventId)
      .is('placement', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidatePath('/')
  return NextResponse.json({ ok: true })
}
