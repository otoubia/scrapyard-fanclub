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

    // Send email notification
    if (process.env.RESEND_API_KEY) {
      const bots = robot_ids?.length ? `Bots: ${robot_ids.length} tagged` : 'No bots tagged'
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Scrap Yard Fan Club <onboarding@resend.dev>',
          to: ['otoubia@yahoo.com'],
          subject: `New ${type ?? 'media'} submitted for review`,
          html: `
            <p>A new ${type ?? 'media'} was submitted and is pending review.</p>
            <ul>
              <li><strong>Type:</strong> ${type ?? 'unknown'}</li>
              <li><strong>Title:</strong> ${title || '(none)'}</li>
              <li><strong>${bots}</strong></li>
              <li><strong>URL:</strong> ${url}</li>
            </ul>
            <p><a href="https://scrapyard-fanclub.vercel.app/admin">Review it in the admin panel →</a></p>
          `,
        }),
      }).catch(() => {}) // Don't fail the request if email fails
    }

    return NextResponse.json({ ok: true, id: media.id })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
