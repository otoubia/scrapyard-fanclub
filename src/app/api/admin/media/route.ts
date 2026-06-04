import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

function checkAuth(req: NextRequest) {
  return req.headers.get('authorization') === `Bearer ${process.env.ADMIN_SECRET}`
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()
  const { data: pending } = await supabase
    .from('media')
    .select('*, event:events(id,title), media_robot_tags(robot:robots(id,name,slug))')
    .eq('approved', false)
    .order('created_at', { ascending: false })
  const { data: approved } = await supabase
    .from('media')
    .select('*, event:events(id,title), media_robot_tags(robot:robots(id,name,slug))')
    .eq('approved', true)
    .order('created_at', { ascending: false })
    .limit(20)
  return NextResponse.json({ pending: pending ?? [], approved: approved ?? [] })
}

// Approve or update a media item
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, approved, title, caption, robot_ids, event_id } = await req.json()
  const supabase = await createServiceClient()

  const updates: Record<string, unknown> = { approved }
  if (title !== undefined) updates.title = title || null
  if (caption !== undefined) updates.caption = caption || null
  if (event_id !== undefined) updates.event_id = event_id || null
  await supabase.from('media').update(updates).eq('id', id)

  // Update robot tags if provided
  if (robot_ids !== undefined) {
    await supabase.from('media_robot_tags').delete().eq('media_id', id)
    if (robot_ids.length > 0) {
      await supabase.from('media_robot_tags').insert(
        robot_ids.map((rid: string) => ({ media_id: id, robot_id: rid }))
      )
    }
  }

  revalidatePath('/')
  return NextResponse.json({ ok: true })
}

// Delete a media item
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  const supabase = await createServiceClient()
  await supabase.from('media').delete().eq('id', id)
  revalidatePath('/')
  return NextResponse.json({ ok: true })
}
