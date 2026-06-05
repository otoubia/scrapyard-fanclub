'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Clock, RefreshCw, Cpu, Calendar, Plus, Trash2, Image as ImageIcon, Video, Pencil, Save, Search } from 'lucide-react'

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
  const [allEvents, setAllEvents] = useState<any[]>([])
  const [editBotSearch, setEditBotSearch] = useState<Record<string, string>>({})
  const [editEventSearch, setEditEventSearch] = useState<Record<string, string>>({})
  const [pendingMedia, setPendingMedia] = useState<any[]>([])
  const [approvedMedia, setApprovedMedia] = useState<any[]>([])
  const [mediaLoading, setMediaLoading] = useState(false)
  const [editingMedia, setEditingMedia] = useState<Record<string, { title: string; caption: string; robot_ids: string[]; event_id: string }>>({})

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
      fetchPendingMedia(secret)
      // Load all events for editing
      fetch('/api/admin/all-events', { headers: { authorization: `Bearer ${secret}` } })
        .then(r => r.ok ? r.json() : []).then(setAllEvents).catch(() => {})
    } finally { setLoading(false) }
  }

  async function fetchRegistrations(secret: string) {
    setRegLoading(true)
    try {
      const res = await fetch('/api/admin/registrations', { headers: { authorization: `Bearer ${secret}` } })
      if (res.ok) setRegData(await res.json())
    } finally { setRegLoading(false) }
  }

  async function fetchPendingMedia(secret: string) {
    setMediaLoading(true)
    try {
      const res = await fetch('/api/admin/media', { headers: { authorization: `Bearer ${secret}` } })
      if (res.ok) {
        const data = await res.json()
        setPendingMedia(data.pending ?? [])
        setApprovedMedia(data.approved ?? [])
      }
    } finally { setMediaLoading(false) }
  }

  async function handleMediaApprove(id: string, approved: boolean) {
    const edits = editingMedia[id]
    await fetch('/api/admin/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
      body: JSON.stringify({
        id, approved,
        title: edits?.title,
        caption: edits?.caption,
        robot_ids: edits?.robot_ids,
        event_id: edits?.event_id,
      }),
    })
    fetchPendingMedia(password)
  }

  async function handleMediaDelete(id: string) {
    await fetch('/api/admin/media', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
      body: JSON.stringify({ id }),
    })
    fetchPendingMedia(password)
  }

  function startEdit(item: any) {
    setEditingMedia(prev => ({
      ...prev,
      [item.id]: {
        title: item.title ?? '',
        caption: item.caption ?? '',
        robot_ids: item.media_robot_tags?.map((t: any) => t.robot?.id).filter(Boolean) ?? [],
        event_id: item.event?.id ?? '',
      }
    }))
  }

  function stopEdit(id: string) {
    setEditingMedia(prev => { const n = { ...prev }; delete n[id]; return n })
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="section-title mb-0">Admin Panel</h1>
        <button onClick={triggerSync} disabled={syncing || !!syncingSlug}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync Everything'}
        </button>
      </div>

      {/* Live event tracking */}
      <div className="mb-6 card p-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-bold text-sm">🔴 Live Event Tracking</p>
          <p className="text-xs text-gray-500 mt-0.5">Check for active NHRL fights happening right now</p>
          {liveSummary && <p className="text-xs mt-1 text-red-400">{liveSummary}</p>}
        </div>
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
          className="flex items-center gap-2 border border-red-500 text-red-400 hover:bg-red-500/10 px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 shrink-0">
          <RefreshCw size={13} className={syncingLive ? 'animate-spin' : ''} />
          {syncingLive ? 'Checking...' : 'Check Now'}
        </button>
      </div>

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

      {/* Pending Media */}
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <ImageIcon size={18} className="text-purple-400" /> Pending Media ({pendingMedia.length})
        </h2>
        {mediaLoading && <p className="text-gray-500 text-sm">Loading...</p>}
        {!mediaLoading && pendingMedia.length === 0 && <p className="text-gray-500 text-sm">No pending media.</p>}
        <div className="flex flex-col gap-4">
          {pendingMedia.map((item: any) => {
            const isYt = item.url?.includes('youtube') || item.url?.includes('youtu.be')
            const bots = item.media_robot_tags?.map((t: any) => t.robot?.name).filter(Boolean) ?? []
            const editing = editingMedia[item.id]
            return (
              <div key={item.id} className="card p-4 flex gap-4">
                <div className="w-32 h-24 bg-[#1a1a1a] rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                  {item.type === 'photo'
                    ? <img src={item.url} alt={item.title ?? ''} className="w-full h-full object-cover" />
                    : isYt
                      ? <img src={`https://img.youtube.com/vi/${item.url.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1]}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />
                      : <Video size={24} className="text-gray-600" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <div className="flex flex-col gap-2">
                      <input value={editing.title} onChange={e => setEditingMedia(p => ({ ...p, [item.id]: { ...p[item.id], title: e.target.value } }))}
                        className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-500"
                        placeholder="Title" />
                      <textarea value={editing.caption} onChange={e => setEditingMedia(p => ({ ...p, [item.id]: { ...p[item.id], caption: e.target.value } }))}
                        className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-500 resize-none"
                        rows={2} placeholder="Caption" />
                      {/* Bot tags */}
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Bots</p>
                        <div className="flex flex-wrap gap-1">
                          {robots.map((r: any) => {
                            const selected = editing.robot_ids.includes(r.id)
                            return (
                              <button key={r.id} type="button"
                                onClick={() => setEditingMedia(p => ({
                                  ...p, [item.id]: {
                                    ...p[item.id],
                                    robot_ids: selected
                                      ? p[item.id].robot_ids.filter((rid: string) => rid !== r.id)
                                      : [...p[item.id].robot_ids, r.id]
                                  }
                                }))}
                                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${selected ? 'bg-orange-500 border-orange-500 text-white' : 'border-[#333] text-gray-500 hover:border-orange-500'}`}>
                                {r.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      {/* Event tag */}
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Event</p>
                        <select value={editing.event_id}
                          onChange={e => setEditingMedia(p => ({ ...p, [item.id]: { ...p[item.id], event_id: e.target.value } }))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-500">
                          <option value="">No event</option>
                          {regData?.events?.map((e: any) => (
                            <option key={e.id} value={e.id}>{e.title}</option>
                          ))}
                        </select>
                      </div>
                      <button onClick={() => stopEdit(item.id)} className="text-xs text-gray-500 hover:text-gray-300 text-left">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <p className="font-semibold text-sm truncate">{item.title || item.url}</p>
                      {item.caption && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{item.caption}</p>}
                    </>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {bots.map((b: string) => <span key={b} className="text-xs bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded-full">{b}</span>)}
                    {item.event?.title && <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">{item.event.title}</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button onClick={() => handleMediaApprove(item.id, true)}
                    className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded font-bold">
                    <CheckCircle size={11} /> Approve
                  </button>
                  {editing
                    ? <button onClick={() => handleMediaApprove(item.id, true)}
                        className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded font-bold">
                        <Save size={11} /> Save
                      </button>
                    : <button onClick={() => startEdit(item)}
                        className="flex items-center gap-1 text-xs border border-[#333] text-gray-400 hover:border-orange-500 hover:text-orange-400 px-3 py-1.5 rounded font-bold">
                        <Pencil size={11} /> Edit
                      </button>
                  }
                  <button onClick={() => handleMediaDelete(item.id)}
                    className="flex items-center gap-1 text-xs bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded font-bold">
                    <XCircle size={11} /> Reject
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Approved media */}
      {approvedMedia.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <CheckCircle size={18} className="text-green-400" /> Approved Media ({approvedMedia.length})
          </h2>
          <div className="flex flex-col gap-3">
            {approvedMedia.map((item: any) => {
              const bots = item.media_robot_tags?.map((t: any) => t.robot?.name).filter(Boolean) ?? []
              const editing = editingMedia[item.id]
              return (
                <div key={item.id} className="card p-4 flex gap-4">
                  <div className="w-24 h-18 bg-[#1a1a1a] rounded overflow-hidden shrink-0 flex items-center justify-center" style={{minHeight:'4.5rem'}}>
                    {item.type === 'photo'
                      ? <img src={item.url} alt="" className="w-full h-full object-cover" />
                      : <Video size={20} className="text-gray-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    {editing ? (
                      <div className="flex flex-col gap-2">
                        <input value={editing.title} onChange={e => setEditingMedia(p => ({ ...p, [item.id]: { ...p[item.id], title: e.target.value } }))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-500" placeholder="Title" />
                        <textarea value={editing.caption} onChange={e => setEditingMedia(p => ({ ...p, [item.id]: { ...p[item.id], caption: e.target.value } }))}
                          className="w-full bg-[#111] border border-[#333] rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-500 resize-none" rows={2} placeholder="Caption" />
                        {/* Bot search + tags */}
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Bots</p>
                          <div className="relative mb-1.5">
                            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input value={editBotSearch[item.id] ?? ''} onChange={e => setEditBotSearch(p => ({ ...p, [item.id]: e.target.value }))}
                              className="w-full bg-[#111] border border-[#333] rounded pl-6 pr-2 py-1 text-xs focus:outline-none focus:border-orange-500" placeholder="Search bots..." />
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                            {robots.filter((r: any) => r.name.toLowerCase().includes((editBotSearch[item.id] ?? '').toLowerCase())).map((r: any) => {
                              const selected = editing.robot_ids.includes(r.id)
                              return (
                                <button key={r.id} type="button"
                                  onClick={() => setEditingMedia(p => ({ ...p, [item.id]: { ...p[item.id], robot_ids: selected ? p[item.id].robot_ids.filter((rid: string) => rid !== r.id) : [...p[item.id].robot_ids, r.id] } }))}
                                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${selected ? 'bg-orange-500 border-orange-500 text-white' : 'border-[#333] text-gray-500 hover:border-orange-500'}`}>
                                  {r.name}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        {/* Event search */}
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Event</p>
                          {editing.event_id && (
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                                {allEvents.find(e => e.id === editing.event_id)?.title ?? 'Selected'}
                              </span>
                              <button type="button" onClick={() => setEditingMedia(p => ({ ...p, [item.id]: { ...p[item.id], event_id: '' } }))}
                                className="text-xs text-gray-500 hover:text-red-400"><XCircle size={11} /></button>
                            </div>
                          )}
                          <div className="relative mb-1">
                            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input value={editEventSearch[item.id] ?? ''} onChange={e => setEditEventSearch(p => ({ ...p, [item.id]: e.target.value }))}
                              className="w-full bg-[#111] border border-[#333] rounded pl-6 pr-2 py-1 text-xs focus:outline-none focus:border-orange-500" placeholder="Search events..." />
                          </div>
                          {(editEventSearch[item.id] ?? '').length > 0 && (
                            <div className="flex flex-col gap-0.5 max-h-28 overflow-y-auto border border-[#222] rounded">
                              {allEvents.filter(e => e.title.toLowerCase().includes((editEventSearch[item.id] ?? '').toLowerCase())).slice(0, 10).map(e => (
                                <button key={e.id} type="button"
                                  onClick={() => { setEditingMedia(p => ({ ...p, [item.id]: { ...p[item.id], event_id: e.id } })); setEditEventSearch(p => ({ ...p, [item.id]: '' })) }}
                                  className="text-left text-xs px-2 py-1.5 hover:bg-[#1a1a1a] text-gray-300 transition-colors">
                                  {e.title}
                                  <span className="text-gray-600 ml-2 text-xs">
                                    {e.start_date && !e.start_date.startsWith('2020') ? new Date(e.start_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button onClick={() => stopEdit(item.id)} className="text-xs text-gray-500 hover:text-gray-300 text-left">Cancel</button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-semibold truncate">{item.title || item.url}</p>
                        {item.caption && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.caption}</p>}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {bots.map((b: string) => <span key={b} className="text-xs bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded-full">{b}</span>)}
                          {item.event?.title && <span className="text-xs bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full">{item.event.title}</span>}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {editing ? (
                      <button onClick={async () => { await handleMediaApprove(item.id, true); stopEdit(item.id) }}
                        className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded font-bold">
                        <Save size={11} /> Save
                      </button>
                    ) : (
                      <button onClick={() => startEdit(item)}
                        className="flex items-center gap-1 text-xs border border-[#333] text-gray-400 hover:border-orange-500 hover:text-orange-400 px-3 py-1.5 rounded font-bold">
                        <Pencil size={11} /> Edit
                      </button>
                    )}
                    <button onClick={() => handleMediaDelete(item.id)}
                      className="flex items-center gap-1 text-xs border border-red-700 text-red-400 hover:bg-red-700/10 px-3 py-1.5 rounded">
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

    </div>
  )
}
