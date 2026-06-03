import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

function checkAuth(req: NextRequest) {
  const secret = req.headers.get('authorization')
  return secret === `Bearer ${process.env.CRON_SECRET}` || secret === `Bearer ${process.env.ADMIN_SECRET}`
}

const YEARS = [2023, 2024, 2025, 2026]

interface TableRow {
  eventName: string
  rceEventId: string
  place: number  // 0 = no placement
}

// Parse the history table from raw HTML
function parseHistoryTable(html: string): TableRow[] {
  const rows: TableRow[] = []
  // Match each <tr class="history-tr">...</tr>
  const trRegex = /<tr[^>]*class="[^"]*history-tr[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
  let trMatch
  while ((trMatch = trRegex.exec(html)) !== null) {
    const rowHtml = trMatch[1]
    // Extract event name and RCE event ID from first <td>
    const eventLinkMatch = rowHtml.match(/href="\/events\/(\d+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!eventLinkMatch) continue
    const rceEventId = eventLinkMatch[1]
    const eventName = eventLinkMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    // Extract place from second <td> — look for a number link or just a number
    const tds = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []
    if (tds.length < 2) continue
    const placeText = tds[1].replace(/<[^>]+>/g, '').trim()
    const place = parseInt(placeText) || 0
    if (eventName) rows.push({ eventName, rceEventId, place })
  }
  return rows
}

// Extract bot image URL from HTML
function parseImageUrl(html: string): string | null {
  const m = html.match(/https:\/\/robotcombatevents\.s3\.amazonaws\.com\/uploads\/resource\/photo\/[^\s"']+/)
  return m ? m[0] : null
}

// Parse date and location from an event page
function parseEventPage(html: string): { startDate: string | null, location: string | null } {
  // Match: <p class="info-row"><strong>Location:</strong> ...</p>
  const locMatch = html.match(/Location:<\/strong>\s*([^<]+)/)
  const location = locMatch ? locMatch[1].trim() : null

  // Match: <p class="info-row"><strong>Date:</strong> Saturday, April 25, 2026 ...</p>
  // or multi-day: "April 25, 2026 – April 26, 2026"
  const dateMatch = html.match(/Date:<\/strong>\s*([^<]+)/)
  let startDate: string | null = null
  if (dateMatch) {
    const raw = dateMatch[1].trim()
    // Take the first date (before any em-dash for multi-day events)
    const firstDate = raw.split(/[–-]/)[0].trim()
    // Remove day-of-week prefix if present: "Saturday, April 25, 2026" → "April 25, 2026"
    const cleaned = firstDate.replace(/^[A-Za-z]+,\s*/, '')
    const parsed = new Date(cleaned)
    if (!isNaN(parsed.getTime())) startDate = parsed.toISOString()
  }

  return { startDate, location }
}

// In-memory cache of event page data keyed by RCE event ID (scoped to one invocation)
const eventPageCache: Record<string, { startDate: string | null, location: string | null }> = {}

async function fetchEventDetails(rceEventId: string) {
  if (eventPageCache[rceEventId]) return eventPageCache[rceEventId]
  try {
    const res = await fetch(`https://www.robotcombatevents.com/events/${rceEventId}`, { next: { revalidate: 0 } })
    const html = res.ok ? await res.text() : ''
    const details = parseEventPage(html)
    eventPageCache[rceEventId] = details
    return details
  } catch {
    return { startDate: null, location: null }
  }
}

function ordinal(n: number): string {
  if (n === 1) return '1st Place'
  if (n === 2) return '2nd Place'
  if (n === 3) return '3rd Place'
  return `${n}th Place`
}

function isPodium(place: number): boolean {
  return place >= 1 && place <= 3
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()
  const slugFilter = req.nextUrl.searchParams.get('slug')

  let query = supabase.from('robots').select('id, name, slug, rce_url').not('rce_url', 'is', null)
  if (slugFilter) query = query.eq('slug', slugFilter)
  const { data: robots } = await query

  if (!robots?.length) return NextResponse.json({ error: 'No robots with rce_url' }, { status: 400 })

  const summary: Record<string, number> = {}
  let totalResults = 0
  let totalHighlights = 0

  for (const robot of robots) {
    let robotResults = 0
    let robotHighlights = 0

    try {
      // Fetch all years in parallel
      const pages = await Promise.all(
        YEARS.map(year =>
          fetch(`${robot.rce_url}?year=${year}`, { next: { revalidate: 0 } })
            .then(r => r.ok ? r.text() : '')
            .catch(() => '')
        )
      )

      // Extract and update image URL from the first page that has one
      for (const html of pages) {
        const imageUrl = parseImageUrl(html)
        if (imageUrl) {
          await supabase.from('robots').update({ image_url: imageUrl }).eq('id', robot.id)
          break
        }
      }

      // Collect all unique event results across all years
      const allRows: TableRow[] = []
      const seenEventIds = new Set<string>()
      for (const html of pages) {
        for (const row of parseHistoryTable(html)) {
          if (!seenEventIds.has(row.rceEventId)) {
            seenEventIds.add(row.rceEventId)
            allRows.push(row)
          }
        }
      }

      for (const row of allRows) {
        // Skip events with no placement yet (place = 0, i.e. future/unresolved)
        // We still record them so we have a full history
        const placement = row.place > 0 ? ordinal(row.place) : null
        const externalId = `rce-event:${row.rceEventId}`

        // Fetch real date and location from the event page
        const { startDate, location } = await fetchEventDetails(row.rceEventId)
        const status = startDate && new Date(startDate) > new Date() ? 'upcoming' : 'past'

        // Upsert event
        let eventId: string | null = null
        const { data: existingEvent } = await supabase
          .from('events')
          .select('id')
          .eq('event_source', 'rce_robot')
          .eq('external_id', externalId)
          .single()

        if (existingEvent) {
          eventId = existingEvent.id
          await supabase.from('events').update({
            title: row.eventName,
            start_date: startDate ?? undefined,
            location: location ?? undefined,
            status,
            updated_at: new Date().toISOString()
          }).eq('id', eventId)
        } else {
          const { data: newEvent } = await supabase
            .from('events')
            .insert({
              title: row.eventName,
              event_source: 'rce_robot',
              external_id: externalId,
              status,
              start_date: startDate ?? new Date('2020-01-01').toISOString(),
              location,
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

        const resultData = {
          wins: 0,
          losses: 0,
          placement,
          is_highlight: isPodium(row.place),
        }

        if (existingResult) {
          await supabase.from('robot_results').update(resultData).eq('id', existingResult.id)
        } else {
          await supabase.from('robot_results').insert({ robot_id: robot.id, event_id: eventId, ...resultData })
        }
        robotResults++
        totalResults++

        // Highlight for podium finishes
        if (isPodium(row.place)) {
          const { data: existingHighlight } = await supabase
            .from('highlights')
            .select('id')
            .eq('robot_id', robot.id)
            .eq('event_id', eventId)
            .single()

          if (!existingHighlight) {
            await supabase.from('highlights').insert({
              title: `${robot.name} — ${placement} at ${row.eventName}`,
              description: `Finished ${placement}`,
              robot_id: robot.id,
              event_id: eventId,
              type: row.place === 1 ? 'podium' : 'podium',
            })
            robotHighlights++
            totalHighlights++
          }
        }
      }
    } catch (err) {
      summary[robot.name] = -1
      continue
    }

    summary[robot.name] = robotResults
  }

  return NextResponse.json({ ok: true, totalResults, totalHighlights, perRobot: summary })
}
