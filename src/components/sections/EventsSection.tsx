'use client'

import { useState } from 'react'
import { Calendar, MapPin, Radio, Clock, Trophy } from 'lucide-react'
import Link from 'next/link'
import { formatDateShort } from '@/lib/utils'

function EventCard({ event, isLive = false }: { event: any; isLive?: boolean }) {
  return (
    <div className={`card p-5 flex flex-col gap-3 ${isLive ? 'border-orange-500 live-badge' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold text-base leading-tight">{event.title}</h3>
        {isLive && (
          <span className="flex items-center gap-1 text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full font-bold shrink-0">
            <Radio size={10} /> LIVE
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 text-sm text-gray-400">
        <span className="flex items-center gap-1.5">
          <Calendar size={13} /> {formatDateShort(event.start_date)}
          {event.end_date && event.end_date !== event.start_date && ` – ${formatDateShort(event.end_date)}`}
        </span>
        {event.location && (
          <span className="flex items-center gap-1.5"><MapPin size={13} /> {event.location}</span>
        )}
        {event.event_source && (
          <span className="text-xs uppercase tracking-wide text-orange-500/70">{event.event_source}</span>
        )}
      </div>
      {event.description && <p className="text-sm text-gray-400 line-clamp-2">{event.description}</p>}
      <div className="flex gap-2 mt-auto pt-2">
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

const TABS = ['current', 'upcoming', 'past'] as const

export default function EventsSection({ past, current, upcoming }: { past: any[]; current: any[]; upcoming: any[] }) {
  const defaultTab = current.length > 0 ? 'current' : upcoming.length > 0 ? 'upcoming' : 'past'
  const [tab, setTab] = useState<typeof TABS[number]>(defaultTab)

  const tabData = { current, upcoming, past }
  const tabIcons = { current: <Radio size={14} />, upcoming: <Clock size={14} />, past: <Trophy size={14} /> }
  const tabLabels = { current: 'Live Now', upcoming: 'Upcoming', past: 'Past' }

  return (
    <section id="events">
      <h2 className="section-title">Events</h2>
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors
              ${tab === t ? 'bg-orange-500 text-white' : 'border border-[#2a2a2a] text-gray-400 hover:border-orange-500 hover:text-orange-500'}`}>
            {tabIcons[t]} {tabLabels[t]}
            {tabData[t].length > 0 && (
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${tab === t ? 'bg-orange-600' : 'bg-[#2a2a2a]'}`}>
                {tabData[t].length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tabData[tab].length === 0 ? (
        <div className="card p-10 text-center text-gray-500">
          <p>No {tabLabels[tab].toLowerCase()} events yet.</p>
          {tab === 'current' && <p className="text-sm mt-1">Check back during event weekends!</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tabData[tab].map((e: any) => (
            <EventCard key={e.id} event={e} isLive={tab === 'current'} />
          ))}
        </div>
      )}
    </section>
  )
}
