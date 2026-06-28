import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { title, start_date, end_date, event_source, status } = await req.json()
  if (!title || !start_date || !event_source) {
    return NextResponse.json({ error: 'title, start_date, and event_source are required' }, { status: 400 })
  }
  const supabase = await createServiceClient()
  const { data, error } = await supabase.from('events').insert({
    title,
    start_date,
    end_date: end_date || null,
    event_source,
    status: status ?? 'upcoming',
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/')
  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, start_date, end_date } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createServiceClient()
  const update: Record<string, string | null> = { updated_at: new Date().toISOString() }
  if (start_date !== undefined) update.start_date = start_date || null
  if (end_date !== undefined) update.end_date = end_date || null

  const { error } = await supabase.from('events').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
