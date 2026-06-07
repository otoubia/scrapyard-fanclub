'use client'

import { useState } from 'react'
import { Calendar, MapPin, Radio, Clock, Trophy, ExternalLink, Cpu, Camera, Images, Tv, BarChart2 } from 'lucide-react'
import Link from 'next/link'
import { formatDateShort } from '@/lib/utils'

function rceEventUrl(external_id: string | undefined): string | null {
  if (!external_id) return null
  const m = external_id.match(/rce-event:(\d+)/)
  return m ? `https://www.robotcombatevents.com/events/${m[1]}` : null
}

function EventCard({ event, isLive = false }: { event: any; isLive?: boolean }) {
  const eventUrl = rceEventUrl(event.external_id)
  const competitors: any[] = event.competitors ?? []

  return (
    <div className={`card p-5 flex flex-col gap-3 ${isLive ? 'border-orange-500 live-badge' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold text-base leading-tight">
          {eventUrl
            ? <Link href={eventUrl} target="_blank" className="hover:text-orange-400 transition-colors">{event.title}</Link>
            : event.title}
        </h3>
        {isLive && (
          <span className="flex items-center gap-1 text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full font-bold shrink-0">
            <Radio size={10} /> LIVE
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 text-sm text-gray-400">
        {event.start_date && !event.start_date.startsWith('2020') && (
          <span className="flex items-center gap-1.5">
            <Calendar size={13} /> {formatDateShort(event.start_date)}
            {event.end_date && event.end_date !== event.start_date && ` – ${formatDateShort(event.end_date)}`}
          </span>
        )}
        {event.location && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-orange-400 transition-colors">
            <MapPin size={13} /> {event.location}
          </a>
        )}
      </div>

      {competitors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {competitors.map((r: any) => (
            <Link key={r.slug} href={`/robots/${r.slug}`}
              className="flex items-center gap-1 text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded-full hover:bg-orange-500/20 transition-colors">
              <Cpu size={9} /> {r.name}
            </Link>
          ))}
        </div>
      )}

      {event.description && <p className="text-sm text-gray-400 line-clamp-2">{event.description}</p>}
      <div className="flex gap-2 mt-auto pt-2 flex-wrap">
        {event.hasMedia && (
          <Link href={`/gallery?event_id=${event.id}`}
            className="flex items-center gap-1 text-xs border border-[#2a2a2a] text-gray-400 px-3 py-1.5 rounded hover:border-orange-500 hover:text-orange-400 transition-colors">
            <Images size={11} /> Gallery
          </Link>
        )}
        <Link href={`/submit?event_id=${event.id}`}
          className="flex items-center gap-1 text-xs border border-[#2a2a2a] text-gray-400 px-3 py-1.5 rounded hover:border-orange-500 hover:text-orange-400 transition-colors">
          <Camera size={11} /> Share Media
        </Link>
        {eventUrl && (
          <Link href={eventUrl} target="_blank"
            className="flex items-center gap-1 text-xs border border-[#2a2a2a] text-gray-400 px-3 py-1.5 rounded hover:border-orange-500 hover:text-orange-400 transition-colors">
            <ExternalLink size={11} /> RCE Page
          </Link>
        )}
        {event.truefinals_url && (
          <Link href={event.truefinals_url} target="_blank"
            className="text-xs bg-orange-500 text-white px-3 py-1.5 rounded font-bold hover:bg-orange-600 transition-colors">
            {isLive ? '🔴 Watch Live' : 'Results'}
          </Link>
        )}
        {event.livestream_url && (
          <Link href={event.livestream_url} target="_blank"
            className="text-xs border border-orange-500 text-orange-500 px-3 py-1.5 rounded font-bold hover:bg-orange-500/10 transition-colors">
            Stream
          </Link>
        )}
      </div>
    </div>
  )
}

const LINK_STYLES: Record<string, { icon: React.ReactNode; cls: string }> = {
  bracket: { icon: <Trophy size={12} />, cls: 'text-orange-400 border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20' },
  stream:  { icon: <Tv size={12} />,     cls: 'text-red-400 border-red-500/40 bg-red-500/10 hover:bg-red-500/20' },
  results: { icon: <BarChart2 size={12} />, cls: 'text-blue-400 border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20' },
  other:   { icon: <ExternalLink size={12} />, cls: 'text-gray-300 border-[#2a2a2a] bg-[#1a1a1a] hover:border-orange-500 hover:text-orange-400' },
}

function TodayLinksPanel({ links }: { links: any[] }) {
  // Group by event
  const groups: Record<string, { title: string; links: any[] }> = {}
  for (const link of links) {
    const eid = link.event_id
    if (!groups[eid]) groups[eid] = { title: link.event?.title ?? 'Event', links: [] }
    groups[eid].links.push(link)
  }

  return (
    <div className="flex flex-col gap-4 mb-6">
      {Object.entries(groups).map(([eid, group]) => (
        <div key={eid} className="card p-4 border-orange-500/30">
          <p className="text-sm font-bold text-gray-100 mb-3 flex items-center gap-2">
            <Radio size={13} className="text-orange-500 animate-pulse" />
            {group.title}
          </p>
          <div className="flex flex-wrap gap-2">
            {group.links.map((link: any) => {
              const style = LINK_STYLES[link.link_type] ?? LINK_STYLES.other
              return (
                <Link key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${style.cls}`}>
                  {style.icon}
                  {link.label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

const TABS = ['current', 'upcoming', 'past'] as const

export default function EventsSection({
  past, current, upcoming, todayLinks = []
}: {
  past: any[]; current: any[]; upcoming: any[]; todayLinks?: any[]
}) {
  const hasLiveContent = current.length > 0 || todayLinks.length > 0
  const defaultTab = hasLiveContent ? 'current' : upcoming.length > 0 ? 'upcoming' : 'past'
  const [tab, setTab] = useState<typeof TABS[number]>(defaultTab)

  const tabData = { current, upcoming, past }
  const tabIcons = { current: <Radio size={14} />, upcoming: <Clock size={14} />, past: <Trophy size={14} /> }
  const tabLabels = { current: 'Live Now', upcoming: 'Upcoming', past: 'Past' }
  // Badge count: for Live Now, count events + signal if there are links even without events
  const tabBadge = {
    current: current.length || (todayLinks.length > 0 ? 1 : 0),
    upcoming: upcoming.length,
    past: past.length,
  }

  return (
    <section id="events">
      <h2 className="section-title">Events</h2>
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors
              ${tab === t ? 'bg-orange-500 text-white' : 'border border-[#2a2a2a] text-gray-400 hover:border-orange-500 hover:text-orange-500'}`}>
            {tabIcons[t]} {tabLabels[t]}
            {tabBadge[t] > 0 && (
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${tab === t ? 'bg-orange-600' : 'bg-[#2a2a2a]'}`}>
                {tabBadge[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'current' ? (
        !hasLiveContent ? (
          <div className="card p-10 text-center text-gray-500">
            <p>No live events right now.</p>
            <p className="text-sm mt-1">Check back during event weekends!</p>
          </div>
        ) : (
          <div>
            {todayLinks.length > 0 && <TodayLinksPanel links={todayLinks} />}
            {current.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {current.map((e: any) => (
                  <EventCard key={e.id} event={e} isLive />
                ))}
              </div>
            )}
          </div>
        )
      ) : (
        tabData[tab].length === 0 ? (
          <div className="card p-10 text-center text-gray-500">
            <p>No {tabLabels[tab].toLowerCase()} events yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tabData[tab].map((e: any) => (
              <EventCard key={e.id} event={e} isLive={false} />
            ))}
          </div>
        )
      )}
    </section>
  )
}
