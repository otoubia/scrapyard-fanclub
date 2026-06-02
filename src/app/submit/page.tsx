'use client'

import { useState } from 'react'
import { Send, CheckCircle } from 'lucide-react'

export default function SubmitPage() {
  const [form, setForm] = useState({ title: '', content: '', author_name: '', author_email: '', media_url: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError('')
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          media_urls: form.media_url ? [form.media_url] : [],
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setStatus('success')
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <CheckCircle size={56} className="text-green-500 mx-auto mb-4" />
        <h1 className="text-3xl font-black mb-2">Submitted!</h1>
        <p className="text-gray-400">Your post is pending admin review. Thanks for contributing to the community!</p>
        <button onClick={() => { setStatus('idle'); setForm({ title: '', content: '', author_name: '', author_email: '', media_url: '' }) }}
          className="mt-6 text-orange-500 hover:underline">Submit another</button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="section-title">Submit a Post</h1>
      <p className="text-gray-400 mb-8">Share photos, videos, event reports, or anything Scrap Yard related. Posts are reviewed by admins before appearing on the site.</p>

      <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-gray-300 mb-1.5 block">Your Name *</label>
            <input required value={form.author_name} onChange={e => setForm(f => ({ ...f, author_name: e.target.value }))}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              placeholder="Jane Smith" />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-300 mb-1.5 block">Email *</label>
            <input required type="email" value={form.author_email} onChange={e => setForm(f => ({ ...f, author_email: e.target.value }))}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              placeholder="jane@example.com" />
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-gray-300 mb-1.5 block">Title *</label>
          <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            placeholder="My experience at NHRL March 2025..." />
        </div>

        <div>
          <label className="text-sm font-semibold text-gray-300 mb-1.5 block">Content *</label>
          <textarea required rows={6} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors resize-none"
            placeholder="Write your post here..." />
        </div>

        <div>
          <label className="text-sm font-semibold text-gray-300 mb-1.5 block">Media URL (optional)</label>
          <input value={form.media_url} onChange={e => setForm(f => ({ ...f, media_url: e.target.value }))}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            placeholder="https://youtube.com/... or image URL" />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button type="submit" disabled={status === 'loading'}
          className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors">
          <Send size={16} />
          {status === 'loading' ? 'Submitting...' : 'Submit Post'}
        </button>
      </form>
    </div>
  )
}
