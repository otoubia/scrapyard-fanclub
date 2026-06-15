import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

function checkAuth(req: NextRequest) {
  const secret = req.headers.get('authorization')
  return secret === `Bearer ${process.env.CRON_SECRET}` || secret === `Bearer ${process.env.ADMIN_SECRET}`
}

const YEARS = [2023, 2024, 2025, 2026]

interface TableRow {
  eventName: string
  rceEventId: string
  place: number // 0 = no result yet
}

function parseHistoryTable(html: string): TableRow[] {
  const rows: TableRow[] = []
  const trRegex = /<tr[^>]*class="[^"]*history-tr[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
  let trMatch
  while ((trMatch = trRegex.exec(html)) !== null) {
    const rowHtml = trMatch[1]
    const eventLinkMatch = rowHtml.match(/href="\/events\/(\d+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!eventLinkMatch) continue
    const rceEventId = eventLinkMatch[1]
    const eventName = eventLinkMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    const tds = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []
    if (tds.length < 2) continue
    const placeText = tds[1].replace(/<[^>]+>/g, '').trim()
    const place = parseInt(placeText) || 0
    if (eventName) rows.push({ eventName, rceEventId, place })
  }
  return rows
}

function parseImageUrl(html: string): string | null {
  const m = html.match(/https:\/\/robotcombatevents\.s3\.amazonaws\.com\/uploads\/resource\/photo\/[^\s"']+/)
  return m ? m[0] : null
}

function parseEventPage(html: string): { startDate: string | null, location: string | null } {
  const locMatch = html.match(/Location:<\/strong>\s*([^<]+)/)
  const location = locMatch ? locMatch[1].trim() : null
  const dateMatch = html.match(/Dates?:<\/strong>\s*([^<]+)/)
  let startDate: string | null = null
  if (dateMatch) {
    const raw = dateMatch[1].trim()
    const firstDate = raw.split(/[–-]/)[0].trim()
    const cleaned = firstDate.replace(/^[A-Za-z]+,\s*/, '')
    const parsed = new Date(cleaned)
    if (!isNaN(parsed.getTime())) startDate = parsed.toISOString()
  }
  return { startDate, location }
}

async function fetchEventDetails(rceEventId: string) {
  try {
    const res = await fetch(`https://www.robotcombatevents.com/events/${rceEventId}`, { next: { revalidate: 0 } })
    const html = res.ok ? await res.text() : ''
    return parseEventPage(html)
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

  let query = supabase.from('robots').select('id, name, slug, rce_url, image_url').not('rce_url', 'is', null)
  if (slugFilter) query = query.eq('slug', slugFilter)
  const { data: robots } = await query

  if (!robots?.length) return NextResponse.json({ error: 'No robots with rce_url' }, { status: 400 })

  const summary: Record<string, number> = {}
  const debug: Record<string, any> = {}
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

      // Always check for updated image
      for (const html of pages) {
        const imageUrl = parseImageUrl(html)
        if (imageUrl && imageUrl !== robot.image_url) {
          await supabase.from('robots').update({ image_url: imageUrl }).eq('id', robot.id)
          break
        }
      }

      // Collect all unique event rows across all years
      const allRows: TableRow[] = []
      const seenEventIds = new Set<string>()
      const rowsPerYear: number[] = []
      for (const html of pages) {
        const parsed = parseHistoryTable(html)
        rowsPerYear.push(parsed.length)
        for (const row of parsed) {
          if (!seenEventIds.has(row.rceEventId)) {
            seenEventIds.add(row.rceEventId)
            allRows.push(row)
          }
        }
      }
      debug[robot.slug] = { rowsPerYear, totalRows: allRows.length }

      // Load all existing events and results for this robot in one query.
      // Check both rce_robot events and canonical rce events (synced from events.json).
      const externalIds = allRows.map(r => `rce-event:${r.rceEventId}`)
      const rawRceIds = allRows.map(r => r.rceEventId)

      const [{ data: existingRceRobotEvents }, { data: existingRceEvents }] = await Promise.all([
        supabase
          .from('events')
          .select('id, external_id, start_date, location')
          .eq('event_source', 'rce_robot')
          .in('external_id', externalIds),
        supabase
          .from('events')
          .select('id, external_id, start_date, location')
          .eq('event_source', 'rce')
          .in('external_id', rawRceIds),
      ])

      // Build map keyed by 'rce-event:<id>'; canonical rce events take precedence
      const existingEventMap = new Map<string, any>()
      for (const e of existingRceRobotEvents ?? []) {
        existingEventMap.set(e.external_id, e)
      }
      for (const e of existingRceEvents ?? []) {
        existingEventMap.set(`rce-event:${e.external_id}`, { ...e, _canonical: true })
      }

      const existingEventIds = [...existingEventMap.values()].map(e => e.id)
      const { data: existingResults } = existingEventIds.length
        ? await supabase
            .from('robot_results')
            .select('id, event_id, placement')
            .eq('robot_id', robot.id)
            .in('event_id', existingEventIds)
        : { data: [] }

      const existingResultMap = new Map(existingResults?.map(r => [r.event_id, r]) ?? [])

      // Determine which events need a fresh page fetch, then do them ALL in parallel.
      // Skip canonical rce events — their dates are already managed by sync-events.
      const rowsNeedingFetch = allRows.filter(row => {
        const existingEvent = existingEventMap.get(`rce-event:${row.rceEventId}`)
        if (existingEvent?._canonical) return false
        const existingResult = existingEvent ? existingResultMap.get(existingEvent.id) : null
        const alreadySettled = existingEvent?.start_date &&
          !existingEvent.start_date.startsWith('2020') &&
          existingResult?.placement != null
        return !alreadySettled
      })

      const fetchedDetails = await Promise.all(
        rowsNeedingFetch.map(row => fetchEventDetails(row.rceEventId))
      )
      const fetchedMap = new Map(rowsNeedingFetch.map((row, i) => [row.rceEventId, fetchedDetails[i]]))

      for (const row of allRows) {
        const externalId = `rce-event:${row.rceEventId}`
        const placement = row.place > 0 ? ordinal(row.place) : null
        const existingEvent = existingEventMap.get(externalId)
        const existingResult = existingEvent ? existingResultMap.get(existingEvent.id) : null

        const alreadySettled = existingEvent?.start_date &&
          !existingEvent.start_date.startsWith('2020') &&
          existingResult?.placement != null

        let startDate = existingEvent?.start_date ?? null
        let location = existingEvent?.location ?? null

        if (!alreadySettled) {
          const details = fetchedMap.get(row.rceEventId)
          if (details?.startDate) startDate = details.startDate
          if (details?.location) location = details.location
        }

        // Always derive status from actual date
        const status = startDate && !startDate.startsWith('2020') && new Date(startDate) > new Date() ? 'upcoming' : 'past'

        // Upsert event — canonical rce events are managed by sync-events, don't modify them
        let eventId: string | null = existingEvent?.id ?? null
        if (existingEvent?._canonical) {
          // Just use the existing canonical event ID; no update needed
        } else if (existingEvent) {
          if (!alreadySettled) {
            await supabase.from('events').update({
              title: row.eventName,
              start_date: startDate ?? undefined,
              location: location ?? undefined,
              status,
              updated_at: new Date().toISOString(),
            }).eq('id', eventId)
          }
        } else {
          const { data: newEvent } = await supabase
            .from('events')
            .insert({
              title: row.eventName,
              event_source: 'rce_robot',
              external_id: externalId,
              status,
              start_date: startDate ?? new Date().toISOString(),
              location,
              updated_at: new Date().toISOString(),
            })
            .select('id')
            .single()
          eventId = newEvent?.id ?? null
        }

        if (!eventId) continue

        // Upsert robot_result — skip if already settled with a placement
        if (alreadySettled) {
          robotResults++
          totalResults++
          continue
        }

        const resultData = { wins: 0, losses: 0, placement, is_highlight: isPodium(row.place) }

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
              type: 'podium',
            })
            robotHighlights++
            totalHighlights++
          }
        }
      }
    } catch {
      summary[robot.name] = -1
      continue
    }

    summary[robot.name] = robotResults

    // Immediately invalidate the robot's page cache
    revalidatePath(`/robots/${robot.slug}`)
  }

  // Second pass: fix any events still stuck on placeholder 2020 dates
  // These were likely missed due to rate limiting in the first pass
  const { data: stuckEvents } = await supabase
    .from('events')
    .select('id, external_id, title')
    .eq('event_source', 'rce_robot')
    .like('start_date', '2020%')

  let fixedDates = 0
  for (const event of stuckEvents ?? []) {
    const m = event.external_id?.match(/rce-event:(\d+)/)
    if (!m) continue
    // Delay between requests to avoid rate limiting
    await new Promise(r => setTimeout(r, 800))
    const details = await fetchEventDetails(m[1])
    if (details.startDate) {
      const status = new Date(details.startDate) > new Date() ? 'upcoming' : 'past'
      await supabase.from('events').update({
        start_date: details.startDate,
        location: details.location ?? undefined,
        status,
        updated_at: new Date().toISOString(),
      }).eq('id', event.id)
      fixedDates++
    }
  }

  revalidatePath('/')
  return NextResponse.json({ ok: true, totalResults, totalHighlights, fixedDates, perRobot: summary, debug })
}
