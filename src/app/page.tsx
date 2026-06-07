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
  let pastBracketMap: Record<string, string> = {}

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

    // Fetch bracket links for past events (used for non-NHRL events that don't have a BrettZone URL)
    const pastEventIds = events.filter((e: any) => e.status === 'past').map((e: any) => e.id)
    if (pastEventIds.length > 0) {
      const { data: bracketData } = await supabase
        .from('event_links')
        .select('event_id, url')
        .in('event_id', pastEventIds)
        .eq('link_type', 'bracket')
      for (const l of bracketData ?? []) {
        if (!pastBracketMap[l.event_id]) pastBracketMap[l.event_id] = l.url
      }
    }
  } catch {
    // Supabase not yet configured — placeholder UI shown
  }

  // Only show past events where at least one team bot competed
  const pastEvents = (eventIdsWithResults.size > 0
    ? events.filter(e => e.status === 'past' && eventIdsWithResults.has(e.id))
    : events.filter(e => e.status === 'past'))
    .map((e: any) => ({ ...e, dbBracketUrl: pastBracketMap[e.id] ?? null }))

  // Upcoming: exclude today's events so they appear under Live instead
  const todayMidnight = new Date()
  todayMidnight.setHours(0, 0, 0, 0)
  const upcomingEvents = events
    .filter(e => e.status === 'upcoming' &&
      e.start_date?.slice(0, 10) !== todayStr &&
      new Date(e.end_date || e.start_date) >= todayMidnight)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())

  // Fetch today's event links for stream/bracket on live events
  let todayStreamByEvent: Record<string, string> = {}
  let todayBracketByEvent: Record<string, string> = {}
  try {
    const supabase2 = await createClient()
    const todayEventIds = events
      .filter(e => e.start_date?.slice(0, 10) === todayStr || e.status === 'current')
      .map(e => e.id)
    if (todayEventIds.length > 0) {
      const { data: linksData } = await supabase2
        .from('event_links')
        .select('*, event:events(id, title, start_date)')
        .in('event_id', todayEventIds)
        .order('created_at')
      for (const link of linksData ?? []) {
        if (link.link_type === 'stream' && !todayStreamByEvent[link.event_id]) {
          todayStreamByEvent[link.event_id] = link.url
        }
        if (link.link_type === 'bracket' && !todayBracketByEvent[link.event_id]) {
          todayBracketByEvent[link.event_id] = link.url
        }
      }
    }
  } catch {}

  // Live events: status=current OR start_date=today, with stream/bracket attached
  const liveEvents = events
    .filter(e => e.status === 'current' || e.start_date?.slice(0, 10) === todayStr)
    .map((e: any) => ({
      ...e,
      dbStreamUrl: todayStreamByEvent[e.id] ?? null,
      dbBracketUrl: todayBracketByEvent[e.id] ?? null,
    }))

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
