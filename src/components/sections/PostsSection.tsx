import Link from 'next/link'
import { MessageSquare, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export default function PostsSection({ posts }: { posts: any[] }) {
  return (
    <section id="community">
      <div className="flex items-center justify-between mb-6">
        <h2 className="section-title mb-0">Community Posts</h2>
        <Link href="/submit" className="text-sm text-orange-500 hover:underline flex items-center gap-1">
          Submit a post <ChevronRight size={14} />
        </Link>
      </div>
      {posts.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">
          <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
          <p>No community posts yet.</p>
          <Link href="/submit" className="mt-3 inline-block text-orange-500 hover:underline text-sm">
            Be the first to submit one →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {posts.map((post: any) => (
            <div key={post.id} className="card p-5 flex flex-col gap-2">
              <h3 className="font-bold">{post.title}</h3>
              <p className="text-sm text-gray-400 line-clamp-3">{post.content}</p>
              <div className="text-xs text-gray-500 mt-auto pt-2 flex justify-between">
                <span>By {post.author_name}</span>
                <span>{formatDate(post.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
