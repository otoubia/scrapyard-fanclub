import { Zap } from 'lucide-react'
import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-[#2a2a2a] mt-16 py-8 text-center text-sm text-gray-500">
      <div className="flex items-center justify-center gap-2 mb-2">
        <Zap className="text-orange-500" size={16} />
        <span className="font-black text-white">SCRAP<span className="text-orange-500">YARD</span></span>
      </div>
      <p>Fan club for Team Scrap Yard — Combat Robotics</p>
      <div className="flex items-center justify-center gap-4 mt-3">
        <Link href="https://www.tiktok.com/@scrap.yard.roboti" target="_blank" className="hover:text-orange-500 transition-colors">TikTok</Link>
        <Link href="https://www.nhrl.io/" target="_blank" className="hover:text-orange-500 transition-colors">NHRL</Link>
        <Link href="https://www.robotcombatevents.com" target="_blank" className="hover:text-orange-500 transition-colors">RCE</Link>
      </div>
    </footer>
  )
}
