'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncingResults, setSyncingResults] = useState(false)
  const [resultsSummary, setResultsSummary] = useState<string | null>(null)

  async function fetchPosts(secret: string) {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/posts', { headers: { authorization: `Bearer ${secret}` } })
      if (!res.ok) { setAuthed(false); return }
      setPosts(await res.json())
      setAuthed(true)
    } finally { setLoading(false) }
  }

  async function handleApprove(id: string, approved: boolean) {
    await fetch('/api/admin/approve-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${password}` },
      body: JSON.stringify({ id, approved }),
    })
    fetchPosts(password)
  }

  async function triggerSync() {
    setSyncing(true)
    try {
      await fetch('/api/cron/sync-events', { headers: { authorization: `Bearer ${password}` } })
    } finally { setSyncing(false) }
  }

  async function triggerRobotResultsSync() {
    setSyncingResults(true)
    setResultsSummary(null)
    try {
      const res = await fetch('/api/cron/sync-robot-results', { headers: { authorization: `Bearer ${password}` } })
      const data = await res.json()
      if (data.perRobot) {
        const lines = Object.entries(data.perRobot).map(([name, count]) => `${name}: ${count} results`)
        setResultsSummary(`Synced ${data.totalResults} results, ${data.totalHighlights} highlights\n${lines.join(', ')}`)
      }
    } finally { setSyncingResults(false) }
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
        <div className="flex gap-2 flex-wrap">
          <button onClick={triggerSync} disabled={syncing}
            className="flex items-center gap-2 border border-orange-500 text-orange-500 hover:bg-orange-500/10 px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Events'}
          </button>
          <button onClick={triggerRobotResultsSync} disabled={syncingResults}
            className="flex items-center gap-2 border border-yellow-500 text-yellow-500 hover:bg-yellow-500/10 px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={syncingResults ? 'animate-spin' : ''} />
            {syncingResults ? 'Syncing...' : 'Sync Robot Results'}
          </button>
        </div>
      </div>

      {resultsSummary && (
        <div className="mb-8 card p-4 text-sm text-green-400 whitespace-pre-wrap">{resultsSummary}</div>
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
