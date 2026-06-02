import { createClient } from '@/lib/supabase/server'
import { ROBOTS_SEED } from '@/lib/robots-data'
import { notFound } from 'next/navigation'
import { Cpu, Trophy, Calendar } from 'lucide-react'
import { formatDateShort } from '@/lib/utils'

export const revalidate = 3600

export default async function RobotPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  let robot: any = null
  let results: any[] = []
  let media: any[] = []

  try {
    const supabase = await createClient()
    const { data } = await supabase.from('robots').select('*').eq('slug', slug).single()
    robot = data

    if (robot) {
      const [resultsRes, mediaRes] = await Promise.all([
        supabase.from('robot_results').select('*, event:events(*)').eq('robot_id', robot.id).order('created_at', { ascending: false }),
        supabase.from('media').select('*').eq('robot_id', robot.id).eq('approved', true).order('created_at', { ascending: false }),
      ])
      results = resultsRes.data ?? []
      media = mediaRes.data ?? []
    }
  } catch {}

  if (!robot) {
    const seed = ROBOTS_SEED.find(r => r.slug === slug)
    if (!seed) notFound()
    robot = { ...seed, id: slug, active: true, created_at: '' }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="card p-8 mb-8">
        <div className="flex flex-col sm:flex-row gap-8">
          <div className="w-full sm:w-48 aspect-square bg-[#1a1a1a] rounded-xl flex items-center justify-center overflow-hidden shrink-0">
            {robot.image_url
              ? <img src={robot.image_url} alt={robot.name} className="w-full h-full object-cover" />
              : <Cpu size={64} className="text-orange-500/30" />
            }
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-black mb-2">{robot.name}</h1>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="bg-orange-500/10 text-orange-400 px-3 py-1 rounded-full text-sm font-semibold">{robot.weight_class}</span>
              {robot.weapon_type && robot.weapon_type !== 'Unknown' && (
                <span className="bg-[#2a2a2a] text-gray-300 px-3 py-1 rounded-full text-sm">{robot.weapon_type}</span>
              )}
            </div>
            {robot.description && <p className="text-gray-300 leading-relaxed">{robot.description}</p>}
          </div>
        </div>
      </div>

      {results.length > 0 && (
        <section className="mb-10">
          <h2 className="section-title">Event Results</h2>
          <div className="flex flex-col gap-3">
            {results.map((r: any) => (
              <div key={r.id} className="card p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{r.event?.title ?? 'Unknown event'}</p>
                  {r.event?.start_date && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      <Calendar size={11} /> {formatDateShort(r.event.start_date)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-400 font-bold">{r.wins}W</span>
                  <span className="text-red-400 font-bold">{r.losses}L</span>
                  {r.placement && (
                    <span className="flex items-center gap-1 text-yellow-400 font-bold">
                      <Trophy size={13} /> {r.placement}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {media.length > 0 && (
        <section>
          <h2 className="section-title">Media</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {media.map((m: any) => (
              <div key={m.id} className="card overflow-hidden">
                <div className="aspect-video bg-[#1a1a1a]">
                  {m.type === 'video'
                    ? <iframe src={m.url.replace('watch?v=', 'embed/')} className="w-full h-full" allowFullScreen />
                    : <img src={m.url} alt={m.title} className="w-full h-full object-cover" />
                  }
                </div>
                {m.title && <p className="p-3 text-sm font-semibold">{m.title}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
