import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

const NHRL_BASE = 'https://brettzone.nhrl.io/brettZone/api.php'
const NHRL_BRACKET_BASE = 'https://brettzone.nhrl.io/brettZone/bracketView.php'
const NHRL_BOT_PIC_BASE = 'https://brettzone.nhrl.io/brettZone/getBotPic.php'
const NHRL_LOCATION = '165 Water St., Norwalk, CT 06854'
const RELEVANT_WEIGHT_CLASSES = [3, 12, 30]

interface BracketRound {
  allPlayers: string[]
  winners: string[]
}

// Parse BrettZone bracket HTML into rounds with players and winners
function parseBracketHtml(html: string): BracketRound[] {
  const rounds: BracketRound[] = []
  // Split into round blocks
  const roundBlocks = html.split(/<div[^>]+class="[^"]*\bround\b[^"]*"/)
  for (const block of roundBlocks.slice(1)) { // skip first (before any round)
    // Get all player names
    const allPlayers: string[] = []
    const playerNameRegex = /<span[^>]+class="[^"]*player-name[^"]*"[^>]*>([\s\S]*?)<\/span>/gi
    let m
    while ((m = playerNameRegex.exec(block)) !== null) {
      const name = m[1].replace(/<[^>]+>/g, '').trim()
      if (name) allPlayers.push(name)
    }
    // Get winners — player-name inside a div with class "player winner"
    const winners: string[] = []
    const winnerBlockRegex = /<div[^>]+class="[^"]*player winner[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
    while ((m = winnerBlockRegex.exec(block)) !== null) {
      const nameMatch = m[1].match(/<span[^>]+class="[^"]*player-name[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
      if (nameMatch) {
        const name = nameMatch[1].replace(/<[^>]+>/g, '').trim()
        if (name) winners.push(name)
      }
    }
    if (allPlayers.length > 0) rounds.push({ allPlayers, winners })
  }
  return rounds
}

// Derive placement from bracket rounds for a given bot name (case-insensitive)
function getPlacementFromBracket(rounds: BracketRound[], botName: string): { placement: string, isPrimetime: boolean } | null {
  const lower = botName.toLowerCase()
  const inRound = (r: BracketRound) => r.allPlayers.some(p => p.toLowerCase() === lower)
  const isWinner = (r: BracketRound) => r.winners.some(p => p.toLowerCase() === lower)

  // Bot must appear in QF (round 0) to have made Prime Time
  if (!rounds[0] || !inRound(rounds[0])) return null

  const numRounds = rounds.length
  const finalRound = rounds[numRounds - 1]
  const sfRound = rounds[numRounds - 2]
  const qfRound = rounds[0]

  // Champion: won every round including the final
  if (finalRound && isWinner(finalRound)) return { placement: '1st Place', isPrimetime: true }
  // Runner-up: in final but lost
  if (finalRound && inRound(finalRound) && !isWinner(finalRound)) return { placement: '2nd Place', isPrimetime: true }
  // SF loser: in SF but not final
  if (sfRound && sfRound !== qfRound && inRound(sfRound) && !isWinner(sfRound))
    return { placement: '3rd-4th Place', isPrimetime: true }
  // QF loser: in QF but not SF
  return { placement: '5th-8th Place (Prime Time)', isPrimetime: true }
}

interface BotFight {
  tournamentId: string
  tournamentName: string
  botIsRed: boolean
  won: boolean
  winType: string
}

// Parse fightsByBot.php to get complete fight history with tournament IDs
function parseFightsByBot(html: string, botCleanName: string): BotFight[] {
  const fights: BotFight[] = []
  // Each row: <tr>...<td>matchId</td><td><a href="...tournamentID=X">Name</a></td>...
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let m
  while ((m = rowRegex.exec(html)) !== null) {
    const row = m[1]
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c =>
      c[1].replace(/<[^>]+>/g, '').trim()
    )
    if (cells.length < 8) continue

    // Extract tournament ID from href
    const hrefMatch = row.match(/tournamentID=([a-zA-Z0-9_-]+)/)
    if (!hrefMatch) continue
    const tournamentId = hrefMatch[1]
    const tournamentName = cells[1]

    // Determine if bot was red or blue
    const redBot = cells[3]?.toLowerCase().replace(/\s+/g, '')
    const blueBot = cells[4]?.toLowerCase().replace(/\s+/g, '')
    const clean = botCleanName.toLowerCase()
    const botIsRed = redBot === clean || cells[3]?.toLowerCase().includes(botCleanName.toLowerCase())

    // Determine winner
    const winner = cells[5]?.toLowerCase() // 'red' or 'blue'
    const won = botIsRed ? winner === 'red' : winner === 'blue'
    const winType = cells[6] ?? ''

    if (tournamentId && (winner === 'red' || winner === 'blue')) {
      fights.push({ tournamentId, tournamentName, botIsRed, won, winType })
    }
  }
  return fights
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

function isRelevantTournament(t: NHRLTournament): boolean {
  if (t.isTest || t.isFreestyle) return false
  if (!RELEVANT_WEIGHT_CLASSES.includes(t.WeightClass)) return false
  // Filter to properly named tournaments (not internal/practice)
  if (!t.tournamentName.match(/^NHRL\s+\w+\s+20\d{2}/i)) return false
  return true
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

// Scrape upcoming events from nhrl.io/events page
async function fetchUpcomingNHRLEvents(): Promise<Array<{title: string, date: string | null, external_id: string}>> {
  try {
    const res = await fetch('https://nhrl.io/events', { next: { revalidate: 0 } })
    if (!res.ok) return []
    const html = await res.text()
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')

    const upcoming: Array<{title: string, date: string | null, external_id: string}> = []
    const now = new Date()
    const currentYear = now.getFullYear()

    // Match patterns like "June 2026 Open" or "2026 NHRL..." near a date "Sat Jun 06" or "Jun 06"
    // Strategy: find date patterns first, then grab nearby event names

    // Pattern 1: "Mon Mmm DD / HH:MM" e.g. "Sat Jun 06 / 10:00"
    const dateRegex = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/gi
    let m
    while ((m = dateRegex.exec(text)) !== null) {
      const month = m[1], day = m[2]
      const dateStr = `${month} ${day}, ${currentYear}`
      const parsed = new Date(dateStr)
      if (isNaN(parsed.getTime()) || parsed <= now) continue

      // Grab the surrounding ~200 chars to find the event name
      const surrounding = text.substring(Math.max(0, m.index - 200), m.index + 50)
      // Look for event title patterns nearby: "XXXX Open", "Pro Tour", "Championship", etc.
      const titleMatch = surrounding.match(/(\d{4}\s+NHRL[^/\n]{5,60}|NHRL[^/\n]{5,60}|\w+ \d{4} (?:Open|Pro Tour|Championship)[^/\n]{0,40})/i)
      const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : `NHRL ${month} ${currentYear}`

      const slug = `${currentYear}-${month.toLowerCase()}-${day.padStart(2,'0')}`
      upcoming.push({ title, date: parsed.toISOString(), external_id: `nhrl-upcoming:${slug}` })
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
  const now = new Date()
  // Upsert upcoming events
  for (const ev of upcomingFromWebsite) {
    if (!ev.date || new Date(ev.date) <= now) continue
    const { data: existing } = await supabase.from('events').select('id').eq('external_id', ev.external_id).single()
    if (!existing) {
      await supabase.from('events').insert({
        title: ev.title, event_source: 'nhrl', external_id: ev.external_id,
        status: 'upcoming', start_date: ev.date, location: NHRL_LOCATION,
        updated_at: new Date().toISOString(),
      })
    } else {
      await supabase.from('events').update({
        title: ev.title, status: 'upcoming', start_date: ev.date,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    }
  }

  // 3. Get NHRL robots from DB (those with nhrl_clean_name in stats)
  const { data: allRobots } = await supabase.from('robots').select('id, name, slug, stats').eq('active', true)
  const nhrlRobots = (allRobots ?? []).filter(r => r.stats?.nhrl_clean_name)

  // Build a lookup: tournamentID → tournament data (for dates)
  const tournamentById = new Map(allTournaments.map(t => [t.tournamentID, t]))

  // 4. Fetch career stats + fight history for each NHRL bot in parallel
  const botStatsMap: Record<string, any> = {}
  const botFightsMap: Record<string, BotFight[]> = {}
  await Promise.all(nhrlRobots.map(async robot => {
    const cleanName = robot.stats.nhrl_clean_name
    try {
      const [statsRes, fightsRes] = await Promise.all([
        fetch(`${NHRL_BASE}/stats/bot/${cleanName}`, { next: { revalidate: 0 } }),
        fetch(`https://brettzone.nhrl.io/brettZone/fightsByBot.php?bot=${cleanName}`, { next: { revalidate: 0 } }),
      ])
      if (statsRes.ok) botStatsMap[robot.id] = (await statsRes.json()).botStats
      if (fightsRes.ok) botFightsMap[robot.id] = parseFightsByBot(await fightsRes.text(), cleanName)
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

  for (const robot of nhrlRobots) {
    const cleanName = robot.stats.nhrl_clean_name
    const botStats = botStatsMap[robot.id]
    const fights = botFightsMap[robot.id] ?? []

    // Group fights by tournament → calculate W/L
    const byTournament = new Map<string, { name: string, wins: number, losses: number }>()
    for (const fight of fights) {
      const t = byTournament.get(fight.tournamentId) ?? { name: fight.tournamentName, wins: 0, losses: 0 }
      if (fight.won) t.wins++ else t.losses++
      byTournament.set(fight.tournamentId, t)
    }

    // Fetch brackets for all tournaments this bot competed in (for placement/Prime Time)
    const bracketMap = new Map<string, BracketRound[]>()
    await Promise.all([...byTournament.keys()].map(async tid => {
      try {
        const bRes = await fetch(`${NHRL_BRACKET_BASE}?tournamentID=${tid}`, { next: { revalidate: 0 } })
        if (bRes.ok) bracketMap.set(tid, parseBracketHtml(await bRes.text()))
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
      const bracketRounds = bracketMap.get(tournamentId) ?? []
      const bracketPlacement = getPlacementFromBracket(bracketRounds, cleanName) ??
        getPlacementFromBracket(bracketRounds, botStats?.botName ?? '')

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

  // 6. Add upcoming Open events (not Pro Tour) for all NHRL bots
  const now = new Date()
  for (const ev of upcomingFromWebsite) {
    if (!ev.date || new Date(ev.date) <= now) continue
    // Skip Pro Tour events — only qualified bots attend those
    if (/pro tour/i.test(ev.title)) continue
    const { data: eventRow } = await supabase.from('events').select('id').eq('external_id', ev.external_id).single()
    if (!eventRow) continue
    for (const robot of nhrlRobots) {
      const { data: existing } = await supabase.from('robot_results').select('id')
        .eq('robot_id', robot.id).eq('event_id', eventRow.id).single()
      if (!existing) {
        await supabase.from('robot_results').insert({
          robot_id: robot.id, event_id: eventRow.id,
          wins: 0, losses: 0, placement: null, is_highlight: false, notes: 'NHRL upcoming',
        })
      }
    }
  }

  // 8. Update each NHRL bot's stats and try to fetch image from BrettZone
  const { data: freshRobots } = await supabase.from('robots').select('id, slug, stats, image_url').in('id', nhrlRobots.map(r => r.id))
  for (const robot of freshRobots ?? []) {
    const botStats = botStatsMap[robot.id]
    if (!botStats) continue
    const cleanName = robot.stats?.nhrl_clean_name
    const updatedStats = {
      ...robot.stats,
      nhrl_wins: botStats.totalWins,
      nhrl_losses: botStats.totalLosses,
      nhrl_tournaments: botStats.totalTournaments,
      nhrl_win_rate: botStats.winRate,
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
  return NextResponse.json({ ok: true, eventsAdded, eventsUpdated, resultsAdded })
}
