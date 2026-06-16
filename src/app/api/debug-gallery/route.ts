import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('media')
    .select('id, type, title, media_robot_tags(robot:robots(id,name,slug))')
    .eq('approved', true)
    .limit(10)

  const { count } = await supabase
    .from('media_robot_tags')
    .select('*', { count: 'exact', head: true })

  return NextResponse.json({ error, count, sample: data })
}
