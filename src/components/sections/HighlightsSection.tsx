import { Trophy, Star, Zap, Calendar, MapPin } from 'lucide-react'
import { formatDateShort } from '@/lib/utils'

const typeConfig: Record<string, { label: string; color: string; Icon: any }> = {
  podium: { label: 'Podium Finish', color: 'text-yellow-400', Icon: Trophy },
  primetime: { label: '⚡ NHRL Prime Time', color: 'text-purple-400', Icon: Zap },
  knockout: { label: 'Knockout', color: 'text-orange-400', Icon: Zap },
  other: { label: 'Highlight', color: 'text-blue-400', Icon: Star },
}

export default function HighlightsSection({ highlights }: { highlights: any[] }) {
  return (
    <section id="highlights">
      <h2 className="section-title">Past Highlights</h2>
      {highlights.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">
          <Trophy size={40} className="mx-auto mb-3 opacity-30" />
          <p>Highlights coming soon — podium finishes and prime time appearances will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {highlights.map((h: any) => {
            const cfg = typeConfig[h.type] ?? typeConfig.other
            const Icon = cfg.Icon
            return (
              <div key={h.id} className="card p-5 flex flex-col gap-3">
                <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wide ${cfg.color}`}>
                  <Icon size={16} /> {cfg.label}
                </div>
                <h3 className="font-bold text-lg">{h.title}</h3>
                {h.description && <p className="text-sm text-gray-400">{h.description}</p>}
                <div className="text-xs text-gray-500 flex flex-col gap-1">
                  {h.robot?.name && <span>🤖 {h.robot.name}</span>}
                  {h.event?.start_date && !h.event.start_date.startsWith('2020') && (
                    <span className="flex items-center gap-1"><Calendar size={11} /> {formatDateShort(h.event.start_date)}</span>
                  )}
                  {h.event?.location && (
                    <span className="flex items-center gap-1"><MapPin size={11} /> {h.event.location}</span>
                  )}
                </div>
                {h.media_url && (
                  <div className="mt-2 rounded-lg overflow-hidden aspect-video bg-[#1a1a1a]">
                    {h.media_url.includes('youtube') || h.media_url.includes('youtu.be') ? (
                      <iframe src={h.media_url.replace('watch?v=', 'embed/')} className="w-full h-full" allowFullScreen />
                    ) : (
                      <img src={h.media_url} alt={h.title} className="w-full h-full object-cover" />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
