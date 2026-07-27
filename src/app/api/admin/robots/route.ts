import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

function checkAuth(req: NextRequest) {
  return req.headers.get('authorization') === `Bearer ${process.env.ADMIN_SECRET}`
}

export async function GET(req: NextRequest) {
  // Allow public access for bot list (used on submit form)
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('robots')
    .select('id, name, slug, weight_class, rce_url, stats')
    .eq('active', true)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { name, slug, weight_class, weapon_type, description, rce_url, image_url, active } = await req.json()
  if (!name || !slug || !weight_class) {
    return NextResponse.json({ error: 'name, slug, and weight_class are required' }, { status: 400 })
  }
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('robots')
    .insert({ name, slug, weight_class, weapon_type: weapon_type || null, description: description || null, rce_url: rce_url || null, image_url: image_url || null, active: active ?? true })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/robots')
  revalidatePath(`/robots/${slug}`)
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createServiceClient()
  const { data: robot } = await supabase.from('robots').select('slug').eq('id', id).single()
  const { error } = await supabase.from('robots').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/robots')
  if (robot?.slug) revalidatePath(`/robots/${robot.slug}`)
  revalidatePath('/')
  return NextResponse.json({ ok: true })
}
