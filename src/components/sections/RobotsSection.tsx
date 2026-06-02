import Link from 'next/link'
import { Cpu, ChevronRight } from 'lucide-react'
import { ROBOTS_SEED } from '@/lib/robots-data'

export default function RobotsSection({ robots }: { robots: any[] }) {
  const displayRobots = robots.length > 0 ? robots : ROBOTS_SEED.map((r, i) => ({ ...r, id: i.toString(), active: true, created_at: '' }))

  return (
    <section id="robots">
      <div className="flex items-center justify-between mb-6">
        <h2 className="section-title mb-0">The Robots</h2>
        <Link href="/robots" className="text-sm text-orange-500 hover:underline flex items-center gap-1">
          View all <ChevronRight size={14} />
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {displayRobots.map((robot: any) => (
          <Link key={robot.id} href={`/robots/${robot.slug}`}
            className="card p-4 flex flex-col gap-3 hover:border-orange-500/50 transition-colors group">
            <div className="aspect-square bg-[#1a1a1a] rounded-lg flex items-center justify-center overflow-hidden">
              {robot.image_url
                ? <img src={robot.image_url} alt={robot.name} className="w-full h-full object-cover" />
                : <Cpu size={32} className="text-orange-500/40 group-hover:text-orange-500/70 transition-colors" />
              }
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">{robot.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{robot.weight_class}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
