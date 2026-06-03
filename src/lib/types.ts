export type EventStatus = 'upcoming' | 'current' | 'past'

export interface Event {
  id: string
  title: string
  event_source: string
  external_id?: string
  status: EventStatus
  start_date: string
  end_date?: string
  location?: string
  description?: string
  results?: Record<string, unknown>
  truefinals_url?: string
  livestream_url?: string
  image_url?: string
  created_at: string
  updated_at: string
}

export interface Robot {
  id: string
  name: string
  slug: string
  weight_class: string
  description?: string
  weapon_type?: string
  stats?: Record<string, unknown>
  image_url?: string
  rce_url?: string
  active: boolean
  created_at: string
}

export interface RobotResult {
  id: string
  robot_id: string
  event_id: string
  wins: number
  losses: number
  placement?: string
  is_highlight: boolean
  notes?: string
  robot?: Robot
  event?: Event
}

export interface Media {
  id: string
  type: 'photo' | 'video' | 'cad'
  url: string
  thumbnail_url?: string
  title?: string
  description?: string
  robot_id?: string
  event_id?: string
  is_highlight: boolean
  approved: boolean
  created_at: string
  robot?: Robot
  event?: Event
}

export interface Post {
  id: string
  title: string
  content: string
  author_name: string
  author_email: string
  media_urls?: string[]
  approved: boolean
  created_at: string
}

export interface Highlight {
  id: string
  title: string
  description?: string
  event_id?: string
  robot_id?: string
  type: 'podium' | 'primetime' | 'knockout' | 'other'
  media_url?: string
  created_at: string
  robot?: Robot
  event?: Event
}
