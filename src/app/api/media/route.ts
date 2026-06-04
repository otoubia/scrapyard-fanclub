import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, url, title, caption, author_name, author_email, event_id, robot_ids } = body

    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    if (!author_name) return NextResponse.json({ error: 'Author name is required' }, { status: 400 })
    if (!robot_ids?.length) return NextResponse.json({ error: 'At least one bot must be tagged' }, { status: 400 })

    const supabase = await createServiceClient()

    // Insert media record
    const { data: media, error } = await supabase
      .from('media')
      .insert({
        type: type ?? 'photo',
        url,
        title: title || null,
        caption: caption || null,
        author_name,
        author_email: author_email || null,
        event_id: event_id || null,
        is_highlight: false,
        approved: false,
      })
      .select('id')
      .single()

    if (error || !media) {
      return NextResponse.json({ error: error?.message ?? 'Failed to save media' }, { status: 500 })
    }

    // Insert robot tags
    if (robot_ids.length > 0) {
      await supabase.from('media_robot_tags').insert(
        robot_ids.map((robotId: string) => ({ media_id: media.id, robot_id: robotId }))
      )
    }

    return NextResponse.json({ ok: true, id: media.id })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
