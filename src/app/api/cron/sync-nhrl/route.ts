import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

const NHRL_BASE = 'https://brettzone.nhrl.io/brettZone/api.php'
const NHRL_LOCATION = '165 Water St., Norwalk, CT 06854'
const RELEVANT_WEIGHT_CLASSES = [3, 12, 30]

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

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()

  // 1. Fetch full tournament list
  const tourRes = await fetch(`${NHRL_BASE}/tournaments`, { next: { revalidate: 0 } })
  if (!tourRes.ok) return NextResponse.json({ error: 'Failed to fetch NHRL tournaments' }, { status: 500 })
  const tourData = await tourRes.json()
  const allTournaments: NHRLTournament[] = tourData.tournaments ?? []

  // 2. Filter to relevant tournaments
  const relevant = allTournaments.filter(isRelevantTournament)

  // 3. Get NHRL robots from DB (those with nhrl_clean_name in stats)
  const { data: allRobots } = await supabase.from('robots').select('id, name, slug, stats').eq('active', true)
  const nhrlRobots = (allRobots ?? []).filter(r => r.stats?.nhrl_clean_name)

  // 4. Fetch career stats for each NHRL bot
  const botStatsMap: Record<string, any> = {}
  await Promise.all(nhrlRobots.map(async robot => {
    const cleanName = robot.stats.nhrl_clean_name
    try {
      const res = await fetch(`${NHRL_BASE}/stats/bot/${cleanName}`, { next: { revalidate: 0 } })
      if (res.ok) {
        const data = await res.json()
        botStatsMap[robot.id] = data.botStats
      }
    } catch {}
  }))

  // 5. For each relevant tournament, fetch its stats to check which of our bots competed
  // We check if our bot names appear in longestFight or shortestFight player names
  let eventsAdded = 0, eventsUpdated = 0, resultsAdded = 0

  for (const tournament of relevant) {
    const date = bestDate(tournament)
    const now = new Date()
    const status = date
      ? new Date(date) > now ? 'upcoming' : 'past'
      : 'past'
    const externalId = `nhrl:${tournament.tournamentID}`

    // Upsert the event
    const { data: existingEvent } = await supabase
      .from('events')
      .select('id, start_date')
      .eq('event_source', 'nhrl')
      .eq('external_id', externalId)
      .single()

    let eventId: string | null = null
    const eventData = {
      title: tournament.tournamentName,
      event_source: 'nhrl',
      external_id: externalId,
      status,
      start_date: date ?? new Date().toISOString(),
      location: NHRL_LOCATION,
      updated_at: new Date().toISOString(),
    }

    if (existingEvent) {
      eventId = existingEvent.id
      await supabase.from('events').update(eventData).eq('id', eventId)
      eventsUpdated++
    } else {
      const { data: newEvent } = await supabase
        .from('events').insert(eventData).select('id').single()
      eventId = newEvent?.id ?? null
      if (eventId) eventsAdded++
    }

    if (!eventId) continue

    // 6. Fetch tournament stats to check if our bots competed
    // Small delay to be nice to the API
    await new Promise(r => setTimeout(r, 200))
    let tournamentPlayers: string[] = []
    try {
      const tRes = await fetch(`${NHRL_BASE}/stats/tournament/${tournament.tournamentID}`, { next: { revalidate: 0 } })
      if (tRes.ok) {
        const tData = await tRes.json()
        const ts = tData.tournamentStats
        // Collect bot names mentioned in this tournament
        const names = [
          ts?.longestFight?.player1, ts?.longestFight?.player2,
          ts?.shortestFight?.player1, ts?.shortestFight?.player2,
        ].filter(Boolean).map((n: string) => n.toLowerCase().replace(/\s+/g, ''))
        tournamentPlayers = names
      }
    } catch {}

    // 7. For each NHRL bot, check if they competed and upsert robot_result
    for (const robot of nhrlRobots) {
      const cleanName = robot.stats.nhrl_clean_name
      const botStats = botStatsMap[robot.id]

      // Check if bot weight class matches tournament weight class
      const botWeightClass = botStats?.weightClasses?.[0]
      if (botWeightClass !== tournament.WeightClass) continue

      // Check if bot appears in this tournament's player list
      const botAppearsInTournament = tournamentPlayers.includes(cleanName.toLowerCase())

      // Also check: does this tournament appear in bot's known fights?
      const knownTournaments = [
        botStats?.longestFight?.tournamentID,
        botStats?.shortestFight?.tournamentID,
        ...(botStats?.recentFights ?? []).map((f: any) => f.tournamentID),
      ].filter(Boolean)
      const botInThisTournament = botAppearsInTournament || knownTournaments.includes(tournament.tournamentID)

      if (!botInThisTournament) continue

      // Upsert robot_result
      const { data: existingResult } = await supabase
        .from('robot_results')
        .select('id')
        .eq('robot_id', robot.id)
        .eq('event_id', eventId)
        .single()

      if (!existingResult) {
        await supabase.from('robot_results').insert({
          robot_id: robot.id,
          event_id: eventId,
          wins: 0,
          losses: 0,
          placement: null,
          is_highlight: false,
          notes: 'NHRL event',
        })
        resultsAdded++
      }
    }
  }

  // 8. Update each NHRL bot's stats with career totals
  for (const robot of nhrlRobots) {
    const botStats = botStatsMap[robot.id]
    if (!botStats) continue
    const updatedStats = {
      ...robot.stats,
      nhrl_wins: botStats.totalWins,
      nhrl_losses: botStats.totalLosses,
      nhrl_tournaments: botStats.totalTournaments,
      nhrl_win_rate: botStats.winRate,
    }
    await supabase.from('robots').update({ stats: updatedStats }).eq('id', robot.id)
    revalidatePath(`/robots/${robot.slug}`)
  }

  revalidatePath('/')
  return NextResponse.json({ ok: true, eventsAdded, eventsUpdated, resultsAdded })
}
