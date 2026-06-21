import { createServiceClient } from '@/lib/supabase/server'
import EventsSection from '@/components/sections/EventsSection'
import HighlightsSection from '@/components/sections/HighlightsSection'
import GallerySection from '@/components/sections/GallerySection'
import HeroSection from '@/components/sections/HeroSection'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  let events: any[] = [], highlights: any[] = [], media: any[] = []
  let eventIdsWithResults = new Set<string>()
  const todayStr = new Date().toISOString().slice(0, 10)

  const todayMidnight = new Date()
  todayMidnight.setHours(0, 0, 0, 0)

  try {
    const supabase = await createServiceClient()
    // Fetch robot_results event IDs and non-past events in parallel first
    const [robotResultCountsRes, competitorsRes, nonPastEventsRes, highlightsRes, mediaRes, eventMediaRes] = await Promise.all([
      supabase.from('robot_results').select('robot_id, event_id'),
      supabase.from('robot_results').select('event_id, robot:robots(name, slug)'),
      supabase.from('events').select('*, external_id').in('status', ['upcoming', 'current']).order('start_date', { ascending: true }),
      supabase.from('highlights').select('*, robot:robots(*), event:events(*)').order('created_at', { ascending: false }),
      supabase.from('media').select('*, event:events(id,title,start_date,location), media_robot_tags(robot:robots(id,name,slug))').eq('approved', true).order('created_at', { ascending: false }).limit(12),
      supabase.from('media').select('event_id').eq('approved', true).not('event_id', 'is', null),
    ])

    eventIdsWithResults = new Set([
      ...robotResultCountsRes.data?.map((r: any) => r.event_id) ?? [],
      ...competitorsRes.data?.map((r: any) => r.event_id) ?? [],
    ])

    // Fetch past events directly by robot_result IDs — avoids depending on the status field being accurate
    const resultEventIds = [...eventIdsWithResults]
    const { data: pastEventsData } = resultEventIds.length > 0
      ? await supabase.from('events').select('*, external_id').in('id', resultEventIds).order('start_date', { ascending: false })
      : { data: [] }

    highlights = (highlightsRes.data ?? []).sort((a: any, b: any) =>
      new Date(b.event?.start_date ?? 0).getTime() - new Date(a.event?.start_date ?? 0).getTime()
    )
    media = mediaRes.data ?? []
    const eventIdsWithMedia = new Set((eventMediaRes.data ?? []).map((m: any) => m.event_id))
    const competitorMap: Record<string, any[]> = {}
    for (const r of competitorsRes.data ?? []) {
      if (!competitorMap[r.event_id]) competitorMap[r.event_id] = []
      competitorMap[r.event_id].push(r.robot)
    }

    const seenIds = new Set<string>()
    const allEvents = [...(pastEventsData ?? []), ...(nonPastEventsRes.data ?? [])].filter(e => {
      if (seenIds.has(e.id)) return false
      seenIds.add(e.id)
      return true
    })
    events = allEvents.map((e: any) => ({ ...e, competitors: competitorMap[e.id] ?? [], hasMedia: eventIdsWithMedia.has(e.id) }))
  } catch {
    // Supabase not yet configured — placeholder UI shown
  }

  // Live: status=current OR today falls within [start_date, end_date]
  const liveEventsBase = events.filter(e => {
    if (e.status === 'current') return true
    const start = e.start_date?.slice(0, 10)
    const end = (e.end_date || e.start_date)?.slice(0, 10)
    return start && end && start <= todayStr && end >= todayStr
  })
  const liveEventIds = new Set(liveEventsBase.map((e: any) => e.id))

  // Past: has robot_results AND started before today AND not currently live
  const pastEventsBase = events.filter(e =>
    eventIdsWithResults.has(e.id) &&
    new Date(e.start_date || 0) < todayMidnight &&
    !liveEventIds.has(e.id)
  )

  // Upcoming: starts in the future (not yet started)
  const upcomingEventsBase = events
    .filter(e => (e.start_date?.slice(0, 10) ?? '') > todayStr)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())

  // Fetch bracket and stream links for ALL displayed events in one query
  type LinkEntry = { url: string; label: string }
  const eventLinksMap: Record<string, { bracketLinks: LinkEntry[]; streamLinks: LinkEntry[] }> = {}
  try {
    const allIds = [...new Set([
      ...pastEventsBase.map((e: any) => e.id),
      ...upcomingEventsBase.map((e: any) => e.id),
      ...liveEventsBase.map((e: any) => e.id),
    ])]
    if (allIds.length > 0) {
      const supabase2 = await createServiceClient()
      const { data: linksData } = await supabase2
        .from('event_links')
        .select('event_id, url, label, link_type')
        .in('event_id', allIds)
        .order('created_at')
      for (const l of linksData ?? []) {
        if (!eventLinksMap[l.event_id]) eventLinksMap[l.event_id] = { bracketLinks: [], streamLinks: [] }
        if (l.link_type === 'bracket' || l.link_type === 'other') eventLinksMap[l.event_id].bracketLinks.push({ url: l.url, label: l.label })
        if (l.link_type === 'stream') eventLinksMap[l.event_id].streamLinks.push({ url: l.url, label: l.label })
      }
    }
  } catch {}

  const attachLinks = (e: any) => ({
    ...e,
    dbBracketLinks: eventLinksMap[e.id]?.bracketLinks ?? [],
    dbStreamLinks: eventLinksMap[e.id]?.streamLinks ?? [],
  })

  const GSCRL_STREAM = 'https://www.youtube.com/@gscrl'

  const pastEvents = pastEventsBase.map(attachLinks)
  const upcomingEvents = upcomingEventsBase.map(attachLinks)
  const liveEvents = liveEventsBase.map((e: any) => {
    const attached = attachLinks(e)
    // Auto-inject GSCRL default stream for live GSCRL events that have no stream link
    if (attached.dbStreamLinks.length === 0 && !e.livestream_url &&
        e.title?.toLowerCase().includes('gscrl')) {
      return { ...attached, dbStreamLinks: [{ url: GSCRL_STREAM, label: 'GSCRL Live Stream' }] }
    }
    return attached
  })

  return (
    <div>
      <HeroSection currentEvents={liveEvents} />
      <div className="max-w-7xl mx-auto px-4 py-12 space-y-20">
        <EventsSection past={pastEvents} current={liveEvents} upcoming={upcomingEvents} />
        <HighlightsSection highlights={highlights} />
        <GallerySection media={media} />
      </div>
    </div>
  )
}
