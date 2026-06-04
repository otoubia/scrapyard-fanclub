import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  // Allow public access for bot list (used on submit form)
  // Admin-only routes use the media/posts endpoints instead
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('robots')
    .select('id, name, slug, weight_class, rce_url, stats')
    .eq('active', true)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
