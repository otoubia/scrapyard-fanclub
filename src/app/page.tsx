import { createClient } from '@/lib/supabase/server'
import EventsSection from '@/components/sections/EventsSection'
import HighlightsSection from '@/components/sections/HighlightsSection'
import GallerySection from '@/components/sections/GallerySection'
import HeroSection from '@/components/sections/HeroSection'

export const revalidate = 300

export default async function HomePage() {
  let events: any[] = [], highlights: any[] = [], media: any[] = []
  let eventIdsWithResults = new Set<string>()

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
    // Sort highlights by event start_date descending
    highlights = (highlightsRes.data ?? []).sort((a: any, b: any) =>
      new Date(b.event?.start_date ?? 0).getTime() - new Date(a.event?.start_date ?? 0).getTime()
    )
    media = mediaRes.data ?? []
    const eventIdsWithMedia = new Set((eventMediaRes.data ?? []).map((m: any) => m.event_id))
    // Build a map of event_id → competing robots (pending/upcoming)
    const competitorMap: Record<string, any[]> = {}
    for (const r of competitorsRes.data ?? []) {
      if (!competitorMap[r.event_id]) competitorMap[r.event_id] = []
      competitorMap[r.event_id].push(r.robot)
    }
    // Also collect all event_ids where any bot has a result (for filtering past events)
    eventIdsWithResults = new Set([
      ...robotResultCountsRes.data?.map((r: any) => r.event_id) ?? [],
      ...competitorsRes.data?.map((r: any) => r.event_id) ?? [],
    ])
    // Attach competitors and media flag to events
    events = events.map((e: any) => ({ ...e, competitors: competitorMap[e.id] ?? [], hasMedia: eventIdsWithMedia.has(e.id) }))
  } catch {
    // Supabase not yet configured — placeholder UI shown
  }

  // Only show past events where at least one team bot competed
  // Fall back to all past events if data didn't load
  const pastEvents = eventIdsWithResults.size > 0
    ? events.filter(e => e.status === 'past' && eventIdsWithResults.has(e.id))
    : events.filter(e => e.status === 'past')
  const currentEvents = events.filter(e => e.status === 'current')

  // Guard upcoming by date so stale 'upcoming' rows don't show after the event day
  const todayMidnight = new Date()
  todayMidnight.setHours(0, 0, 0, 0)
  const upcomingEvents = events
    .filter(e => e.status === 'upcoming' && new Date(e.end_date || e.start_date) >= todayMidnight)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())

  // Fetch today's event links (shown in Live Now tab)
  let todayLinks: any[] = []
  try {
    const supabase2 = await createClient()
    const todayStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    // Include events starting today OR currently marked live (start_date may be yesterday if sync ran before midnight UTC)
    const todayEventIds = events
      .filter(e => e.start_date?.slice(0, 10) === todayStr || e.status === 'current')
      .map(e => e.id)
    if (todayEventIds.length > 0) {
      const { data: linksData } = await supabase2
        .from('event_links')
        .select('*, event:events(id, title, start_date)')
        .in('event_id', todayEventIds)
        .order('created_at')
      todayLinks = linksData ?? []
    }
  } catch {}

  return (
    <div>
      <HeroSection currentEvents={currentEvents} />
      <div className="max-w-7xl mx-auto px-4 py-12 space-y-20">
        <EventsSection past={pastEvents} current={currentEvents} upcoming={upcomingEvents} todayLinks={todayLinks} />
        <HighlightsSection highlights={highlights} />
        <GallerySection media={media} />
      </div>
    </div>
  )
}
