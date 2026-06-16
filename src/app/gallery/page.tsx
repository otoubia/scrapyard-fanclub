import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Image as ImageIcon, Camera, Calendar, MapPin, Video } from 'lucide-react'
import { formatDateShort } from '@/lib/utils'

// Extract "City, ST" from a full address string
function cityState(location: string | null): string | null {
  if (!location) return null
  // Format: "Street, City, ST ZIP, USA" or "Venue, City, ST ZIP, USA"
  const parts = location.split(',').map(p => p.trim())
  if (parts.length >= 3) {
    const cityPart = parts[parts.length - 3] // City
    const stateZip = parts[parts.length - 2] // "ST ZIP"
    const state = stateZip.trim().split(' ')[0] // Just "ST"
    if (cityPart && state) return `${cityPart}, ${state}`
  }
  return null
}

export const dynamic = 'force-dynamic'

function MediaCard({ item }: { item: any }) {
  const isYt = item.url?.includes('youtube') || item.url?.includes('youtu.be')
  const ytId = isYt ? item.url?.match(/(?:v=|youtu\.be\/)([^&\s?]+)/)?.[1] ?? null : null
  const isDirectFile = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(item.url ?? '')
  const bots = item.media_robot_tags?.map((t: any) => t.robot?.name).filter(Boolean) ?? []

  const isVideoLink = item.type === 'video' && (isYt || (!isDirectFile))

  if (isVideoLink) {
    return (
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="card overflow-hidden flex flex-col hover:border-orange-500 transition-colors">
        <div className="aspect-video bg-[#1a1a1a] overflow-hidden relative flex items-center justify-center">
          {isYt && ytId
            ? <>
                <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt={item.title ?? ''} className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center shadow-lg">
                    <div className="w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[14px] border-l-white ml-1" />
                  </div>
                </div>
              </>
            : <Video size={40} className="text-orange-500/40" />
          }
        </div>
        <div className="p-3 flex-1">
          {item.title && <p className="text-sm font-semibold">{item.title}</p>}
          {item.caption && <p className="text-xs text-gray-400 mt-1">{item.caption}</p>}
          <div className="flex flex-wrap gap-1 mt-2">
            {bots.map((b: string) => (
              <span key={b} className="text-xs bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded-full">{b}</span>
            ))}
            {item.event?.title && (
              <span className="text-xs bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full">{item.event.title}</span>
            )}
          </div>
          {item.event && (
            <div className="mt-2 flex flex-col gap-0.5">
              {item.event.start_date && !item.event.start_date.startsWith('2020') && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Calendar size={10} /> {formatDateShort(item.event.start_date)}
                </span>
              )}
              {cityState(item.event.location) && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <MapPin size={10} /> {cityState(item.event.location)}
                </span>
              )}
            </div>
          )}
        </div>
      </a>
    )
  }

  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="aspect-video bg-[#1a1a1a] overflow-hidden">
        {item.type === 'video'
          ? <video src={item.url} controls className="w-full h-full" />
          : <img src={item.url} alt={item.title ?? 'Media'} className="w-full h-full object-cover" />
        }
      </div>
      <div className="p-3 flex-1">
        {item.title && <p className="text-sm font-semibold">{item.title}</p>}
        {item.caption && <p className="text-xs text-gray-400 mt-1">{item.caption}</p>}
        <div className="flex flex-wrap gap-1 mt-2">
          {bots.map((b: string) => (
            <span key={b} className="text-xs bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded-full">{b}</span>
          ))}
          {item.event?.title && (
            <span className="text-xs bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full">{item.event.title}</span>
          )}
        </div>
        {item.event && (
          <div className="mt-2 flex flex-col gap-0.5">
            {item.event.start_date && !item.event.start_date.startsWith('2020') && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Calendar size={10} /> {formatDateShort(item.event.start_date)}
              </span>
            )}
            {cityState(item.event.location) && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <MapPin size={10} /> {cityState(item.event.location)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ event_id?: string; robot_id?: string }>
}) {
  const { event_id, robot_id } = await searchParams
  const supabase = await createServiceClient()

  let media: any[] = []
  let pageTitle = 'Gallery'
  let backHref = '/'
  let backLabel = 'Home'

  if (event_id) {
    // Gallery for a specific event
    const [mediaRes, eventRes] = await Promise.all([
      supabase.from('media')
        .select('*, event:events(id,title,start_date,location), media_robot_tags(robot:robots(id,name,slug))')
        .eq('approved', true)
        .eq('event_id', event_id)
        .order('created_at', { ascending: false }),
      supabase.from('events').select('title').eq('id', event_id).single(),
    ])
    media = mediaRes.data ?? []
    pageTitle = eventRes.data?.title ?? 'Event Gallery'
    backHref = '/#events'
    backLabel = 'Events'
  } else if (robot_id) {
    // Gallery for a specific robot — media tagged with this robot via media_robot_tags
    const { data: taggedMedia } = await supabase
      .from('media_robot_tags')
      .select('media:media(*, event:events(id,title,start_date,location), media_robot_tags(robot:robots(id,name,slug)))')
      .eq('robot_id', robot_id)

    const { data: robot } = await supabase.from('robots').select('name, slug').eq('id', robot_id).single()

    media = (taggedMedia ?? [])
      .map((t: any) => t.media)
      .filter((m: any) => m?.approved)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    pageTitle = robot?.name ? `${robot.name} — Gallery` : 'Robot Gallery'
    backHref = robot?.slug ? `/robots/${robot.slug}` : '/robots'
    backLabel = robot?.name ?? 'Back'
  } else {
    // Full gallery
    const { data } = await supabase
      .from('media')
      .select('*, event:events(id,title,start_date,location), media_robot_tags(robot:robots(id,name,slug))')
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(100)
    media = data ?? []
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href={backHref} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-orange-400 transition-colors">
          <ArrowLeft size={14} /> {backLabel}
        </Link>
      </div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="section-title mb-0">{pageTitle} [dbg:{media.reduce((n,m)=>n+(m.media_robot_tags?.length??0),0)}tags]</h1>
        <Link href={`/submit${event_id ? `?event_id=${event_id}` : robot_id ? `?robot_id=${robot_id}` : ''}`}
          className="flex items-center gap-1.5 text-sm border border-orange-500 text-orange-500 hover:bg-orange-500/10 px-4 py-2 rounded-lg transition-colors font-bold">
          <Camera size={13} /> Share Media
        </Link>
      </div>

      {media.length === 0 ? (
        <div className="card p-16 text-center text-gray-500">
          <ImageIcon size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-lg">No media yet</p>
          <p className="text-sm mt-2">Be the first to share a photo or video!</p>
          <Link href={`/submit${event_id ? `?event_id=${event_id}` : robot_id ? `?robot_id=${robot_id}` : ''}`}
            className="inline-flex items-center gap-1.5 mt-4 text-orange-500 hover:underline text-sm">
            <Camera size={12} /> Share Media
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {media.map((item: any) => <MediaCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}
