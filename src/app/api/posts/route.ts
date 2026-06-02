import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, content, author_name, author_email, media_urls } = body

    if (!title || !content || !author_name || !author_email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createServiceClient()
    const { error } = await supabase.from('posts').insert({
      title, content, author_name, author_email,
      media_urls: media_urls ?? [],
      approved: false,
    })

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
