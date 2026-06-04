import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('events')
    .select('id, title, start_date, status')
    .order('start_date', { ascending: false })
    .limit(500)
  return NextResponse.json(data ?? [])
}
