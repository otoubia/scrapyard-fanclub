'use client'

import { useState, useEffect, useRef } from 'react'
import { CheckCircle, XCircle, RefreshCw, Cpu, Calendar, Plus, Trash2, Image as ImageIcon, Video, Pencil, Save, Search, Link2, Radio, Tv, BarChart2, ExternalLink } from 'lucide-react'

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [loginError, setLoginError] = useState(false)
  const passwordInputRef = useRef<HTMLInputElement>(null)
  const [robots, setRobots] = useState<any[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncingSlug, setSyncingSlug] = useState<string | null>(null)
  const [resultsSummary, setResultsSummary] = useState<string | null>(null)
  const [regData, setRegData] = useState<{ events: any[], robots: any[], registrations: Record<string, {resultId: string, robotId: string, wins: number, losses: number}[]> } | null>(null)
  const [regLoading, setRegLoading] = useState(false)
  const [allEvents, setAllEvents] = useState<any[]>([])
  const [editBotSearch, setEditBotSearch] = useState<Record<string, string>>({})
  const [editEventSearch, setEditEventSearch] = useState<Record<string, string>>({})
  const [pendingMedia, setPendingMedia] = useState<any[]>([])
  const [approvedMedia, setApprovedMedia] = useState<any[]>([])
  const [mediaLoading, setMediaLoading] = useState(false)
  const [editingMedia, setEditingMedia] = useState<Record<string, { title: string; caption: string; robot_ids: string[]; event_id: string }>>({})
  const [linkCandidates, setLinkCandidates] = useState<any[]>([])
  const [linksLoading, setLinksLoading] = useState(false)
  const [newLink, setNewLink] = useState({ url: '', label: '', link_type: 'bracket' })
  const [linkSearch, setLinkSearch] = useState('')
  const [linkEvent, setLinkEvent] = useState<any>(null)
  const [linkEventLinks, setLinkEventLinks] = useState<any[]>([])
  const [linkEventLinksLoading, setLinkEventLinksLoading] = useState(false)
  const [eventDateSearch, setEventDateSearch] = useState('')
  const [editingDateEvent, setEditingDateEvent] = useState<any>(null)
  const [editingDates, setEditingDates] = useState({ title: '', location: '', start_date: '', end_date: '' })
  const [dateSaveStatus, setDateSaveStatus] = useState<string | null>(null)
  const [deleteEventStatus, setDeleteEventStatus] = useState<string | null>(null)
  const [pastRegSearch, setPastRegSearch] = useState('')
  const [pastRegEvent, setPastRegEvent] = useState<any>(null)
  const [pastRegData, setPastRegData] = useState<{ robots: any[], registrations: { resultId: string, robotId: string, wins: number, losses: number, placement: string | null }[] } | null>(null)
  const [pastRegLoading, setPastRegLoading] = useState(false)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [newEvent, setNewEvent] = useState({ title: '', start_date: '', end_date: '', event_source: 'nhrl', status: 'upcoming' })
  const [addEventLoading, setAddEventLoading] = useState(false)
  const [addEventError, setAddEventError] = useState<string | null>(null)
  const [addEventSuccess, setAddEventSuccess] = useState<string | null>(null)
  const [eventUrl, setEventUrl] = useState('')
  const [parsingUrl, setParsingUrl] = useState(false)
  const [showAddBot, setShowAddBot] = useState(false)
  const [newBot, setNewBot] = useState({ name: '', slug: '', weight_class: '', weapon_type: '', description: '', rce_url: '', image_url: '', active: true })
  const [addBotLoading, setAddBotLoading] = useState(false)
  const [addBotError, setAddBotError] = useState<string | null>(null)
  const [deletingBotId, setDeletingBotId] = useState<string | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('admin_secret')
    if (stored) { setPassword(stored); fetchPosts(stored) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchPosts(secret: string) {
    setLoginError(false)
    try {
      const res = await fetch('/api/admin/posts', { headers: { authorization: `Bearer ${secret}` } })
      if (!res.ok) { setAuthed(false); setLoginError(true); sessionStorage.removeItem('admin_secret'); return }
      sessionStorage.setItem('admin_secret', secret)
      setAuthed(true)
      const robotsRes = await fetch('/api/admin/robots', { headers: { authorization: `Bearer ${secret}` } })
      if (robotsRes.ok) setRobots(await robotsRes.json())
      fetchRegistrations(secret)
      fetchPendingMedia(secret)
      // Load all events for editing
      fetch('/api/admin/all-events', { headers: { authorization: `Bearer ${secret}` } })
        .then(r => r.ok ? r.json() : []).then(setAllEvents).catch(() => {})
    } finally {}
  }

  async function fetchEventLinks(eventId: string) {
    setLinkEventLinksLoading(true)
    try {
      const res = await fetch(`/api/admin/event-links?event_id=${eventId}`, { headers: { authorization: `Bearer ${password}` } })
      if (res.ok) setLinkEventLinks(await res.json())
    } finally { setLinkEventLinksLoading(false) }
  }

  async function selectLinkEvent(event: any) {
    setLinkEvent(event)
    setLinkSearch(event.title)
    setNewLink({ url: '', label: '', link_type: 'bracket' })
    await fetchEventLinks(event.id)
  }

  async function checkAutoLinks() {
    setLinksLoading(true)
    setLinkCandidates([])
    try {
      const res = await fetch('/api/admin/event-links?check=1', { headers: { authorization: `Bearer ${password}` } })
      if (res.ok) {
        const data = await res.json()
        setLinkCandidates(data.candidates ?? [])
      }
    } finally { setLinksLoading(false) }
  }

  async function saveCandidate(link: any) {
    await fetch('/api/admin/event-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
      body: JSON.stringify(link),
    })
    setLinkCandidates(prev => prev.filter(c => !(c.url === link.url && c.event_id === link.event_id)))
    if (linkEvent?.id === link.event_id) fetchEventLinks(link.event_id)
  }

  async function saveAllCandidates() {
    if (!linkCandidates.length) return
    await fetch('/api/admin/event-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
      body: JSON.stringify({ action: 'save-bulk', links: linkCandidates.map(({ event_id, url, label, link_type, source }: any) => ({ event_id, url, label, link_type, source })) }),
    })
    setLinkCandidates([])
    if (linkEvent) fetchEventLinks(linkEvent.id)
  }

  async function deleteLink(id: string) {
    await fetch('/api/admin/event-links', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
      body: JSON.stringify({ id }),
    })
    if (linkEvent) fetchEventLinks(linkEvent.id)
  }

  async function addManualLink() {
    if (!linkEvent || !newLink.url || !newLink.label) return
    await fetch('/api/admin/event-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
      body: JSON.stringify({ event_id: linkEvent.id, ...newLink, source: 'manual' }),
    })
    setNewLink({ url: '', label: '', link_type: 'bracket' })
    fetchEventLinks(linkEvent.id)
  }

  async function patchEventDates() {
    if (!editingDateEvent) return
    setDateSaveStatus('Saving...')
    const res = await fetch('/api/admin/events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
      body: JSON.stringify({ id: editingDateEvent.id, ...editingDates }),
    })
    setDateSaveStatus(res.ok ? '✅ Saved!' : '❌ Failed')
    if (res.ok) {
      setAllEvents(prev => prev.map(e => e.id === editingDateEvent.id ? { ...e, ...editingDates } : e))
      setEditingDateEvent((prev: any) => prev && { ...prev, ...editingDates })
      fetchRegistrations(password)
    }
  }

  async function deleteEvent() {
    if (!editingDateEvent) return
    if (!confirm(`Delete "${editingDateEvent.title}"? This also removes its registrations, recorded results, and links. This cannot be undone.`)) return
    setDeleteEventStatus('Deleting...')
    const res = await fetch('/api/admin/events', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
      body: JSON.stringify({ id: editingDateEvent.id }),
    })
    if (res.ok) {
      setAllEvents(prev => prev.filter(e => e.id !== editingDateEvent.id))
      setEditingDateEvent(null)
      setEventDateSearch('')
      setDateSaveStatus(null)
      setDeleteEventStatus(null)
      fetchRegistrations(password)
    } else {
      setDeleteEventStatus('❌ Failed to delete')
    }
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

  async function selectPastRegEvent(event: any) {
    setPastRegEvent(event)
    setPastRegData(null)
    setPastRegLoading(true)
    try {
      const res = await fetch(`/api/admin/registrations?event_id=${event.id}`, { headers: { authorization: `Bearer ${password}` } })
      if (res.ok) setPastRegData(await res.json())
    } finally { setPastRegLoading(false) }
  }

  async function togglePastRegistration(robotId: string, isRegistered: boolean) {
    if (!pastRegEvent) return
    await fetch('/api/admin/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
      body: JSON.stringify({ action: isRegistered ? 'remove' : 'add', robotId, eventId: pastRegEvent.id }),
    })
    selectPastRegEvent(pastRegEvent)
  }

  async function syncOneBot(slug: string) {
    setSyncingSlug(slug)
    setResultsSummary(null)
    try {
      const res = await fetch(`/api/cron/sync-robot-results?slug=${slug}`, { headers: { authorization: `Bearer ${password}` } })
      const data = await res.json()
      if (!res.ok) { setResultsSummary(`❌ ${slug}: ${data.error ?? 'sync failed'}`); return }
      const name = Object.keys(data.perRobot ?? {})[0] ?? slug
      const aborted = data.perRobot?.[name] === -1
      const rowErrors = data.debug?.[slug]?.robotRowErrors ?? 0
      const count = data.totalResults ?? 0
      const highlights = data.totalHighlights ?? 0
      const fixed = data.fixedDates ?? 0
      setResultsSummary(aborted
        ? `❌ ${name}: sync aborted with an error — check server logs`
        : `${rowErrors ? '⚠️' : '✅'} ${name}: ${count} results, ${highlights} highlights${fixed ? `, ${fixed} dates fixed` : ''}${rowErrors ? ` — ${rowErrors} row error(s), check server logs` : ''}`)
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
      const failedSlugs: string[] = []
      for (let i = 0; i < slugs.length; i++) {
        setResultsSummary(`Syncing... ${i + 1}/${slugs.length}: ${slugs[i]}`)
        const res = await fetch(`/api/cron/sync-robot-results?slug=${slugs[i]}`, { headers: { authorization: `Bearer ${password}` } })
        const data = await res.json()
        const hasRowErrors = data.debug?.[slugs[i]]?.robotRowErrors > 0
        if (!res.ok || Object.values(data.perRobot ?? {}).includes(-1) || hasRowErrors) failedSlugs.push(slugs[i])
        totalResults += data.totalResults || 0
        totalHighlights += data.totalHighlights || 0
        totalFixed += data.fixedDates || 0
        await new Promise(r => setTimeout(r, 1500))
      }
      setResultsSummary(`Syncing NHRL...`)
      const nhrlRes = await fetch('/api/cron/sync-nhrl', { headers: { authorization: `Bearer ${password}` } })
      const nhrlData = await nhrlRes.json()
      const failNote = failedSlugs.length ? ` | ⚠️ failed: ${failedSlugs.join(', ')} — check server logs` : ''
      setResultsSummary(`${failedSlugs.length ? '⚠️' : '✅'} Done! ${totalResults} results, ${totalHighlights} highlights, ${totalFixed} dates fixed | NHRL: ${nhrlData.eventsAdded ?? 0} added, ${nhrlData.resultsAdded ?? 0} results${failNote}`)
    } finally { setSyncing(false) }
  }

  async function parseEventUrl() {
    if (!eventUrl) return
    setParsingUrl(true)
    setAddEventError(null)
    try {
      const res = await fetch('/api/admin/parse-event-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
        body: JSON.stringify({ url: eventUrl }),
      })
      const data = await res.json()
      if (!res.ok) { setAddEventError(data.error ?? 'Failed to parse URL'); return }
      setNewEvent(p => ({
        ...p,
        title: data.title || p.title,
        start_date: data.start_date || p.start_date,
        end_date: data.end_date || p.end_date,
        event_source: data.event_source || p.event_source,
      }))
    } finally { setParsingUrl(false) }
  }

  async function addEvent() {
    setAddEventError(null)
    setAddEventSuccess(null)
    if (!newEvent.title || !newEvent.start_date || !newEvent.event_source) {
      setAddEventError('Title, start date, and source are required.')
      return
    }
    setAddEventLoading(true)
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
        body: JSON.stringify(newEvent),
      })
      const data = await res.json()
      if (!res.ok) { setAddEventError(data.error ?? 'Failed to add event'); return }
      setAddEventSuccess(`Event added!`)
      setNewEvent({ title: '', start_date: '', end_date: '', event_source: 'nhrl', status: 'upcoming' })
      setEventUrl('')
      setShowAddEvent(false)
      // Refresh all-events list and registrations
      fetch('/api/admin/all-events', { headers: { authorization: `Bearer ${password}` } })
        .then(r => r.ok ? r.json() : []).then(setAllEvents).catch(() => {})
      fetchRegistrations(password)
    } finally { setAddEventLoading(false) }
  }

  function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function addBot() {
    setAddBotError(null)
    if (!newBot.name || !newBot.slug || !newBot.weight_class) {
      setAddBotError('Name, slug, and weight class are required.')
      return
    }
    setAddBotLoading(true)
    try {
      const res = await fetch('/api/admin/robots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
        body: JSON.stringify(newBot),
      })
      const data = await res.json()
      if (!res.ok) { setAddBotError(data.error ?? 'Failed to add bot'); return }
      setShowAddBot(false)
      setNewBot({ name: '', slug: '', weight_class: '', weapon_type: '', description: '', rce_url: '', image_url: '', active: true })
      const robotsRes = await fetch('/api/admin/robots', { headers: { authorization: `Bearer ${password}` } })
      if (robotsRes.ok) setRobots(await robotsRes.json())
    } finally { setAddBotLoading(false) }
  }

  async function deleteBot(robot: any) {
    if (!confirm(`Delete "${robot.name}"? This also removes its recorded results. Media/highlights mentioning it will just lose the tag. This cannot be undone.`)) return
    setDeletingBotId(robot.id)
    try {
      const res = await fetch('/api/admin/robots', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
        body: JSON.stringify({ id: robot.id }),
      })
      if (res.ok) setRobots(prev => prev.filter(r => r.id !== robot.id))
      else { const data = await res.json().catch(() => ({})); alert(data.error ?? 'Failed to delete bot') }
    } finally { setDeletingBotId(null) }
  }

  if (!authed) {
    return (
      <div className="max-w-sm mx-auto px-4 py-24">
        <h1 className="text-2xl font-black mb-6">Admin Login</h1>
        <form onSubmit={e => {
          e.preventDefault()
          // Read directly from DOM to catch browser autofill that skips onChange
          const val = passwordInputRef.current?.value ?? password
          if (val) setPassword(val)
          fetchPosts(val)
        }} className="flex flex-col gap-4">
          <input ref={passwordInputRef} type="password" value={password} onChange={e => { setPassword(e.target.value); setLoginError(false) }}
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
            placeholder="Admin password" autoComplete="current-password" />
          {loginError && <p className="text-red-400 text-sm">Incorrect password.</p>}
          <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 rounded-lg">Login</button>
        </form>
      </div>
    )
  }

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

      {resultsSummary && (
        <div className="mb-6 card p-4 text-sm text-green-400 whitespace-pre-wrap">{resultsSummary}</div>
      )}

      {/* Event Links */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Link2 size={16} className="text-orange-400" /> Event Links
          </h2>
          <button onClick={checkAutoLinks} disabled={linksLoading}
            className="flex items-center gap-2 border border-orange-500 text-orange-400 hover:bg-orange-500/10 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50">
            <Radio size={12} className={linksLoading ? 'animate-pulse' : ''} />
            {linksLoading ? 'Checking...' : 'Check Auto-Links'}
          </button>
        </div>

        {/* Auto-detected candidates */}
        {linkCandidates.length > 0 && (
          <div className="card p-4 mb-4 border border-orange-500/20 bg-orange-500/5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-orange-400">{linkCandidates.length} auto-detected link{linkCandidates.length !== 1 ? 's' : ''}</p>
              <button onClick={saveAllCandidates} className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded font-bold">Save All</button>
            </div>
            <div className="flex flex-col gap-2">
              {linkCandidates.map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500 w-24 shrink-0 truncate">{c.event_title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                    c.link_type === 'bracket' ? 'text-orange-400 border-orange-500/30 bg-orange-500/10' :
                    c.link_type === 'stream' ? 'text-red-400 border-red-500/30 bg-red-500/10' :
                    'text-gray-400 border-[#2a2a2a]'}`}>{c.label}</span>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-orange-400 truncate flex-1 min-w-0">{c.url}</a>
                  <button onClick={() => saveCandidate(c)} className="text-xs bg-green-700 hover:bg-green-600 text-white px-2 py-0.5 rounded shrink-0">Save</button>
                  <button onClick={() => setLinkCandidates(prev => prev.filter((_, j) => j !== i))} className="text-xs text-gray-600 hover:text-red-400 shrink-0"><XCircle size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search for event */}
        <div className="relative mb-3">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={linkSearch}
            onChange={e => { setLinkSearch(e.target.value); setLinkEvent(null); setLinkEventLinks([]) }}
            className="w-full bg-[#111] border border-[#333] rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-orange-500"
            placeholder="Search events to manage links…"
          />
        </div>
        {linkSearch.length > 0 && !linkEvent && (() => {
          const matches = allEvents.filter(e => e.title.toLowerCase().includes(linkSearch.toLowerCase())).slice(0, 8)
          if (!matches.length) return <p className="text-gray-500 text-sm">No events found.</p>
          return (
            <div className="flex flex-col gap-1 border border-[#2a2a2a] rounded-lg overflow-hidden mb-3">
              {matches.map(e => (
                <button key={e.id} onClick={() => selectLinkEvent(e)}
                  className="text-left px-3 py-2 text-sm hover:bg-[#1a1a1a] transition-colors flex items-center justify-between">
                  <span>{e.title}</span>
                  <span className="text-xs text-gray-500">{e.start_date?.slice(0, 10)}</span>
                </button>
              ))}
            </div>
          )
        })()}

        {/* Selected event: existing links + add form */}
        {linkEvent && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-sm">{linkEvent.title}</p>
                <p className="text-xs text-gray-500">{linkEvent.start_date?.slice(0, 10)}</p>
              </div>
              <button onClick={() => { setLinkEvent(null); setLinkSearch(''); setLinkEventLinks([]) }}
                className="text-xs text-gray-500 hover:text-gray-300">Clear</button>
            </div>
            {linkEventLinksLoading && <p className="text-gray-500 text-sm">Loading…</p>}
            {!linkEventLinksLoading && (
              <>
                {linkEventLinks.length === 0 && <p className="text-xs text-gray-600 mb-3">No links yet.</p>}
                {linkEventLinks.length > 0 && (
                  <div className="flex flex-col gap-2 mb-4">
                    {linkEventLinks.map((link: any) => (
                      <div key={link.id} className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                          link.link_type === 'bracket' ? 'text-orange-400 border-orange-500/30' :
                          link.link_type === 'stream' ? 'text-red-400 border-red-500/30' :
                          link.link_type === 'results' ? 'text-blue-400 border-blue-500/30' :
                          'text-gray-400 border-[#2a2a2a]'}`}>{link.label}</span>
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-orange-400 truncate flex-1 min-w-0">{link.url}</a>
                        <button onClick={() => deleteLink(link.id)} className="text-xs text-gray-600 hover:text-red-400 shrink-0"><Trash2 size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t border-[#2a2a2a] pt-3 flex flex-col gap-2">
                  <p className="text-xs text-gray-500 font-medium">Add link</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input value={newLink.url} onChange={e => setNewLink(p => ({ ...p, url: e.target.value }))}
                      className="sm:col-span-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-orange-500"
                      placeholder="https://…" />
                    <input value={newLink.label} onChange={e => setNewLink(p => ({ ...p, label: e.target.value }))}
                      className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-orange-500"
                      placeholder="Label (e.g. 30lb Bracket)" />
                    <select value={newLink.link_type} onChange={e => setNewLink(p => ({ ...p, link_type: e.target.value }))}
                      className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-orange-500">
                      <option value="bracket">Bracket</option>
                      <option value="stream">Stream</option>
                      <option value="results">Results</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <button onClick={addManualLink} disabled={!newLink.url || !newLink.label}
                    className="self-start text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded font-bold disabled:opacity-40">
                    Save Link
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Add Event */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Calendar size={16} className="text-green-400" /> Add Event
          </h2>
          <button onClick={() => { setShowAddEvent(v => !v); setAddEventError(null); setAddEventSuccess(null) }}
            className="flex items-center gap-1.5 text-xs border border-[#2a2a2a] text-gray-300 hover:border-green-500 hover:text-green-400 px-3 py-1.5 rounded-lg transition-colors">
            <Plus size={11} /> Add Event
          </button>
        </div>
        {addEventSuccess && <p className="text-xs text-green-400 mb-3">{addEventSuccess}</p>}
        {showAddEvent && (
          <div className="card p-4 flex flex-col gap-3">
            <p className="text-xs font-bold text-gray-300">New Event</p>
            {addEventError && <p className="text-xs text-red-400">{addEventError}</p>}
            {/* URL auto-fill */}
            <div className="flex gap-2 items-center">
              <input value={eventUrl}
                onChange={e => setEventUrl(e.target.value)}
                className="flex-1 bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500"
                placeholder="Paste event URL to auto-fill (optional)" />
              <button onClick={parseEventUrl} disabled={!eventUrl || parsingUrl}
                className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded font-bold disabled:opacity-40 whitespace-nowrap">
                {parsingUrl ? 'Reading…' : 'Auto-fill'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={newEvent.title}
                onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))}
                className="sm:col-span-2 bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500"
                placeholder="Event title *" />
              <div>
                <label className="text-xs text-gray-500 block mb-1">Start date *</label>
                <input type="date" value={newEvent.start_date}
                  onChange={e => setNewEvent(p => ({ ...p, start_date: e.target.value }))}
                  className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">End date (optional)</label>
                <input type="date" value={newEvent.end_date}
                  onChange={e => setNewEvent(p => ({ ...p, end_date: e.target.value }))}
                  className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Source *</label>
                <select value={newEvent.event_source}
                  onChange={e => setNewEvent(p => ({ ...p, event_source: e.target.value }))}
                  className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500">
                  <option value="nhrl">NHRL</option>
                  <option value="gscrl">GSCRL</option>
                  <option value="rce">RobotCombatEvents</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Status</label>
                <select value={newEvent.status}
                  onChange={e => setNewEvent(p => ({ ...p, status: e.target.value }))}
                  className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500">
                  <option value="upcoming">Upcoming</option>
                  <option value="current">Live / Current</option>
                  <option value="past">Past</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addEvent} disabled={addEventLoading}
                className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded font-bold disabled:opacity-50">
                {addEventLoading ? 'Saving…' : 'Save Event'}
              </button>
              <button onClick={() => { setShowAddEvent(false); setAddEventError(null); setEventUrl('') }}
                className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1.5">Cancel</button>
            </div>
          </div>
        )}
      </section>

      {/* Edit / Delete Event */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Calendar size={16} className="text-yellow-400" /> Edit or Delete Event
        </h2>
        <div className="relative mb-3">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={eventDateSearch}
            onChange={e => { setEventDateSearch(e.target.value); setEditingDateEvent(null); setDateSaveStatus(null); setDeleteEventStatus(null) }}
            className="w-full bg-[#111] border border-[#333] rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-orange-500"
            placeholder="Search events…"
          />
        </div>
        {eventDateSearch.length > 0 && !editingDateEvent && (() => {
          const matches = allEvents
            .filter(e => e.title.toLowerCase().includes(eventDateSearch.toLowerCase()))
            .slice(0, 8)
          if (!matches.length) return <p className="text-gray-500 text-sm">No events found.</p>
          return (
            <div className="flex flex-col gap-1 border border-[#2a2a2a] rounded-lg overflow-hidden mb-3">
              {matches.map(e => (
                <button key={e.id} onClick={() => {
                  setEditingDateEvent(e)
                  setEditingDates({
                    title: e.title ?? '',
                    location: e.location ?? '',
                    start_date: e.start_date?.slice(0, 10) ?? '',
                    end_date: e.end_date?.slice(0, 10) ?? '',
                  })
                  setEventDateSearch(e.title)
                }}
                  className="text-left px-3 py-2 text-sm hover:bg-[#1a1a1a] transition-colors flex items-center justify-between">
                  <span>{e.title}</span>
                  <span className="text-xs text-gray-500">{e.start_date?.slice(0, 10)}</span>
                </button>
              ))}
            </div>
          )
        })()}
        {editingDateEvent && (
          <div className="card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm">{editingDateEvent.title}</p>
              <button onClick={() => { setEditingDateEvent(null); setEventDateSearch(''); setDateSaveStatus(null); setDeleteEventStatus(null) }}
                className="text-xs text-gray-500 hover:text-gray-300">Clear</button>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Title</label>
              <input value={editingDates.title}
                onChange={e => setEditingDates(p => ({ ...p, title: e.target.value }))}
                className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Location (optional)</label>
              <input value={editingDates.location}
                onChange={e => setEditingDates(p => ({ ...p, location: e.target.value }))}
                className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Start date</label>
                <input type="date" value={editingDates.start_date}
                  onChange={e => setEditingDates(p => ({ ...p, start_date: e.target.value }))}
                  className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">End date (optional)</label>
                <input type="date" value={editingDates.end_date}
                  onChange={e => setEditingDates(p => ({ ...p, end_date: e.target.value }))}
                  className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-sm focus:outline-none focus:border-orange-500" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={patchEventDates}
                className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded font-bold">
                Save Changes
              </button>
              {dateSaveStatus && <span className="text-xs text-gray-400">{dateSaveStatus}</span>}
            </div>
            <div className="border-t border-[#2a2a2a] pt-3 flex items-center gap-3">
              <button onClick={deleteEvent}
                className="text-xs bg-red-500/20 hover:bg-red-500 border border-red-500 text-red-400 hover:text-white px-3 py-1.5 rounded font-bold transition-colors">
                Delete Event
              </button>
              {deleteEventStatus && <span className="text-xs text-gray-400">{deleteEventStatus}</span>}
            </div>
          </div>
        )}
      </section>

      {/* Active & Upcoming Event Registrations */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Calendar size={16} className="text-blue-400" /> Active &amp; Upcoming Event Registrations
        </h2>
        {regLoading && <p className="text-gray-500 text-sm">Loading...</p>}
        {regData && regData.events.length === 0 && <p className="text-gray-500 text-sm">No active or upcoming events.</p>}
        {regData && regData.events.length > 0 && (
          <div className="flex flex-col gap-4">
            {regData.events.map((event: any) => {
              const isLive = event.status === 'current'
              const regs = regData.registrations[event.id] ?? []
              return (
                <div key={event.id} className={`card p-4 ${isLive ? 'border-red-500/40' : ''}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {isLive && <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wide">Live</span>}
                      <div>
                        <p className="font-semibold text-sm">{event.title}</p>
                        <p className="text-xs text-gray-500">{event.start_date ? new Date(event.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''} · {event.event_source?.toUpperCase()}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {regData.robots.map((robot: any) => {
                      const reg = regs.find((r: any) => r.robotId === robot.id)
                      const isReg = !!reg
                      const hasResults = isLive && reg && (reg.wins > 0 || reg.losses > 0)
                      return (
                        <button key={robot.id}
                          onClick={() => !hasResults && toggleRegistration(robot.id, event.id, isReg)}
                          disabled={!!hasResults}
                          title={hasResults ? 'Has recorded results — edit via sync' : undefined}
                          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            hasResults
                              ? 'bg-orange-500/20 border-orange-500 text-orange-400 opacity-50 cursor-not-allowed'
                              : isReg
                              ? 'bg-orange-500/20 border-orange-500 text-orange-400 hover:bg-red-500/20 hover:border-red-500 hover:text-red-400'
                              : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-500 hover:border-orange-500 hover:text-orange-400'
                          }`}>
                          {isReg ? (hasResults ? <Cpu size={9} /> : <Trash2 size={9} />) : <Plus size={9} />}
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

      {/* Edit Past Event Registrations */}
      <section className="mb-10">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Calendar size={16} className="text-orange-400" /> Edit Past Event Registrations
        </h2>
        <div className="relative mb-3">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={pastRegSearch}
            onChange={e => { setPastRegSearch(e.target.value); setPastRegEvent(null); setPastRegData(null) }}
            className="w-full bg-[#111] border border-[#333] rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-orange-500"
            placeholder="Search past events…"
          />
        </div>
        {pastRegSearch.length > 0 && !pastRegEvent && (() => {
          const todayStr = new Date().toISOString().slice(0, 10)
          const matches = allEvents
            .filter(e => (e.start_date?.slice(0, 10) ?? '') < todayStr && e.title.toLowerCase().includes(pastRegSearch.toLowerCase()))
            .slice(0, 8)
          if (!matches.length) return <p className="text-gray-500 text-sm">No past events found.</p>
          return (
            <div className="flex flex-col gap-1 border border-[#2a2a2a] rounded-lg overflow-hidden mb-3">
              {matches.map(e => (
                <button key={e.id} onClick={() => { setPastRegSearch(e.title); selectPastRegEvent(e) }}
                  className="text-left px-3 py-2 text-sm hover:bg-[#1a1a1a] transition-colors flex items-center justify-between">
                  <span>{e.title}</span>
                  <span className="text-xs text-gray-500">{e.start_date?.slice(0, 10)}</span>
                </button>
              ))}
            </div>
          )
        })()}
        {pastRegEvent && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-sm">{pastRegEvent.title}</p>
                <p className="text-xs text-gray-500">{pastRegEvent.start_date?.slice(0, 10)}</p>
              </div>
              <button onClick={() => { setPastRegEvent(null); setPastRegData(null); setPastRegSearch('') }}
                className="text-xs text-gray-500 hover:text-gray-300">Clear</button>
            </div>
            {pastRegLoading && <p className="text-gray-500 text-sm">Loading…</p>}
            {!pastRegLoading && pastRegData && (
              <div className="flex flex-wrap gap-2">
                {pastRegData.robots.map((robot: any) => {
                  const reg = pastRegData.registrations.find(r => r.robotId === robot.id)
                  const isReg = !!reg
                  const hasResults = reg && (reg.wins > 0 || reg.losses > 0 || reg.placement !== null)
                  return (
                    <button key={robot.id}
                      onClick={() => !hasResults && togglePastRegistration(robot.id, isReg)}
                      disabled={!!hasResults}
                      title={hasResults ? 'Has recorded results — edit via sync' : undefined}
                      className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        hasResults
                          ? 'bg-orange-500/20 border-orange-500 text-orange-400 opacity-50 cursor-not-allowed'
                          : isReg
                          ? 'bg-orange-500/20 border-orange-500 text-orange-400 hover:bg-red-500/20 hover:border-red-500 hover:text-red-400'
                          : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-500 hover:border-orange-500 hover:text-orange-400'
                      }`}>
                      {isReg ? (hasResults ? <Cpu size={9} /> : <Trash2 size={9} />) : <Plus size={9} />}
                      {robot.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Add Bot */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Cpu size={16} className="text-green-400" /> Bots
          </h2>
          <button onClick={() => { setShowAddBot(v => !v); setAddBotError(null) }}
            className="flex items-center gap-1.5 text-xs border border-[#2a2a2a] text-gray-300 hover:border-green-500 hover:text-green-400 px-3 py-1.5 rounded-lg transition-colors">
            <Plus size={11} /> Add Bot
          </button>
        </div>

        {showAddBot && (
          <div className="card p-4 mb-4 flex flex-col gap-3">
            <p className="text-xs font-bold text-gray-300">New Bot</p>
            {addBotError && <p className="text-xs text-red-400">{addBotError}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={newBot.name}
                onChange={e => { const n = e.target.value; setNewBot(p => ({ ...p, name: n, slug: slugify(n) })) }}
                className="bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500"
                placeholder="Name *" />
              <input value={newBot.slug}
                onChange={e => setNewBot(p => ({ ...p, slug: e.target.value }))}
                className="bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500"
                placeholder="Slug * (auto-filled)" />
              <select value={newBot.weight_class}
                onChange={e => setNewBot(p => ({ ...p, weight_class: e.target.value }))}
                className="bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500">
                <option value="">Weight class *</option>
                <option value="150g Fairyweight">150g Fairyweight</option>
                <option value="1lb Antweight">1lb Antweight</option>
                <option value="1lb Plastic Antweight">1lb Plastic Antweight</option>
                <option value="3lb Beetleweight">3lb Beetleweight</option>
                <option value="12lb Hobbyweight">12lb Hobbyweight</option>
                <option value="30lb Featherweight">30lb Featherweight</option>
              </select>
              <input value={newBot.weapon_type}
                onChange={e => setNewBot(p => ({ ...p, weapon_type: e.target.value }))}
                className="bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500"
                placeholder="Weapon type (e.g. Spinner)" />
              <input value={newBot.rce_url}
                onChange={e => setNewBot(p => ({ ...p, rce_url: e.target.value }))}
                className="bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500 col-span-2"
                placeholder="RobotCombatEvents URL (for results sync)" />
              <input value={newBot.image_url}
                onChange={e => setNewBot(p => ({ ...p, image_url: e.target.value }))}
                className="bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500 col-span-2"
                placeholder="Image URL (optional)" />
              <textarea value={newBot.description}
                onChange={e => setNewBot(p => ({ ...p, description: e.target.value }))}
                className="bg-[#111] border border-[#333] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500 resize-none col-span-2"
                rows={2} placeholder="Description (optional)" />
              <label className="flex items-center gap-2 text-xs text-gray-300 col-span-2">
                <input type="checkbox" checked={newBot.active} onChange={e => setNewBot(p => ({ ...p, active: e.target.checked }))}
                  className="accent-green-500" />
                Active (show on site)
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={addBot} disabled={addBotLoading}
                className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded font-bold disabled:opacity-50">
                {addBotLoading ? 'Saving…' : 'Save Bot'}
              </button>
              <button onClick={() => { setShowAddBot(false); setAddBotError(null) }} className="text-xs text-gray-500 hover:text-gray-300 px-2">Cancel</button>
            </div>
          </div>
        )}
      </section>

      {/* Per-bot sync + delete */}
      {robots.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Cpu size={16} className="text-orange-400" /> Manage Bots
          </h2>
          <div className="flex flex-wrap gap-2">
            {robots.map((robot: any) => (
              <div key={robot.slug} className="flex items-center border border-[#2a2a2a] rounded-lg overflow-hidden">
                <button
                  onClick={() => syncOneBot(robot.slug)}
                  disabled={syncing || syncingSlug === robot.slug}
                  className="flex items-center gap-1.5 text-xs text-gray-300 hover:border-orange-500 hover:text-orange-400 px-3 py-1.5 transition-colors disabled:opacity-40">
                  <RefreshCw size={11} className={syncingSlug === robot.slug ? 'animate-spin' : ''} />
                  {robot.name}
                </button>
                <button
                  onClick={() => deleteBot(robot)}
                  disabled={deletingBotId === robot.id}
                  title="Delete bot"
                  className="flex items-center px-2 py-1.5 border-l border-[#2a2a2a] text-gray-500 hover:bg-red-500 hover:text-white transition-colors disabled:opacity-40">
                  <Trash2 size={11} />
                </button>
              </div>
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
