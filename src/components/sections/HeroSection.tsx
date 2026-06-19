import Link from 'next/link'
import { Zap, Radio } from 'lucide-react'

export default function HeroSection({ currentEvents }: { currentEvents: any[] }) {
  const liveEvent = currentEvents[0]

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-[#0a0a0a] via-[#1a0a00] to-[#0a0a0a] border-b border-[#2a2a2a]">
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, #f97316 0, #f97316 1px, transparent 0, transparent 50%)',
        backgroundSize: '20px 20px'
      }} />
      <div className="relative max-w-7xl mx-auto px-4 py-24 text-center">
        <div className="flex items-center justify-center gap-3 mb-6">
          <Zap className="text-orange-500" size={36} />
          <h1 className="text-5xl md:text-7xl font-black tracking-tight">
            SCRAP<span className="text-orange-500">YARD</span>
          </h1>
          <Zap className="text-orange-500" size={36} />
        </div>
        <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-8">
          Fan club for Team Scrap Yard — competitive combat robotics across NHRL and beyond.
        </p>

        {liveEvent && (
          <div className="inline-flex items-center gap-3 bg-orange-500/10 border border-orange-500 rounded-xl px-6 py-4 mb-8 live-badge">
            <Radio className="text-orange-500 animate-pulse" size={20} />
            <Link href="#live-events" className="font-bold text-orange-400 hover:text-orange-300 transition-colors">LIVE NOW: {liveEvent.title}</Link>
            {liveEvent.truefinals_url && (
              <Link href={liveEvent.truefinals_url} target="_blank"
                className="bg-orange-500 text-white font-bold text-sm px-3 py-1 rounded hover:bg-orange-600 transition-colors">
                Watch
              </Link>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="#events" className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-lg transition-colors">
            View Events
          </Link>
          <Link href="/robots" className="border border-orange-500 text-orange-500 hover:bg-orange-500/10 font-bold px-6 py-3 rounded-lg transition-colors">
            Meet the Robots
          </Link>
          <Link href="/submit" className="border border-[#2a2a2a] text-gray-300 hover:border-orange-500 font-bold px-6 py-3 rounded-lg transition-colors">
            Submit Content
          </Link>
        </div>
      </div>
    </section>
  )
}
