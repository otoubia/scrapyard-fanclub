import { createClient } from '@/lib/supabase/server'
import EventsSection from '@/components/sections/EventsSection'
import HighlightsSection from '@/components/sections/HighlightsSection'
import GallerySection from '@/components/sections/GallerySection'
import RobotsSection from '@/components/sections/RobotsSection'
import HeroSection from '@/components/sections/HeroSection'
import PostsSection from '@/components/sections/PostsSection'

export const revalidate = 300

export default async function HomePage() {
  let events: any[] = [], highlights: any[] = [], media: any[] = [], robots: any[] = [], posts: any[] = []

  try {
    const supabase = await createClient()
    const [eventsRes, highlightsRes, mediaRes, robotsRes, postsRes, competitorsRes] = await Promise.all([
      supabase.from('events').select('*, external_id').order('start_date', { ascending: false }).limit(100),
      supabase.from('highlights').select('*, robot:robots(*), event:events(*)').order('created_at', { ascending: false }),
      supabase.from('media').select('*, robot:robots(*), event:events(*)').eq('approved', true).order('created_at', { ascending: false }).limit(12),
      supabase.from('robots').select('*, robot_results(count)').eq('active', true),
      supabase.from('posts').select('*').eq('approved', true).order('created_at', { ascending: false }).limit(6),
      supabase.from('robot_results').select('event_id, robot:robots(name, slug)').is('placement', null),
    ])
    events = eventsRes.data ?? []
    // Sort highlights by event start_date descending
    highlights = (highlightsRes.data ?? []).sort((a: any, b: any) =>
      new Date(b.event?.start_date ?? 0).getTime() - new Date(a.event?.start_date ?? 0).getTime()
    )
    media = mediaRes.data ?? []
    // Sort robots by number of events attended (most to least)
    robots = (robotsRes.data ?? []).sort((a: any, b: any) => {
      const aCount = a.robot_results?.[0]?.count ?? 0
      const bCount = b.robot_results?.[0]?.count ?? 0
      return bCount - aCount
    })
    posts = postsRes.data ?? []

    // Build a map of event_id → competing robots
    const competitorMap: Record<string, any[]> = {}
    for (const r of competitorsRes.data ?? []) {
      if (!competitorMap[r.event_id]) competitorMap[r.event_id] = []
      competitorMap[r.event_id].push(r.robot)
    }
    // Attach competitors to events
    events = events.map((e: any) => ({ ...e, competitors: competitorMap[e.id] ?? [] }))
  } catch {
    // Supabase not yet configured — placeholder UI shown
  }

  const pastEvents = events.filter(e => e.status === 'past')
  const currentEvents = events.filter(e => e.status === 'current')
  const upcomingEvents = events.filter(e => e.status === 'upcoming')

  return (
    <div>
      <HeroSection currentEvents={currentEvents} />
      <div className="max-w-7xl mx-auto px-4 py-12 space-y-20">
        <EventsSection past={pastEvents} current={currentEvents} upcoming={upcomingEvents} />
        <HighlightsSection highlights={highlights} />
        <GallerySection media={media} />
        <RobotsSection robots={robots} />
        <PostsSection posts={posts} />
      </div>
    </div>
  )
}
