'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X, Zap } from 'lucide-react'

const links = [
  { href: '/#events', label: 'Events' },
  { href: '/#highlights', label: 'Highlights' },
  { href: '/#gallery', label: 'Gallery' },
  { href: '/robots', label: 'Robots' },
  { href: '/submit', label: 'Submit' },
]

export default function Nav() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 bg-[#0a0a0a]/90 backdrop-blur border-b border-[#2a2a2a]">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2 font-black text-xl tracking-tight">
          <Zap className="text-orange-500" size={22} />
          <span>SCRAP<span className="text-orange-500">YARD</span></span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {links.map(l => (
            <Link key={l.href} href={l.href}
              className="text-sm font-semibold uppercase tracking-wide text-gray-300 hover:text-orange-500 transition-colors">
              {l.label}
            </Link>
          ))}
          <Link href="/admin" className="text-xs bg-orange-500 hover:bg-orange-600 text-white font-bold px-3 py-1.5 rounded transition-colors">
            Admin
          </Link>
        </div>

        <button className="md:hidden text-gray-300" onClick={() => setOpen(!open)}>
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-[#141414] border-t border-[#2a2a2a] px-4 py-4 flex flex-col gap-4">
          {links.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
              className="text-sm font-semibold uppercase tracking-wide text-gray-300 hover:text-orange-500">
              {l.label}
            </Link>
          ))}
          <Link href="/admin" onClick={() => setOpen(false)}
            className="text-xs bg-orange-500 text-white font-bold px-3 py-1.5 rounded w-fit">
            Admin
          </Link>
        </div>
      )}
    </nav>
  )
}
