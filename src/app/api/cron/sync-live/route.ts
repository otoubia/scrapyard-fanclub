import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

function checkCron(req: NextRequest) {
  return req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

async function fetchTrueFinalsData(eventSlug: string) {
  try {
    const res = await fetch(`https://truefinals.com/api/tournament/${eventSlug}`, { next: { revalidate: 0 } })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  if (!checkCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const { data: liveEvents } = await supabase
    .from('events')
    .select('*')
    .eq('status', 'current')

  if (!liveEvents?.length) {
    return NextResponse.json({ message: 'No live events', updated: 0 })
  }

  let updated = 0
  for (const event of liveEvents) {
    if (event.truefinals_url) {
      const slug = event.truefinals_url.split('/').pop()
      const data = await fetchTrueFinalsData(slug)
      if (data) {
        await supabase.from('events').update({
          results: data,
          updated_at: new Date().toISOString(),
        }).eq('id', event.id)
        updated++
      }
    }
  }

  return NextResponse.json({ updated, events: liveEvents.length })
}
