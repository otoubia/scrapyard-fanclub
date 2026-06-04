import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

function checkAuth(req: NextRequest) {
  return req.headers.get('authorization') === `Bearer ${process.env.ADMIN_SECRET}`
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('media')
    .select('*, event:events(id,title), media_robot_tags(robot:robots(id,name,slug))')
    .eq('approved', false)
    .order('created_at', { ascending: false })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, approved } = await req.json()
  const supabase = await createServiceClient()
  await supabase.from('media').update({ approved }).eq('id', id)
  revalidatePath('/')
  return NextResponse.json({ ok: true })
}
