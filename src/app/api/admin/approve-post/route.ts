import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

function checkAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.ADMIN_SECRET}`
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, approved } = await req.json()
  const supabase = await createServiceClient()
  const { error } = await supabase.from('posts').update({ approved }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
