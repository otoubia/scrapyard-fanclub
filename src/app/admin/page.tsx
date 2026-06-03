'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Clock, RefreshCw, Cpu, Calendar, Plus, Trash2 } from 'lucide-react'

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [posts, setPosts] = useState<any[]>([])
  const [robots, setRobots] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncingSlug, setSyncingSlug] = useState<string | null>(null)
  const [resultsSummary, setResultsSummary] = useState<string | null>(null)
  const [syncingLive, setSyncingLive] = useState(false)
  const [liveSummary, setLiveSummary] = useState<string | null>(null)
  const [regData, setRegData] = useState<{ events: any[], robots: any[], registrations: Record<string, {resultId: string, robotId: string}[]> } | null>(null)
  const [regLoading, setRegLoading] = useState(false)

  async function fetchPosts(secret: string) {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/posts', { headers: { authorization: `Bearer ${secret}` } })
      if (!res.ok) { setAuthed(false); return }
      setPosts(await res.json())
      setAuthed(true)
      const robotsRes = await fetch('/api/admin/robots', { headers: { authorization: `Bearer ${secret}` } })
      if (robotsRes.ok) setRobots(await robotsRes.json())
      fetchRegistrations(secret)
    } finally { setLoading(false) }
  }

  async function fetchRegistrations(secret: string) {
    setRegLoading(true)
    try {
      const res = await fetch('/api/admin/registrations', { headers: { authorization: `Bearer ${secret}` } })
      if (res.ok) setRegData(await res.json())
    } finally { setRegLoading(false) }
  }

  async function toggleRegistration(robotId: string, eventId: string, isRegistered: boolean) {
    await fetch('/api/admin/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
      body: JSON.stringify({ action: isRegistered ? 'remove' : 'add', robotId, eventId }),
    })
    fetchRegistrations(password)
  }

  async function handleApprove(id: string, approved: boolean) {
    await fetch('/api/admin/approve-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
      body: JSON.stringify({ id, approved }),
    })
    fetchPosts(password)
  }

  async function syncOneBot(slug: string) {
    setSyncingSlug(slug)
    setResultsSummary(null)
    try {
      const res = await fetch(`/api/cron/sync-robot-results?slug=${slug}`, { headers: { authorization: `Bearer ${password}` } })
      const data = await res.json()
      const name = Object.keys(data.perRobot ?? {})[0] ?? slug
      const count = data.totalResults ?? 0
      const highlights = data.totalHighlights ?? 0
      const fixed = data.fixedDates ?? 0
      setResultsSummary(`✅ ${name}: ${count} results, ${highlights} highlights${fixed ? `, ${fixed} dates fixed` : ''}`)
    } finally { setSyncingSlug(null) }
  }

  async function triggerSync() {
    setSyncing(true)
    setResultsSummary(null)
    try {
      const slugs = robots.length
        ? robots.map((r: any) => r.slug)
        : ['maccabot','trampoline','control-freak','split-decision','power-off','power-on','joyful-timeline','twitch','tinkerbot','sarissa','last-minute','last-second','fart','salt-and-pepper','dumb-and-dumber']
      let totalResults = 0, totalHighlights = 0, totalFixed = 0
      for (let i = 0; i < slugs.length; i++) {
        setResultsSummary(`Syncing... ${i + 1}/${slugs.length}: ${slugs[i]}`)
        const res = await fetch(`/api/cron/sync-robot-results?slug=${slugs[i]}`, { headers: { authorization: `Bearer ${password}` } })
        const data = await res.json()
        totalResults += data.totalResults || 0
        totalHighlights += data.totalHighlights || 0
        totalFixed += data.fixedDates || 0
        await new Promise(r => setTimeout(r, 1500))
      }
      setResultsSummary(`Syncing NHRL...`)
      const nhrlRes = await fetch('/api/cron/sync-nhrl', { headers: { authorization: `Bearer ${password}` } })
      const nhrlData = await nhrlRes.json()
      setResultsSummary(`✅ Done! ${totalResults} results, ${totalHighlights} highlights, ${totalFixed} dates fixed | NHRL: ${nhrlData.eventsAdded ?? 0} added, ${nhrlData.resultsAdded ?? 0} results`)
    } finally { setSyncing(false) }
  }

  if (!authed) {
    return (
      <div className="max-w-sm mx-auto px-4 py-24">
        <h1 className="text-2xl font-black mb-6">Admin Login</h1>
        <form onSubmit={e => { e.preventDefault(); fetchPosts(password) }} className="flex flex-col gap-4">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
            placeholder="Admin password" />
          <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 rounded-lg">Login</button>
        </form>
      </div>
    )
  }

  const pending = posts.filter(p => !p.approved)
  const approved = posts.filter(p => p.approved)

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="section-title mb-0">Admin Panel</h1>
        <div className="flex gap-2">
          <button onClick={triggerSync} disabled={syncing || !!syncingSlug}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Everything'}
          </button>
          <button onClick={async () => {
            setSyncingLive(true); setLiveSummary(null)
            try {
              const res = await fetch('/api/cron/sync-live', { headers: { authorization: `Bearer ${password}` } })
              const d = await res.json()
              setLiveSummary(d.live
                ? `🔴 LIVE: ${d.liveBots.join(', ')} at ${d.activeTournaments.join(', ')}`
                : `No active event (${d.totalRecentFights ?? 0} fights in last 24h)`)
            } finally { setSyncingLive(false) }
          }} disabled={syncingLive}
            className="flex items-center gap-2 border border-red-500 text-red-400 hover:bg-red-500/10 px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={syncingLive ? 'animate-spin' : ''} />
            {syncingLive ? 'Checking...' : '🔴 Sync Live'}
          </button>
        </div>
      </div>

      {liveSummary && (
        <div className="mb-4 card p-3 text-sm text-red-400">{liveSummary}</div>
      )}
      {resultsSummary && (
        <div className="mb-6 card p-4 text-sm text-green-400 whitespace-pre-wrap">{resultsSummary}</div>
      )}

      {/* Upcoming Event Registrations */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Calendar size={16} className="text-blue-400" /> Upcoming Event Registrations
        </h2>
        {regLoading && <p className="text-gray-500 text-sm">Loading...</p>}
        {regData && regData.events.length === 0 && <p className="text-gray-500 text-sm">No upcoming events.</p>}
        {regData && regData.events.length > 0 && (
          <div className="flex flex-col gap-4">
            {regData.events.map((event: any) => {
              const regs = regData.registrations[event.id] ?? []
              const registeredIds = new Set(regs.map((r: any) => r.robotId))
              return (
                <div key={event.id} className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-sm">{event.title}</p>
                      <p className="text-xs text-gray-500">{event.start_date ? new Date(event.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''} · {event.event_source?.toUpperCase()}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {regData.robots.map((robot: any) => {
                      const isReg = registeredIds.has(robot.id)
                      return (
                        <button key={robot.id}
                          onClick={() => toggleRegistration(robot.id, event.id, isReg)}
                          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            isReg
                              ? 'bg-orange-500/20 border-orange-500 text-orange-400 hover:bg-red-500/20 hover:border-red-500 hover:text-red-400'
                              : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-500 hover:border-orange-500 hover:text-orange-400'
                          }`}>
                          {isReg ? <Trash2 size={9} /> : <Plus size={9} />}
                          {robot.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Per-bot sync buttons */}
      {robots.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Cpu size={16} className="text-orange-400" /> Sync Individual Bot
          </h2>
          <div className="flex flex-wrap gap-2">
            {robots.map((robot: any) => (
              <button key={robot.slug}
                onClick={() => syncOneBot(robot.slug)}
                disabled={syncing || syncingSlug === robot.slug}
                className="flex items-center gap-1.5 text-xs border border-[#2a2a2a] text-gray-300 hover:border-orange-500 hover:text-orange-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
                <RefreshCw size={11} className={syncingSlug === robot.slug ? 'animate-spin' : ''} />
                {robot.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Clock size={18} className="text-yellow-400" /> Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-gray-500 text-sm">No pending posts.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {pending.map(post => (
              <div key={post.id} className="card p-5">
                <div className="flex justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold truncate">{post.title}</h3>
                    <p className="text-xs text-gray-500 mb-2">by {post.author_name} ({post.author_email})</p>
                    <p className="text-sm text-gray-400 line-clamp-3">{post.content}</p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button onClick={() => handleApprove(post.id, true)}
                      className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded font-bold">
                      <CheckCircle size={12} /> Approve
                    </button>
                    <button onClick={() => handleApprove(post.id, false)}
                      className="flex items-center gap-1 text-xs bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded font-bold">
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <CheckCircle size={18} className="text-green-400" /> Approved ({approved.length})
        </h2>
        <div className="flex flex-col gap-3">
          {approved.slice(0, 10).map(post => (
            <div key={post.id} className="card p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate">{post.title}</h3>
                <p className="text-xs text-gray-500">by {post.author_name}</p>
              </div>
              <button onClick={() => handleApprove(post.id, false)}
                className="text-xs border border-red-700 text-red-400 hover:bg-red-700/10 px-3 py-1.5 rounded shrink-0">
                Unpublish
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
