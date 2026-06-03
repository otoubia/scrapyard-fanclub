import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

function checkAuth(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.ADMIN_SECRET}`
}

// GET: return upcoming events with their registered bots
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()

  const [eventsRes, robotsRes, resultsRes] = await Promise.all([
    supabase.from('events').select('id, title, start_date, event_source')
      .eq('status', 'upcoming').order('start_date', { ascending: true }),
    supabase.from('robots').select('id, name, slug').eq('active', true).order('name'),
    supabase.from('robot_results').select('id, robot_id, event_id')
      .is('placement', null),
  ])

  const events = eventsRes.data ?? []
  const robots = robotsRes.data ?? []
  const results = resultsRes.data ?? []

  // Build a set of registered robot_ids per event
  const registrations: Record<string, { resultId: string, robotId: string }[]> = {}
  for (const r of results) {
    if (!registrations[r.event_id]) registrations[r.event_id] = []
    registrations[r.event_id].push({ resultId: r.id, robotId: r.robot_id })
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
