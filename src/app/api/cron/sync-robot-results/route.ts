import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

function checkAuth(req: NextRequest) {
  const secret = req.headers.get('authorization')
  return secret === `Bearer ${process.env.CRON_SECRET}` || secret === `Bearer ${process.env.ADMIN_SECRET}`
}

// Parse the RCE robot page HTML and extract event results
// Each result line looks like: "Event Name: W-L (Nth Place)"
function parseRCEPage(html: string): { overall: string, results: ParsedResult[] } {
  // Strip HTML tags to get plain text
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')

  const results: ParsedResult[] = []

  // Match lines like "Event Name: 3-2 (5th Place)" or "Event Name: 4-0 (1st Place)"
  const resultRegex = /([A-Za-z0-9][^:]{3,80}):\s*(\d+)-(\d+)\s*\((\d+(?:st|nd|rd|th)\s+Place)\)/gi
  let match
  while ((match = resultRegex.exec(text)) !== null) {
    const name = match[1].trim()
    const wins = parseInt(match[2])
    const losses = parseInt(match[3])
    const placement = match[4].trim()
    // Skip obviously bad matches
    if (name.length > 100 || name.includes('{')) continue
    results.push({ name, wins, losses, placement })
  }

  // Extract overall record e.g. "32-31"
  const overallMatch = text.match(/Overall Performance[:\s]+(\d+-\d+)/)
  const overall = overallMatch ? overallMatch[1] : ''

  return { overall, results }
}

interface ParsedResult {
  name: string
  wins: number
  losses: number
  placement: string
}

function placementRank(placement: string): number {
  const m = placement.match(/(\d+)/)
  return m ? parseInt(m[1]) : 99
}

function isPodium(placement: string): boolean {
  return placementRank(placement) <= 3
}

function podiumType(placement: string): 'podium' | 'knockout' | 'other' {
  const rank = placementRank(placement)
  if (rank === 1) return 'podium'
  if (rank <= 3) return 'podium'
  return 'other'
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()

  // Get all robots with an RCE URL
  const { data: robots } = await supabase
    .from('robots')
    .select('id, name, slug, rce_url')
    .not('rce_url', 'is', null)

  if (!robots?.length) return NextResponse.json({ error: 'No robots with rce_url found' }, { status: 400 })

  const summary: Record<string, number> = {}
  let totalResults = 0
  let totalHighlights = 0

  for (const robot of robots) {
    try {
      const res = await fetch(robot.rce_url, { next: { revalidate: 0 } })
      if (!res.ok) { summary[robot.name] = 0; continue }
      const html = await res.text()
      const { results } = parseRCEPage(html)

      if (!results.length) { summary[robot.name] = 0; continue }

      let robotResults = 0
      let robotHighlights = 0

      for (const r of results) {
        // Upsert the event
        const eventExternalId = `rce-bot-event:${r.name.toLowerCase().replace(/\s+/g, '-')}`
        let eventId: string | null = null

        const { data: existingEvent } = await supabase
          .from('events')
          .select('id')
          .eq('event_source', 'rce_robot')
          .eq('external_id', eventExternalId)
          .single()

        if (existingEvent) {
          eventId = existingEvent.id
        } else {
          const { data: newEvent } = await supabase
            .from('events')
            .insert({
              title: r.name,
              event_source: 'rce_robot',
              external_id: eventExternalId,
              status: 'past',
              start_date: new Date('2020-01-01').toISOString(), // placeholder; no date on RCE bot pages
              updated_at: new Date().toISOString(),
            })
            .select('id')
            .single()
          eventId = newEvent?.id ?? null
        }

        if (!eventId) continue

        // Upsert robot_result
        const { data: existingResult } = await supabase
          .from('robot_results')
          .select('id')
          .eq('robot_id', robot.id)
          .eq('event_id', eventId)
          .single()

        if (existingResult) {
          await supabase
            .from('robot_results')
            .update({ wins: r.wins, losses: r.losses, placement: r.placement, is_highlight: isPodium(r.placement) })
            .eq('id', existingResult.id)
        } else {
          await supabase
            .from('robot_results')
            .insert({ robot_id: robot.id, event_id: eventId, wins: r.wins, losses: r.losses, placement: r.placement, is_highlight: isPodium(r.placement) })
        }
        robotResults++
        totalResults++

        // Create highlight for podium finishes
        if (isPodium(r.placement)) {
          const { data: existingHighlight } = await supabase
            .from('highlights')
            .select('id')
            .eq('robot_id', robot.id)
            .eq('event_id', eventId)
            .single()

          if (!existingHighlight) {
            await supabase.from('highlights').insert({
              title: `${robot.name} — ${r.placement} at ${r.name}`,
              description: `${r.wins}-${r.losses} record, finished ${r.placement}`,
              robot_id: robot.id,
              event_id: eventId,
              type: podiumType(r.placement),
            })
            robotHighlights++
            totalHighlights++
          }
        }
      }

      summary[robot.name] = robotResults
    } catch (err) {
      summary[robot.name] = -1
    }
  }

  return NextResponse.json({ ok: true, totalResults, totalHighlights, perRobot: summary })
}
