import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  // Fetch the page
  let html: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScrapyardBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    html = await res.text()
  } catch (e: any) {
    return NextResponse.json({ error: `Could not fetch URL: ${e.message}` }, { status: 400 })
  }

  // Strip tags and trim to avoid huge token counts
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 8000)

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Extract event info from this page text and return ONLY valid JSON with these fields:
- title: string (event name)
- start_date: string (YYYY-MM-DD, or "" if unknown)
- end_date: string (YYYY-MM-DD, or "" if single-day or unknown)
- event_source: one of "nhrl", "gscrl", "rce", "other" (guess from URL/content)

Page URL: ${url}
Page text: ${text}

Return only the JSON object, no markdown.`,
    }],
  })

  const raw = (message.content[0] as { text: string }).text.trim()
  try {
    const parsed = JSON.parse(raw)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Could not parse response', raw }, { status: 500 })
  }
}
