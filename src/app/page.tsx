import { createClient } from '@/lib/supabase/server'
import EventsSection from '@/components/sections/EventsSection'
import HighlightsSection from '@/components/sections/HighlightsSection'
import GallerySection from '@/components/sections/GallerySection'
import HeroSection from '@/components/sections/HeroSection'

export const revalidate = 300

export default async function HomePage() {
  let events: any[] = [], highlights: any[] = [], media: any[] = []
  let eventIdsWithResults = new Set<string>()
  const todayStr = new Date().toISOString().slice(0, 10)

  try {
    const supabase = await createClient()
    const [eventsRes, highlightsRes, mediaRes, eventMediaRes, robotResultCountsRes, competitorsRes] = await Promise.all([
      supabase.from('events').select('*, external_id').order('start_date', { ascending: false }).limit(100),
      supabase.from('highlights').select('*, robot:robots(*), event:events(*)').order('created_at', { ascending: false }),
      supabase.from('media').select('*, event:events(id,title,start_date,location), media_robot_tags(robot:robots(id,name,slug))').eq('approved', true).order('created_at', { ascending: false }).limit(12),
      supabase.from('media').select('event_id').eq('approved', true).not('event_id', 'is', null),
      supabase.from('robot_results').select('robot_id, event_id'),
      supabase.from('robot_results').select('event_id, robot:robots(name, slug)'),
    ])
    events = eventsRes.data ?? []
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
    eventIdsWithResults = new Set([
      ...robotResultCountsRes.data?.map((r: any) => r.event_id) ?? [],
      ...competitorsRes.data?.map((r: any) => r.event_id) ?? [],
    ])
    events = events.map((e: any) => ({ ...e, competitors: competitorMap[e.id] ?? [], hasMedia: eventIdsWithMedia.has(e.id) }))
  } catch {
    // Supabase not yet configured — placeholder UI shown
  }

  // Only show past events where at least one team bot competed
  const pastEventsBase = eventIdsWithResults.size > 0
    ? events.filter(e => e.status === 'past' && eventIdsWithResults.has(e.id))
    : events.filter(e => e.status === 'past')

  // Upcoming: exclude today's events so they appear under Live instead
  const todayMidnight = new Date()
  todayMidnight.setHours(0, 0, 0, 0)
  const upcomingEventsBase = events
    .filter(e => e.status === 'upcoming' &&
      e.start_date?.slice(0, 10) !== todayStr &&
      new Date(e.end_date || e.start_date) >= todayMidnight)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())

  // Live events: status=current OR start_date=today
  const liveEventsBase = events.filter(e =>
    e.status === 'current' || e.start_date?.slice(0, 10) === todayStr
  )

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
      const supabase2 = await createClient()
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
