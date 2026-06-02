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
    const [eventsRes, highlightsRes, mediaRes, robotsRes, postsRes] = await Promise.all([
      supabase.from('events').select('*').order('start_date', { ascending: false }).limit(20),
      supabase.from('highlights').select('*, robot:robots(*), event:events(*)').order('created_at', { ascending: false }).limit(6),
      supabase.from('media').select('*, robot:robots(*), event:events(*)').eq('approved', true).order('created_at', { ascending: false }).limit(12),
      supabase.from('robots').select('*').eq('active', true).order('name'),
      supabase.from('posts').select('*').eq('approved', true).order('created_at', { ascending: false }).limit(6),
    ])
    events = eventsRes.data ?? []
    highlights = highlightsRes.data ?? []
    media = mediaRes.data ?? []
    robots = robotsRes.data ?? []
    posts = postsRes.data ?? []
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
