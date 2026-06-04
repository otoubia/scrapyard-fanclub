'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, CheckCircle, Upload, Link, X, Search, Cpu, Calendar, Sparkles, Image as ImageIcon, Video } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Robot { id: string; name: string; slug: string }
interface Event { id: string; title: string; start_date: string }

// Read EXIF date from image file (first 64KB)
async function readExifDate(file: File): Promise<Date | null> {
  try {
    const buffer = await file.slice(0, 65536).arrayBuffer()
    const view = new DataView(buffer)
    const text = new TextDecoder('ascii', { fatal: false }).decode(buffer)
    // Look for EXIF DateTimeOriginal pattern: "YYYY:MM:DD HH:MM:SS"
    const match = text.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
    if (match) {
      return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`)
    }
  } catch {}
  return null
}

// Fetch YouTube video info via oEmbed (no API key needed)
async function fetchYouTubeInfo(url: string): Promise<{ title: string; thumbnail: string } | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
    if (!res.ok) return null
    const data = await res.json()
    return { title: data.title, thumbnail: data.thumbnail_url }
  } catch { return null }
}

// Match text against bot names
function suggestBotsFromText(text: string, robots: Robot[]): Robot[] {
  const lower = text.toLowerCase()
  return robots.filter(r => lower.includes(r.name.toLowerCase()))
}

export default function SubmitPage({
  searchParams
}: {
  searchParams?: { event_id?: string; robot_id?: string }
}) {
  const [robots, setRobots] = useState<Robot[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [type, setType] = useState<'photo' | 'video'>('photo')
  const [inputMode, setInputMode] = useState<'file' | 'url'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [authorName] = useState('Anonymous')
  const [authorEmail] = useState('')
  const [selectedRobots, setSelectedRobots] = useState<Robot[]>([])
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [robotSearch, setRobotSearch] = useState('')
  const [eventSearch, setEventSearch] = useState('')
  const [suggestions, setSuggestions] = useState<{ robots: Robot[]; event: Event | null; reason: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Load robots and events
  useEffect(() => {
    fetch('/api/admin/robots', { headers: { authorization: `Bearer public` } })
      .then(r => r.ok ? r.json() : [])
      .then(setRobots)
      .catch(() => {})

    // Load events from public endpoint
    const supabasePublic = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    supabasePublic.from('events').select('id, title, start_date')
      .order('start_date', { ascending: false }).limit(100)
      .then(({ data }) => setEvents(data ?? []))
  }, [])

  // Pre-fill from URL params (context-aware posting)
  useEffect(() => {
    if (!robots.length || !events.length) return
    if (searchParams?.robot_id) {
      const r = robots.find(r => r.id === searchParams.robot_id)
      if (r) setSelectedRobots([r])
    }
    if (searchParams?.event_id) {
      const e = events.find(e => e.id === searchParams.event_id)
      if (e) setSelectedEvent(e)
    }
  }, [robots, events, searchParams?.robot_id, searchParams?.event_id])

  // Handle file selection
  async function handleFile(f: File) {
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    // Try to read EXIF date
    const exifDate = await readExifDate(f)
    if (exifDate && robots.length && events.length) {
      autoSuggestFromDate(exifDate)
    }
  }

  // Handle YouTube URL
  async function handleUrl(u: string) {
    setUrl(u)
    if (u.includes('youtube.com') || u.includes('youtu.be')) {
      const info = await fetchYouTubeInfo(u)
      if (info) {
        if (!title) setTitle(info.title)
        if (!previewUrl) setPreviewUrl(info.thumbnail)
        const botMatches = suggestBotsFromText(info.title, robots)
        if (botMatches.length > 0) {
          setSuggestions({ robots: botMatches, event: null, reason: `Found in video title: "${info.title}"` })
        }
      }
    }
  }

  function autoSuggestFromDate(date: Date) {
    // Find events within 2 days of the date
    const match = events.find(e => {
      const eventDate = new Date(e.start_date)
      const diff = Math.abs(date.getTime() - eventDate.getTime())
      return diff < 2 * 24 * 60 * 60 * 1000
    })
    if (match) {
      setSuggestions({
        robots: [],
        event: match,
        reason: `Photo taken on ${date.toLocaleDateString()} matches event date`
      })
    }
  }

  function applySuggestions() {
    if (!suggestions) return
    if (suggestions.event && !selectedEvent) setSelectedEvent(suggestions.event)
    suggestions.robots.forEach(r => {
      if (!selectedRobots.find(s => s.id === r.id)) {
        setSelectedRobots(prev => [...prev, r])
      }
    })
    setSuggestions(null)
  }

  function toggleRobot(robot: Robot) {
    setSelectedRobots(prev =>
      prev.find(r => r.id === robot.id)
        ? prev.filter(r => r.id !== robot.id)
        : [...prev, robot]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedRobots.length) { setError('Please tag at least one bot'); return }
    setStatus('loading')
    setError('')

    let finalUrl = url
    try {
      // Upload file to Supabase Storage if needed
      if (file && inputMode === 'file') {
        setUploading(true)
        const ext = file.name.split('.').pop()
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('media')
          .upload(path, file, { contentType: file.type })
        setUploading(false)
        if (uploadError) throw new Error(uploadError.message)
        const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(uploadData.path)
        finalUrl = publicUrl
      }

      if (!finalUrl) throw new Error('Please provide a file or URL')

      const res = await fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          url: finalUrl,
          title: title || null,
          caption: caption || null,
          author_name: authorName,
          author_email: authorEmail,
          event_id: selectedEvent?.id || null,
          robot_ids: selectedRobots.map(r => r.id),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to submit')
      setStatus('success')
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
      setStatus('error')
      setUploading(false)
    }
  }

  const filteredRobots = robots.filter(r =>
    r.name.toLowerCase().includes(robotSearch.toLowerCase())
  )
  const filteredEvents = events.filter(e =>
    e.title.toLowerCase().includes(eventSearch.toLowerCase())
  ).slice(0, 20)

  if (status === 'success') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <CheckCircle size={56} className="text-green-500 mx-auto mb-4" />
        <h1 className="text-3xl font-black mb-2">Submitted!</h1>
        <p className="text-gray-400">Your {type} is pending admin review. Thanks for contributing!</p>
        <button onClick={() => {
          setStatus('idle'); setFile(null); setUrl(''); setPreviewUrl(''); setTitle('')
          setCaption(''); setSelectedRobots([]); setSelectedEvent(null); setSuggestions(null)
        }} className="mt-6 text-orange-500 hover:underline">Submit another</button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="section-title">Share Media</h1>
      <p className="text-gray-400 mb-8">Share photos and videos with the Scrap Yard community. All content is reviewed before appearing on the site.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* Type selector */}
        <div className="flex gap-3">
          {(['photo', 'video'] as const).map(t => (
            <button key={t} type="button" onClick={() => { setType(t); if (t === 'video') setInputMode('url') }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${type === t ? 'bg-orange-500 text-white' : 'border border-[#2a2a2a] text-gray-400 hover:border-orange-500'}`}>
              {t === 'photo' ? <ImageIcon size={14} /> : <Video size={14} />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Input mode */}
        <div className="card p-5 flex flex-col gap-4">
          {type === 'photo' && (
            <div className="flex gap-2 mb-1">
              <button type="button" onClick={() => setInputMode('file')}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-bold transition-colors ${inputMode === 'file' ? 'bg-orange-500 text-white' : 'border border-[#2a2a2a] text-gray-400'}`}>
                <Upload size={11} /> Upload File
              </button>
              <button type="button" onClick={() => setInputMode('url')}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-bold transition-colors ${inputMode === 'url' ? 'bg-orange-500 text-white' : 'border border-[#2a2a2a] text-gray-400'}`}>
                <Link size={11} /> Paste URL
              </button>
            </div>
          )}

          {inputMode === 'file' ? (
            <div>
              <input ref={fileRef} type="file" className="hidden"
                accept={type === 'photo' ? 'image/*' : 'video/*,image/*'}
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-[#2a2a2a] hover:border-orange-500 rounded-lg p-8 text-center transition-colors group">
                {file ? (
                  <div>
                    {previewUrl && type === 'photo' && (
                      <img src={previewUrl} className="max-h-40 mx-auto mb-2 rounded" alt="preview" />
                    )}
                    <p className="text-sm text-green-400 font-semibold">{file.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                ) : (
                  <div>
                    <Upload size={32} className="mx-auto mb-2 text-gray-600 group-hover:text-orange-500 transition-colors" />
                    <p className="text-sm text-gray-400">Click to upload {type === 'photo' ? 'an image' : 'a video or image'}</p>
                    <p className="text-xs text-gray-600 mt-1">Max 50MB</p>
                  </div>
                )}
              </button>
            </div>
          ) : (
            <div>
              {type === 'video' && (
                <p className="text-xs text-gray-500 mb-2">Videos must be hosted on YouTube or Vimeo — paste the link below.</p>
              )}
              <input value={url} onChange={e => handleUrl(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                placeholder={type === 'video' ? 'https://youtube.com/watch?v=...' : 'https://example.com/photo.jpg'} />
              {previewUrl && type === 'video' && url.includes('youtube') && (
                <img src={previewUrl} className="mt-3 rounded-lg max-h-40 mx-auto" alt="YouTube thumbnail" />
              )}
            </div>
          )}
        </div>

        {/* Auto-suggest banner */}
        {suggestions && (
          <div className="card p-4 border border-orange-500/30 bg-orange-500/5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-orange-400 flex items-center gap-1.5 mb-1">
                  <Sparkles size={13} /> Auto-detected
                </p>
                <p className="text-xs text-gray-400">{suggestions.reason}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {suggestions.event && <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">{suggestions.event.title}</span>}
                  {suggestions.robots.map(r => <span key={r.id} className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">{r.name}</span>)}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" onClick={applySuggestions}
                  className="text-xs bg-orange-500 text-white px-3 py-1.5 rounded font-bold">Apply</button>
                <button type="button" onClick={() => setSuggestions(null)}
                  className="text-xs text-gray-500 hover:text-gray-300"><X size={14} /></button>
              </div>
            </div>
          </div>
        )}

        {/* Title & Caption */}
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-sm font-semibold text-gray-300 mb-1.5 block">Title <span className="text-gray-600 font-normal">(optional)</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              placeholder="Trampoline wins first place!" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-300 mb-1.5 block">Caption <span className="text-gray-600 font-normal">(optional)</span></label>
            <textarea rows={2} value={caption} onChange={e => setCaption(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 resize-none"
              placeholder="Add context about this photo or video..." />
          </div>
        </div>

        {/* Bot tagging (required) */}
        <div className="card p-4">
          <label className="text-sm font-bold text-gray-200 mb-3 flex items-center gap-2">
            <Cpu size={14} className="text-orange-500" /> Tag Bots <span className="text-red-400">*</span>
            <span className="text-xs text-gray-500 font-normal ml-1">at least one required</span>
          </label>
          {selectedRobots.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {selectedRobots.map(r => (
                <span key={r.id} className="flex items-center gap-1 text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2.5 py-1 rounded-full">
                  {r.name}
                  <button type="button" onClick={() => toggleRobot(r)}><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="relative mb-2">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={robotSearch} onChange={e => setRobotSearch(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              placeholder="Search bots..." />
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {filteredRobots.map(r => {
              const selected = !!selectedRobots.find(s => s.id === r.id)
              return (
                <button key={r.id} type="button" onClick={() => toggleRobot(r)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selected ? 'bg-orange-500 border-orange-500 text-white' : 'border-[#2a2a2a] text-gray-400 hover:border-orange-500'}`}>
                  {r.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Event tagging (optional) */}
        <div className="card p-4">
          <label className="text-sm font-bold text-gray-200 mb-3 flex items-center gap-2">
            <Calendar size={14} className="text-blue-400" /> Tag Event <span className="text-gray-500 text-xs font-normal ml-1">(optional)</span>
          </label>
          {selectedEvent && (
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center gap-1.5 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-full">
                {selectedEvent.title}
                <button type="button" onClick={() => setSelectedEvent(null)}><X size={10} /></button>
              </span>
            </div>
          )}
          <div className="relative mb-2">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={eventSearch} onChange={e => setEventSearch(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-orange-500"
              placeholder="Search events..." />
          </div>
          <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
            {filteredEvents.map(e => (
              <button key={e.id} type="button" onClick={() => { setSelectedEvent(e); setEventSearch('') }}
                className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${selectedEvent?.id === e.id ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'border-[#2a2a2a] text-gray-400 hover:border-blue-500'}`}>
                <span className="font-semibold">{e.title}</span>
                {e.start_date && !e.start_date.startsWith('2020') && (
                  <span className="text-gray-600 ml-2">{new Date(e.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button type="submit" disabled={status === 'loading' || uploading}
          className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors">
          <Send size={16} />
          {uploading ? 'Uploading...' : status === 'loading' ? 'Submitting...' : 'Submit for Review'}
        </button>
      </form>
    </div>
  )
}
