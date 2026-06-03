import { createClient } from '@/lib/supabase/server'
import { ROBOTS_SEED } from '@/lib/robots-data'
import Link from 'next/link'
import { Cpu } from 'lucide-react'

export const revalidate = 300

export default async function RobotsPage() {
  let robots: any[] = []
  try {
    const supabase = await createClient()
    const [robotsRes, countsRes] = await Promise.all([
      supabase.from('robots').select('*').eq('active', true),
      supabase.from('robot_results').select('robot_id'),
    ])
    const counts: Record<string, number> = {}
    for (const r of countsRes.data ?? []) {
      counts[r.robot_id] = (counts[r.robot_id] ?? 0) + 1
    }
    robots = (robotsRes.data ?? []).sort((a: any, b: any) => {
      const diff = (counts[b.id] ?? 0) - (counts[a.id] ?? 0)
      return diff !== 0 ? diff : a.name.localeCompare(b.name)
    })
  } catch {}

  const displayRobots = robots.length > 0 ? robots : ROBOTS_SEED.map((r, i) => ({ ...r, id: i.toString(), active: true, created_at: '' }))

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="section-title">The Robots</h1>
      <p className="text-gray-400 mb-10 max-w-2xl">
        Team Scrap Yard fields robots across multiple weight classes on NHRL and robotcombatevents.com circuits.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayRobots.map((robot: any) => (
          <Link key={robot.id} href={`/robots/${robot.slug}`}
            className="card p-6 flex flex-col gap-4 hover:border-orange-500/50 transition-colors group">
            <div className="aspect-video bg-[#1a1a1a] rounded-lg flex items-center justify-center overflow-hidden">
              {robot.image_url
                ? <img src={robot.image_url} alt={robot.name} className="w-full h-full object-cover" />
                : <Cpu size={48} className="text-orange-500/30 group-hover:text-orange-500/60 transition-colors" />
              }
            </div>
            <div>
              <h2 className="text-xl font-black">{robot.name}</h2>
              <div className="flex gap-3 mt-1 text-sm text-gray-400">
                <span className="bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded text-xs font-semibold">{robot.weight_class}</span>
                {robot.weapon_type && robot.weapon_type !== 'Unknown' && (
                  <span className="bg-[#2a2a2a] px-2 py-0.5 rounded text-xs">{robot.weapon_type}</span>
                )}
              </div>
              {robot.description && (
                <p className="text-sm text-gray-400 mt-3 line-clamp-3">{robot.description}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
