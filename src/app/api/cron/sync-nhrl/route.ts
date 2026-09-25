import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

const NHRL_BASE = 'https://brettzone.nhrl.io/brettZone/api.php'
const NHRL_MATCHES_BASE = 'https://brettzone.nhrl.io/brettZone/backend/getTournamentMatchesDataTables.php'
const NHRL_BOT_PIC_BASE = 'https://brettzone.nhrl.io/brettZone/getBotPic.php'
const NHRL_LOCATION = '165 Water St., Norwalk, CT 06854'


interface BracketMatch {
  round: number
  player1clean: string
  player2clean: string
  winnerClean: string | null
}

// Fetch a tournament's elimination-bracket matches ("W-*" ids; "EX-*" are group-stage/exhibition fights)
async function fetchBracketMatches(tournamentId: string): Promise<BracketMatch[]> {
  const res = await fetch(`${NHRL_MATCHES_BASE}?tournamentID=${tournamentId}&start=0&length=-1&draw=1`, { next: { revalidate: 0 } })
  if (!res.ok) return []
  const data: { data?: Array<{ id: string, round: string | number, player1clean: string, player2clean: string, winner: string }> } = await res.json()
  return (data.data ?? [])
    .filter(m => m.id.startsWith('W-'))
    .map(m => ({
      round: Number(m.round),
      player1clean: m.player1clean,
      player2clean: m.player2clean,
      // "Red" is player 1, "Blue" is player 2
      winnerClean: m.winner === 'Red' ? m.player1clean : m.winner === 'Blue' ? m.player2clean : null,
    }))
}

// Derive placement from the single-elimination bracket. The last three rounds
// (quarterfinal, semifinal, final) are Prime Time.
function getPlacementFromBracket(matches: BracketMatch[], cleanName: string): { placement: string, isPrimetime: boolean } | null {
  const finalRound = Math.max(0, ...matches.map(m => m.round))
  if (finalRound < 3) return null
  const find = (round: number) => matches.find(m => m.round === round && (m.player1clean === cleanName || m.player2clean === cleanName))

  const final = find(finalRound)
  if (final?.winnerClean === cleanName) return { placement: '1st Place', isPrimetime: true }
  if (final?.winnerClean) return { placement: '2nd Place', isPrimetime: true }
  const sf = find(finalRound - 1)
  if (sf?.winnerClean && sf.winnerClean !== cleanName) return { placement: '3rd-4th Place', isPrimetime: true }
  const qf = find(finalRound - 2)
  if (qf?.winnerClean && qf.winnerClean !== cleanName) return { placement: '5th-8th Place (Prime Time)', isPrimetime: true }
  return null
}

interface BotFight {
  tournamentId: string
  tournamentName: string
  createTime: string
  won: boolean
}

// Fetch fight history from BrettZone's backend JSON API
async function fetchBotFights(cleanName: string): Promise<BotFight[]> {
  try {
    const res = await fetch(
      `https://brettzone.nhrl.io/brettZone/backend/fightsByBot.php?bot=${cleanName}`,
      { next: { revalidate: 0 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.fights ?? []).map((f: any) => ({
      tournamentId: f.tournamentID,
      tournamentName: f.tournamentName,
      // Bot won if their wins field is "1"
      won: f.player1clean === cleanName ? f.player1wins === '1' : f.player2wins === '1',
    }))
  } catch {
    return []
  }
}

function checkAuth(req: NextRequest) {
  const secret = req.headers.get('authorization')
  return secret === `Bearer ${process.env.CRON_SECRET}` || secret === `Bearer ${process.env.ADMIN_SECRET}`
}

// Derive approximate date from tournament ID pattern: nhrl_{mon}{yy}_{class}
// e.g. nhrl_mar26_30lb_ → 2026-03-01
const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
}
function dateFromTournamentId(id: string): string | null {
  const m = id.match(/nhrl_([a-z]{3})(\d{2})_/)
  if (!m) return null
  const month = MONTH_MAP[m[1]]
  if (!month) return null
  const year = `20${m[2]}`
  return `${year}-${month}-01T00:00:00Z`
}

interface NHRLTournament {
  tournamentID: string
  tournamentName: string
  createTime: string
  scheduledStartTime: string
  startTime: string
  endTime: string
  WeightClass: number
  active: number
  isTest: number
  isFreestyle: number
  privacy: string
  numPlayers: number
}


function bestDate(t: NHRLTournament): string | null {
  const candidates = [t.scheduledStartTime, t.startTime, t.endTime]
  for (const d of candidates) {
    if (d && d !== '0000-00-00 00:00:00' && !d.startsWith('0000')) {
      return new Date(d).toISOString()
    }
  }
  // Fall back to deriving from ID
  return dateFromTournamentId(t.tournamentID)
}

// Scrape upcoming events from nhrl.io/events page.
// Each upcoming event is a card (class "event-bar_upcoming_event") holding a title <p>,
// a subtitle <p>, and a date line like "Sat Nov 07 / 10:00 AM Eastern / House of Havoc, Norwalk CT".
// Cards with a TBA date are skipped.
async function fetchUpcomingNHRLEvents(): Promise<Array<{title: string, date: string, location: string, external_id: string}>> {
  try {
    const res = await fetch('https://nhrl.io/events', { next: { revalidate: 0 } })
    if (!res.ok) return []
    const html = await res.text()
    const clean = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

    const upcoming: Array<{title: string, date: string, location: string, external_id: string}> = []
    const now = new Date()

    const cards = html.split(/class="[^"]*event-bar_upcoming_event/).slice(1)
    for (const card of cards) {
      const titles = [...card.matchAll(/<p class="[^"]*event-bar_title[^"]*">([\s\S]*?)<\/p>/g)].map(m => clean(m[1]))
      const dateLine = card.match(/<p class="[^"]*event-bar_event_date[^"]*">([\s\S]*?)<\/p>/)
      if (!titles.length || !dateLine) continue

      const parts = clean(dateLine[1]).split('/').map(s => s.trim())
      const dm = parts[0].match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{1,2})/i)
      if (!dm) continue // TBA date
      const month = dm[1].slice(0, 3), day = dm[2]

      // Page doesn't show the year: assume this year, or next year if that date is well in the past
      let year = now.getFullYear()
      let parsed = new Date(`${month} ${day}, ${year}`)
      if (parsed.getTime() < now.getTime() - 60 * 86400000) parsed = new Date(`${month} ${day}, ${++year}`)
      if (isNaN(parsed.getTime()) || parsed <= now) continue

      // Subtitle is the descriptive name ("2026 NHRL World Championship Pro Tour - Rd. 3")
      const title = titles[1] || titles[0]
      const scrapedLoc = parts[parts.length - 1]
      const location = !scrapedLoc || /TBA|Norwalk/i.test(scrapedLoc) ? NHRL_LOCATION : scrapedLoc

      const slug = `${year}-${month.toLowerCase()}-${day.padStart(2, '0')}`
      upcoming.push({ title, date: parsed.toISOString(), location, external_id: `nhrl-upcoming:${slug}` })
    }

    // Deduplicate by external_id
    const seen = new Set<string>()
    return upcoming.filter(e => {
      if (seen.has(e.external_id)) return false
      seen.add(e.external_id)
      return true
    })
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()

  // 1. Fetch full tournament list (past events)
  const tourRes = await fetch(`${NHRL_BASE}/tournaments`, { next: { revalidate: 0 } })
  if (!tourRes.ok) return NextResponse.json({ error: 'Failed to fetch NHRL tournaments' }, { status: 500 })
  const tourData = await tourRes.json()
  const allTournaments: NHRLTournament[] = tourData.tournaments ?? []

  // 2. Scrape upcoming events from nhrl.io/events
  const upcomingFromWebsite = await fetchUpcomingNHRLEvents()
  // Upsert upcoming events; mark as past if the date has already passed
  // Only reconcile when the scrape found something, so a failed/changed page doesn't wipe placeholders
  if (upcomingFromWebsite.length > 0) {
    const scrapedIds = new Set(upcomingFromWebsite.map(e => e.external_id))
    const { data: existingUpcoming } = await supabase.from('events')
      .select('id, external_id, start_date')
      .eq('event_source', 'nhrl').eq('status', 'upcoming')

    for (const ev of upcomingFromWebsite) {
      const fields = {
        title: ev.title, status: 'upcoming', start_date: ev.date, location: ev.location,
        updated_at: new Date().toISOString(),
      }
      const existing = (existingUpcoming ?? []).find(e => e.external_id === ev.external_id)
        // Adopt a manually-added NHRL event on the same day instead of creating a duplicate
        ?? (existingUpcoming ?? []).find(e => !e.external_id && e.start_date?.slice(0, 10) === ev.date.slice(0, 10))
      if (existing) {
        await supabase.from('events').update({ ...fields, external_id: ev.external_id }).eq('id', existing.id)
      } else {
        await supabase.from('events').insert({ ...fields, event_source: 'nhrl', external_id: ev.external_id })
      }
    }

    // Placeholders no longer listed on nhrl.io (event happened, or bogus date) are replaced by the
    // real BrettZone tournaments — delete them unless media or links were attached.
    const stale = (existingUpcoming ?? []).filter(e => e.external_id?.startsWith('nhrl-upcoming:') && !scrapedIds.has(e.external_id))
    for (const e of stale) {
      const [{ count: mediaCount }, { count: linkCount }] = await Promise.all([
        supabase.from('media').select('id', { count: 'exact', head: true }).eq('event_id', e.id),
        supabase.from('event_links').select('id', { count: 'exact', head: true }).eq('event_id', e.id),
      ])
      if (!mediaCount && !linkCount) await supabase.from('events').delete().eq('id', e.id)
      else await supabase.from('events').update({ status: 'past', updated_at: new Date().toISOString() }).eq('id', e.id)
    }
  }

  // 3. Get NHRL robots from DB (those with nhrl_clean_name in stats)
  const { data: allRobots } = await supabase.from('robots').select('id, name, slug, stats').eq('active', true)
  const nhrlRobots = (allRobots ?? []).filter(r => r.stats?.nhrl_clean_name)

  // Build a lookup: tournamentID → tournament data (for dates)
  const tournamentById = new Map(allTournaments.map(t => [t.tournamentID, t]))

  // 4. Fetch fight history for each NHRL bot in parallel
  const botFightsMap: Record<string, BotFight[]> = {}
  await Promise.all(nhrlRobots.map(async robot => {
    try {
      botFightsMap[robot.id] = await fetchBotFights(robot.stats.nhrl_clean_name)
    } catch {}
  }))

  // 5. Process each bot using fightsByBot as source of truth
  let eventsAdded = 0, eventsUpdated = 0, resultsAdded = 0

  // Delete ALL existing NHRL robot_results for NHRL bots so we start clean
  // (avoids stale entries from wrong tournament assignments)
  const nhrlEventIds = (await supabase.from('events').select('id').eq('event_source', 'nhrl')).data?.map(e => e.id) ?? []
  if (nhrlEventIds.length > 0) {
    await supabase.from('robot_results')
      .delete()
      .in('event_id', nhrlEventIds)
      .in('robot_id', nhrlRobots.map(r => r.id))
  }

  // Bracket matches per tournament, shared across bots in the same tournament
  const bracketCache = new Map<string, Promise<BracketMatch[]>>()
  for (const robot of nhrlRobots) {
    const cleanName = robot.stats.nhrl_clean_name
    const fights = botFightsMap[robot.id] ?? []

    // Group fights by tournament → calculate W/L
    const byTournament = new Map<string, { name: string, wins: number, losses: number }>()
    for (const fight of fights) {
      const t = byTournament.get(fight.tournamentId) ?? { name: fight.tournamentName, wins: 0, losses: 0 }
      if (fight.won) { t.wins++ } else { t.losses++ }
      byTournament.set(fight.tournamentId, t)
    }

    // Fetch brackets for all tournaments this bot competed in (for placement/Prime Time)
    const bracketMap = new Map<string, BracketMatch[]>()
    await Promise.all([...byTournament.keys()].map(async tid => {
      try {
        if (!bracketCache.has(tid)) bracketCache.set(tid, fetchBracketMatches(tid))
        bracketMap.set(tid, await bracketCache.get(tid)!)
      } catch {}
    }))

    for (const [tournamentId, result] of byTournament) {
      // Get or create the event
      const tournament = tournamentById.get(tournamentId)
      const externalId = `nhrl:${tournamentId}`
      const date = tournament ? bestDate(tournament) : dateFromTournamentId(tournamentId)
      const status = date && new Date(date) > new Date() ? 'upcoming' : 'past'
      const title = tournament?.tournamentName ?? result.name

      const { data: existingEvent } = await supabase
        .from('events').select('id').eq('event_source', 'nhrl').eq('external_id', externalId).single()

      let eventId: string | null = existingEvent?.id ?? null
      if (existingEvent) {
        await supabase.from('events').update({ title, status, updated_at: new Date().toISOString() }).eq('id', eventId)
        eventsUpdated++
      } else {
        const { data: newEvent } = await supabase.from('events').insert({
          title, event_source: 'nhrl', external_id: externalId,
          status, start_date: date ?? new Date().toISOString(),
          location: NHRL_LOCATION, updated_at: new Date().toISOString(),
        }).select('id').single()
        eventId = newEvent?.id ?? null
        if (eventId) eventsAdded++
      }
      if (!eventId) continue

      // Get placement from bracket
      const bracketPlacement = getPlacementFromBracket(bracketMap.get(tournamentId) ?? [], cleanName)

      await supabase.from('robot_results').insert({
        robot_id: robot.id, event_id: eventId,
        wins: result.wins, losses: result.losses,
        placement: bracketPlacement?.placement ?? null,
        is_highlight: bracketPlacement?.isPrimetime ?? false,
        notes: 'NHRL event',
      })
      resultsAdded++

      // Prime Time highlight
      if (bracketPlacement?.isPrimetime) {
        const { data: existingHighlight } = await supabase.from('highlights').select('id')
          .eq('robot_id', robot.id).eq('event_id', eventId).single()
        if (!existingHighlight) {
          const isPodium = ['1st Place', '2nd Place', '3rd-4th Place'].includes(bracketPlacement.placement)
          await supabase.from('highlights').insert({
            title: `${robot.name} — ${bracketPlacement.placement} at ${title}`,
            description: `Reached Prime Time at NHRL`,
            robot_id: robot.id, event_id: eventId,
            type: isPodium ? 'podium' : 'primetime',
          })
        }
      }
    }
  }

  // 7. Link bots to upcoming NHRL events once BrettZone posts the entrant list.
  // NHRL creates each weight class's tournament a few days before the event; its players
  // endpoint then lists entrants. Attach a 0-0 result to the nhrl.io placeholder for that
  // event (not a per-weight-class event — those are created from fights after the event).
  let entrantsLinked = 0
  const DAY = 86400000
  const pendingTournaments = allTournaments.filter(t =>
    !t.isTest && t.startTime.startsWith('0000') && t.endTime.startsWith('0000') &&
    Date.now() - new Date(t.createTime).getTime() < 30 * DAY // skip old abandoned tournaments
  )
  if (pendingTournaments.length > 0) {
    const { data: placeholders } = await supabase.from('events')
      .select('id, start_date')
      .eq('event_source', 'nhrl').eq('status', 'upcoming').like('external_id', 'nhrl-upcoming:%')
      .order('start_date')
    const nhrlRobotByClean = new Map(nhrlRobots.map(r => [r.stats.nhrl_clean_name as string, r]))
    const linked = new Set<string>()
    for (const t of pendingTournaments) {
      // The event is the first placeholder within 3 weeks after the tournament was created
      const created = new Date(t.createTime).getTime()
      const placeholder = (placeholders ?? []).find(p => {
        const d = new Date(p.start_date).getTime()
        return d >= created - DAY && d <= created + 21 * DAY
      })
      if (!placeholder) continue
      try {
        const pRes = await fetch(`${NHRL_BASE}/tournaments/${t.tournamentID}/players`, { next: { revalidate: 0 } })
        if (!pRes.ok) continue
        const players: Array<{ cleanName: string }> = (await pRes.json()).players ?? []
        for (const p of players) {
          const robot = nhrlRobotByClean.get(p.cleanName)
          const key = `${robot?.id}:${placeholder.id}`
          if (!robot || linked.has(key)) continue
          linked.add(key)
          await supabase.from('robot_results').insert({
            robot_id: robot.id, event_id: placeholder.id, wins: 0, losses: 0, placement: null, is_highlight: false,
          })
          entrantsLinked++
        }
      } catch {}
    }
  }

  // 8. Update each NHRL bot's stats and try to fetch image from BrettZone
  const { data: freshRobots } = await supabase.from('robots').select('id, slug, stats, image_url').in('id', nhrlRobots.map(r => r.id))
  for (const robot of freshRobots ?? []) {
    const cleanName = robot.stats?.nhrl_clean_name
    // Count actual tournaments from fight history (reliable)
    const fights = botFightsMap[robot.id] ?? []
    const actualTournaments = new Set(fights.map(f => f.tournamentId)).size
    const actualWins = fights.filter(f => f.won).length
    const actualLosses = fights.filter(f => !f.won).length
    const updatedStats = {
      ...robot.stats,
      nhrl_wins: actualWins,
      nhrl_losses: actualLosses,
      nhrl_tournaments: actualTournaments,
      nhrl_win_rate: actualTournaments > 0 ? actualWins / (actualWins + actualLosses) : 0,
    }

    // Try fetching bot image from BrettZone if we don't have one
    let imageUrl = robot.image_url
    if (!imageUrl && cleanName) {
      try {
        const imgRes = await fetch(`${NHRL_BOT_PIC_BASE}?bot=${cleanName}`, { next: { revalidate: 0 } })
        if (imgRes.ok && imgRes.headers.get('content-type')?.startsWith('image/')) {
          imageUrl = `${NHRL_BOT_PIC_BASE}?bot=${cleanName}`
        }
      } catch {}
    }

    await supabase.from('robots').update({
      stats: updatedStats,
      ...(imageUrl && imageUrl !== robot.image_url ? { image_url: imageUrl } : {})
    }).eq('id', robot.id)
    revalidatePath(`/robots/${robot.slug}`)
  }

  revalidatePath('/')
  return NextResponse.json({ ok: true, eventsAdded, eventsUpdated, resultsAdded, entrantsLinked })
}
