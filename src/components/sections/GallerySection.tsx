'use client'

import { useState } from 'react'
import { Video, Image as ImageIcon, Cpu, Calendar, MapPin } from 'lucide-react'
import { formatDateShort } from '@/lib/utils'

function cityState(location: string | null): string | null {
  if (!location) return null
  const parts = location.split(',').map(p => p.trim())
  if (parts.length >= 3) {
    const city = parts[parts.length - 3]
    const state = parts[parts.length - 2].trim().split(' ')[0]
    if (city && state) return `${city}, ${state}`
  }
  return null
}

const TABS = ['all', 'video', 'photo'] as const

function MediaCard({ item }: { item: any }) {
  if (item.type === 'video') {
    const isYt = item.url.includes('youtube') || item.url.includes('youtu.be')
    const embedUrl = isYt ? item.url.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/') : item.url
    return (
      <div className="card overflow-hidden">
        <div className="aspect-video bg-[#1a1a1a]">
          {isYt
            ? <iframe src={embedUrl} className="w-full h-full" allowFullScreen title={item.title} />
            : <video src={item.url} controls className="w-full h-full" />
          }
        </div>
        {item.title && <p className="p-3 text-sm font-semibold">{item.title}</p>}
      </div>
    )
  }
  if (item.type === 'cad') {
    return (
      <div className="card overflow-hidden flex flex-col">
        <div className="aspect-video bg-[#1a1a1a] flex items-center justify-center">
          {item.thumbnail_url
            ? <img src={item.thumbnail_url} alt={item.title} className="w-full h-full object-cover" />
            : <Cpu size={40} className="text-orange-500/40" />
          }
        </div>
        <div className="p-3">
          {item.title && <p className="text-sm font-semibold">{item.title}</p>}
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-orange-500 hover:underline mt-1 block">
              Download CAD →
            </a>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="card overflow-hidden">
      <div className="aspect-video bg-[#1a1a1a]">
        <img src={item.url} alt={item.title ?? 'Gallery image'} className="w-full h-full object-cover" />
      </div>
      <div className="p-3">
        {item.title && <p className="text-sm font-semibold">{item.title}</p>}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {item.media_robot_tags?.map((t: any) => (
            <span key={t.robot?.id} className="text-xs bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded-full">{t.robot?.name}</span>
          ))}
          {item.event?.title && (
            <span className="text-xs bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full">{item.event.title}</span>
          )}
        </div>
        {item.event && (
          <div className="mt-1.5 flex flex-col gap-0.5">
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

export default function GallerySection({ media }: { media: any[] }) {
  const [tab, setTab] = useState<typeof TABS[number]>('all')
  const filtered = tab === 'all' ? media : media.filter(m => m.type === tab)
  const icons = { all: null, video: <Video size={14} />, photo: <ImageIcon size={14} /> }

  return (
    <section id="gallery">
      <h2 className="section-title">Gallery</h2>
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors
              ${tab === t ? 'bg-orange-500 text-white' : 'border border-[#2a2a2a] text-gray-400 hover:border-orange-500 hover:text-orange-500'}`}>
            {icons[t]} {t === 'cad' ? 'CAD' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">
          <ImageIcon size={40} className="mx-auto mb-3 opacity-30" />
          <p>No {tab === 'all' ? '' : tab + ' '}content yet — check back soon or submit your own!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item: any) => <MediaCard key={item.id} item={item} />)}
        </div>
      )}
    </section>
  )
}
