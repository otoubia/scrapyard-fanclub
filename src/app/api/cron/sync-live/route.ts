import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

const BRETTZONE = 'https://brettzone.nhrl.io/brettZone/backend'
const NHRL_LOCATION = '165 Water St., Norwalk, CT 06854'
const NHRL_YOUTUBE = 'https://www.youtube.com/@NHRLrobot/live'

function checkAuth(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}` || auth === `Bearer ${process.env.ADMIN_SECRET}`
}

interface LiveFight {
  id: string
  tournamentID: string
  tournamentName?: string
  round: string
  cage: string
  player1: string
  player1clean: string
  player2: string
  player2clean: string
  winner: string       // "Red" | "Blue" | ""
  winAnnotation: string
  startTime: string
  matchLength: string
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServiceClient()

  // 1. Get our NHRL bots
  const { data: allRobots } = await supabase.from('robots').select('id, name, slug, stats').eq('active', true)
  const nhrlRobots = (allRobots ?? []).filter(r => r.stats?.nhrl_clean_name)
  const nhrlCleanNames = new Set(nhrlRobots.map(r => r.stats.nhrl_clean_name as string))

  // 2. Fetch fights from last 24 hours
  const last24Res = await fetch(`${BRETTZONE}/fightsLast24Hours.php`, { next: { revalidate: 0 } })
  if (!last24Res.ok) return NextResponse.json({ error: 'Failed to fetch live data' }, { status: 500 })
  const last24Data = await last24Res.json()
  const recentFights: LiveFight[] = last24Data.fights ?? []

  if (recentFights.length === 0) {
    // No activity — make sure any previously 'current' NHRL events are set back to past
    await supabase.from('events')
      .update({ status: 'past', updated_at: new Date().toISOString() })
      .eq('event_source', 'nhrl')
      .eq('status', 'current')
    revalidatePath('/')
    return NextResponse.json({ live: false, message: 'No active NHRL event' })
  }

  // 3. Find unique active tournament IDs
  const activeTournamentIds = [...new Set(recentFights.map(f => f.tournamentID))]

  let liveBotsFound: string[] = []
  let totalResultsUpdated = 0

  for (const tournamentId of activeTournamentIds) {
    // 4. Fetch ALL fights in this tournament
    const allFightsRes = await fetch(
      `${BRETTZONE}/getTournamentMatchesDataTables.php?tournamentID=${tournamentId}&start=0&length=-1&draw=1`,
      { next: { revalidate: 0 } }
    )
    if (!allFightsRes.ok) continue
    const allFightsData = await allFightsRes.json()
    const allFights: LiveFight[] = allFightsData.data ?? []

    // 5. Filter to our bots' fights
    const ourFights = allFights.filter(f =>
      nhrlCleanNames.has(f.player1clean) || nhrlCleanNames.has(f.player2clean)
    )
    if (ourFights.length === 0) continue

    // 6. Find or create the event in DB
    const externalId = `nhrl:${tournamentId}`
    const { data: existingEvent } = await supabase
      .from('events').select('id, title').eq('external_id', externalId).single()

    // Determine tournament name from fights
    const tournamentName = recentFights.find(f => f.tournamentID === tournamentId)?.tournamentName
      ?? allFights[0]?.tournamentName
      ?? tournamentId

    let eventId: string | null = existingEvent?.id ?? null
    if (existingEvent) {
      await supabase.from('events').update({
        status: 'current', livestream_url: NHRL_YOUTUBE, updated_at: new Date().toISOString()
      }).eq('id', eventId)
    } else {
      const { data: newEvent } = await supabase.from('events').insert({
        title: tournamentName, event_source: 'nhrl', external_id: externalId,
        status: 'current', start_date: new Date().toISOString(),
        location: NHRL_LOCATION, livestream_url: NHRL_YOUTUBE, updated_at: new Date().toISOString(),
      }).select('id').single()
      eventId = newEvent?.id ?? null
    }
    if (!eventId) continue

    // 7. Calculate W/L per bot and upsert robot_results
    for (const robot of nhrlRobots) {
      const clean = robot.stats.nhrl_clean_name as string
      const botFights = ourFights.filter(f =>
        (f.player1clean === clean || f.player2clean === clean) && f.winner !== ''
      )
      if (botFights.length === 0) continue

      liveBotsFound.push(robot.name)

      const wins = botFights.filter(f =>
        (f.player1clean === clean && f.winner === 'Red') ||
        (f.player2clean === clean && f.winner === 'Blue')
      ).length
      const losses = botFights.length - wins

      // Get most recent fight for status
      const lastFight = botFights[0] // sorted by startTime desc
      const lastOpponent = lastFight.player1clean === clean ? lastFight.player2 : lastFight.player1
      const lastResult = (
        (lastFight.player1clean === clean && lastFight.winner === 'Red') ||
        (lastFight.player2clean === clean && lastFight.winner === 'Blue')
      ) ? 'W' : 'L'

      const { data: existingResult } = await supabase.from('robot_results')
        .select('id').eq('robot_id', robot.id).eq('event_id', eventId).single()

      const notes = `Live: last fight vs ${lastOpponent} (${lastResult})`
      if (existingResult) {
        await supabase.from('robot_results').update({ wins, losses, notes })
          .eq('id', existingResult.id)
      } else {
        await supabase.from('robot_results').insert({
          robot_id: robot.id, event_id: eventId, wins, losses,
          placement: null, is_highlight: false, notes,
        })
      }
      totalResultsUpdated++
      revalidatePath(`/robots/${robot.slug}`)
    }
  }

  revalidatePath('/')
  return NextResponse.json({
    live: liveBotsFound.length > 0,
    activeTournaments: activeTournamentIds,
    liveBots: liveBotsFound,
    resultsUpdated: totalResultsUpdated,
    totalRecentFights: recentFights.length,
  })
}
