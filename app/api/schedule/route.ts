import { NextRequest, NextResponse } from 'next/server';
import { matchupQualityGuardrail, matchupQualityIndex, normalizeTeamName, ratingLabel, type TeamRating } from '@/lib/team-quality';

const NCAA_DATA = 'https://ncaa-api.henrygd.me/rankings/basketball-men/d1/ncaa-mens-basketball-net-rankings';
const KENPOM_API = 'https://kenpom.com/api.php';

type EspnCompetitor = {
  homeAway: 'home' | 'away';
  score?: string;
  records?: Array<{ type: string; summary: string }>;
  curatedRank?: { current?: number };
  team: {
    id: string;
    shortDisplayName: string;
    abbreviation: string;
    color?: string;
    logo?: string;
    isActive?: boolean;
  };
};

const rivalryBonuses: Record<string, number> = {
  'duke|north carolina': 15,
  'kentucky|louisville': 11,
  'cincinnati|xavier': 11,
  'indiana|purdue': 11,
  'alabama|auburn': 11,
  'arizona|arizona state': 7,
  'kansas|kansas state': 7,
  'michigan|michigan state': 7,
  'minnesota|wisconsin': 7,
  "gonzaga|saint mary's": 7,
  'richmond|vcu': 7,
  'byu|utah': 7,
  'ucla|usc': 7,
  'texas|texas a&m': 7,
  'dayton|vcu': 4,
  'indiana|kentucky': 7,
  'georgia|georgia tech': 7,
};

// Early-season records are noisy, so established team strength keeps proven
// high-level programs and excellent mid-majors from being treated as generic.
// These baselines will eventually be replaced by the rolling efficiency feed.
const programQuality: Record<string, number> = {
  "saint mary's": 0.9,
  'saint louis': 0.78,
  'vcu': 0.8,
  'santa clara': 0.74,
  'wisconsin': 0.86,
  'seton hall': 0.73,
  'dayton': 0.79,
  'gonzaga': 0.94,
  'drake': 0.76,
  'marquette': 0.88,
  'creighton': 0.86,
  'houston': 0.96,
  'kansas': 0.96,
  'duke': 0.97,
  'north carolina': 0.93,
  'iowa state': 0.92,
  'florida': 0.93,
  'auburn': 0.92,
  'purdue': 0.94,
  'uconn': 0.95,
  'michigan': 0.92,
  'villanova': 0.87,
  'kentucky': 0.94,
  'indiana': 0.85,
  'iowa': 0.8,
  'xavier': 0.85,
  'oklahoma st': 0.78,
  'minnesota': 0.76,
  'rhode island': 0.74,
  'liberty': 0.81,
  'utah': 0.77,
  'georgia': 0.78,
  'georgia tech': 0.73,
  'northwestern': 0.8,
  'virginia tech': 0.78,
  'uab': 0.79,
  's illinois': 0.58,
  'ut martin': 0.5,
};

// Atmosphere baselines measure intensity rather than building size. A small,
// packed arena can therefore rate above a larger building with empty seats.
const homeAtmosphere: Record<string, number> = {
  "saint mary's": 82,
  'villanova': 89,
  'michigan': 88,
  'wisconsin': 92,
  'kansas': 93,
  'duke': 94,
  'north carolina': 90,
  'iowa state': 95,
  'purdue': 94,
  'indiana': 92,
  'kentucky': 91,
  'gonzaga': 92,
  'dayton': 93,
  'vcu': 88,
  'houston': 87,
  'auburn': 91,
  'creighton': 88,
  'marquette': 87,
  'xavier': 89,
};

const venueAtmosphereAdjustment: Record<string, number> = {
  // Villanova's NBA arena draws more people but is less concentrated than the Pavilion.
  'xfinity mobile arena': -12,
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const winPct = (summary: string) => {
  const [wins, losses] = summary.split('-').map(Number);
  return Number.isFinite(wins) && Number.isFinite(losses) && wins + losses > 0 ? wins / (wins + losses) : 0.5;
};
const pairKey = (a: string, b: string) => [a.toLowerCase(), b.toLowerCase()].sort().join('|');

async function loadNetRatings() {
  const ratings = new Map<string, TeamRating>();
  try {
    const response = await fetch(NCAA_DATA, { next: { revalidate: 900 }, headers: { Accept: 'application/json' } });
    if (!response.ok) return ratings;
    const payload: any = await response.json();
    for (const row of Array.isArray(payload.data) ? payload.data : []) {
      const rank = Number(row.Rank);
      if (row.School && Number.isFinite(rank)) ratings.set(normalizeTeamName(row.School), { netRank: rank });
    }
  } catch {}
  return ratings;
}

async function loadKenPomRatings(date: string) {
  const ratings = new Map<string, number>();
  const apiKey = process.env.KENPOM_API_KEY;
  if (!apiKey) return ratings;

  try {
    const month = Number(date.slice(5, 7));
    const calendarYear = Number(date.slice(0, 4));
    const season = month >= 7 ? calendarYear + 1 : calendarYear;
    const response = await fetch(`${KENPOM_API}?endpoint=ratings&y=${season}`, {
      next: { revalidate: 21600 },
      headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return ratings;
    const payload: any = await response.json();
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : [];
    for (const row of rows) {
      const rank = Number(row.RankAdjEM);
      if (row.TeamName && Number.isFinite(rank)) ratings.set(normalizeTeamName(row.TeamName), rank);
    }
  } catch {}
  return ratings;
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Use a date in YYYY-MM-DD format.' }, { status: 400 });
  }

  const espnDate = date.replaceAll('-', '');
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${espnDate}&limit=500&groups=50`;

  try {
    const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`ESPN returned ${response.status}`);
    const payload: any = await response.json();
    const [netRatings, kenPomRatings] = await Promise.all([loadNetRatings(), loadKenPomRatings(date)]);

    const teamRating = (name: string): TeamRating => {
      const key = normalizeTeamName(name);
      return { ...netRatings.get(key), kenPomRank: kenPomRatings.get(key) };
    };

    const games = (payload.events ?? []).map((event: any) => {
      const competition = event.competitions?.[0] ?? {};
      const competitors = (competition.competitors ?? []) as EspnCompetitor[];
      const home = competitors.find((team) => team.homeAway === 'home');
      const away = competitors.find((team) => team.homeAway === 'away');
      if (!home || !away) return null;

      const rank = (team: EspnCompetitor) => {
        const value = team.curatedRank?.current;
        return value && value <= 25 ? value : undefined;
      };
      const record = (team: EspnCompetitor) => team.records?.find((item) => item.type === 'total')?.summary ?? '—';
      const homeRank = rank(home);
      const awayRank = rank(away);
      const bothRanked = Boolean(homeRank && awayRank);
      const oneRanked = Boolean(homeRank || awayRank);
      const state = event.status?.type?.state ?? 'pre';
      const margin = Math.abs(Number(home.score ?? 0) - Number(away.score ?? 0));
      const period = Number(event.status?.period ?? 0);
      const clockSeconds = Number(event.status?.clock ?? 0);
      const homeRecord = record(home);
      const awayRecord = record(away);
      const homeRecordKnown = homeRecord !== '—';
      const awayRecordKnown = awayRecord !== '—';
      const lowerDivisionOpponent = home.team.isActive === false || away.team.isActive === false;
      const homeWinPct = winPct(homeRecord);
      const awayWinPct = winPct(awayRecord);
      const oddsText = competition.odds?.[0]?.details ?? '';
      const spreadMatch = oddsText.match(/(-?\d+(?:\.\d+)?)$/);
      const spread = spreadMatch ? Math.abs(Number(spreadMatch[1])) : undefined;
      const rivalry = rivalryBonuses[pairKey(home.team.shortDisplayName, away.team.shortDisplayName)] ?? 0;
      const eventNote = competition.notes?.[0]?.headline ?? '';
      const eventStakes = /ncaa tournament|conference tournament|conference championship|national championship|title game/i.test(eventNote)
        ? 6
        : /championship/i.test(eventNote)
          ? 3
          : /semifinal|quarterfinal/i.test(eventNote)
            ? 2
            : 0;
      const highStakesEvent = eventStakes > 0;
      const homeProgramQuality = programQuality[home.team.shortDisplayName.toLowerCase()] ?? 0.52;
      const awayProgramQuality = programQuality[away.team.shortDisplayName.toLowerCase()] ?? 0.52;
      const homeRating = teamRating(home.team.shortDisplayName);
      const awayRating = teamRating(away.team.shortDisplayName);
      const averageRecordQuality = (homeWinPct + awayWinPct) / 2;
      const averageProgramQuality = (homeProgramQuality + awayProgramQuality) / 2;
      const provenQualityMatchup = homeProgramQuality >= 0.7 && awayProgramQuality >= 0.7;
      const eventDate = new Date(event.date);
      const utcHour = eventDate.getUTCHours();
      const utcDay = eventDate.getUTCDay();
      const timingBonus = (utcDay === 0 || utcDay === 6 ? 2 : 0) + (utcHour >= 23 || utcHour <= 4 ? 1 : 0);
      const rankedDemand = bothRanked ? 7 : oneRanked ? 4 : 0;
      const venueKey = String(competition.venue?.fullName ?? '').toLowerCase();
      const venueAdjustment = venueAtmosphereAdjustment[venueKey] ?? 0;
      const knownHomeAtmosphere = homeAtmosphere[home.team.shortDisplayName.toLowerCase()];
      const formAdjustment = clamp((homeWinPct - 0.5) * 10, -5, 5);
      const opponentDemand = Math.max(0, (awayProgramQuality - 0.52) * 12);

      const projectedCloseness = spread !== undefined
        ? clamp(1 - spread / 20, 0.12, 1)
        : lowerDivisionOpponent ? 0.16
        : !homeRecordKnown || !awayRecordKnown ? 0.28
        : clamp(1 - (Math.abs(homeWinPct - awayWinPct) * 0.6 + Math.abs(homeProgramQuality - awayProgramQuality) * 0.4), 0.22, 1);
      const competitiveness = 22 * projectedCloseness;
      const qualityIndex = matchupQualityIndex(
        homeRating,
        awayRating,
        clamp(homeProgramQuality * 0.7 + homeWinPct * 0.3, 0.15, 0.9),
        clamp(awayProgramQuality * 0.7 + awayWinPct * 0.3, 0.15, 0.9),
      );
      const matchupQuality = 50 * clamp(qualityIndex * 0.9 + averageRecordQuality * 0.1, 0, 1);
      const qualityGuardrail = matchupQualityGuardrail(homeRating, awayRating);
      const crowdScore = Math.round(clamp(
        competition.neutralSite
          ? 48 + averageProgramQuality * 18 + rankedDemand + Math.min(rivalry, 8) + (highStakesEvent ? 6 : 0) + timingBonus
          : (knownHomeAtmosphere ?? 54) + venueAdjustment + formAdjustment + opponentDemand + rankedDemand + Math.min(rivalry, 8) + (highStakesEvent ? 4 : 0) + timingBonus - (lowerDivisionOpponent ? 12 : 0),
        25,
        92,
      ));
      const crowdConfidence = lowerDivisionOpponent ? 'Low' : knownHomeAtmosphere !== undefined || competition.neutralSite ? 'Medium' : 'Low';
      const stakes = clamp(rivalry + eventStakes, 0, 15);
      const nationalSignificance = bothRanked ? 5 : oneRanked ? 3 : 0;
      const crowdContribution = crowdScore * 0.08;
      const rawWatchability = competitiveness + crowdContribution + matchupQuality + stakes + nationalSignificance + qualityGuardrail.adjustment;
      const contextCeiling = rivalry >= 11 ? Math.max(qualityGuardrail.ceiling, 82) : rivalry >= 7 || eventStakes >= 6 ? Math.max(qualityGuardrail.ceiling, 76) : qualityGuardrail.ceiling;
      const scoreCeiling = lowerDivisionOpponent ? 48 : contextCeiling;
      const watchability = Math.round(clamp(rawWatchability + 4, 0, scoreCeiling));
      const qualityRatio = clamp(matchupQuality / 50, 0, 1);
      const liveCloseness = clamp(40 - margin * 4, 0, 40);
      const liveProgress = period >= 3
        ? 25
        : period === 2
          ? 8 + clamp((1200 - clockSeconds) / 1200, 0, 1) * 12
          : clamp((1200 - clockSeconds) / 1200, 0, 1) * 6;
      const lateDrama = period >= 3
        ? 12
        : period === 2
          ? (clockSeconds <= 300 && margin <= 10 ? 6 : 0)
            + (clockSeconds <= 120 && margin <= 6 ? 8 : 0)
            + (clockSeconds <= 30 && margin <= 3 ? 8 : 0)
          : 0;
      const liveExcitement = state === 'in'
        ? Math.round(clamp(12 + liveCloseness + liveProgress + lateDrama + qualityRatio * 12, 30, 99))
        : undefined;
      const liveRankScore = state === 'in' && liveExcitement !== undefined
        ? Math.round(clamp(liveExcitement * 0.65 + watchability * 0.35, 0, 99))
        : undefined;
      const liveFactors = state === 'in' ? [
        margin <= 3 ? 'one-possession game' : margin <= 8 ? 'close game' : null,
        period >= 3 ? 'overtime' : period === 2 && clockSeconds <= 300 ? 'late second half' : period === 2 ? 'second half' : 'first half',
        qualityRatio >= 0.78 ? 'high-quality matchup' : qualityRatio >= 0.65 ? 'solid team quality' : null,
      ].filter(Boolean) : [];

      const tags = [
        bothRanked ? 'Ranked matchup' : oneRanked ? 'Top 25 team' : null,
        spread !== undefined && spread <= 4 ? 'Projected close' : null,
        !oneRanked && !qualityGuardrail.limited ? 'Quality unranked matchup' : null,
        qualityGuardrail.limited ? 'Quality ceiling applied' : null,
        rivalry >= 11 ? 'Major rivalry' : rivalry ? 'Rivalry' : null,
        lowerDivisionOpponent ? 'Lower-division opponent' : null,
        eventNote || null,
        competition.neutralSite ? 'Neutral site' : null,
      ].filter(Boolean);
      const rankingReasons = [
        `${away.team.shortDisplayName}: ${ratingLabel(awayRating)}`,
        `${home.team.shortDisplayName}: ${ratingLabel(homeRating)}`,
        qualityGuardrail.label,
        spread !== undefined && spread <= 6 ? `${spread}-point betting line` : `${Math.round(competitiveness)} of 22 competitiveness points`,
        `${homeRecord} vs ${awayRecord} records`,
        lowerDivisionOpponent ? 'lower-division opponent limits the pregame ceiling' : null,
        qualityGuardrail.limited ? `team quality limits this game's pregame ceiling to ${scoreCeiling}` : null,
        provenQualityMatchup ? 'two proven quality programs' : null,
        rivalry ? `${rivalry}-point rivalry boost` : null,
        highStakesEvent ? eventNote : null,
      ].filter(Boolean);

      return {
        id: Number(event.id),
        date: event.date,
        time: '',
        network: competition.broadcasts?.flatMap((item: any) => item.names ?? []).join(' · ') || 'Broadcast TBD',
        away: { id: away.team.id, name: away.team.shortDisplayName, short: away.team.abbreviation, record: awayRecord, rank: awayRank, netRank: awayRating.netRank, kenPomRank: awayRating.kenPomRank, color: `#${away.team.color || '456'}`, logo: away.team.logo, score: away.score },
        home: { id: home.team.id, name: home.team.shortDisplayName, short: home.team.abbreviation, record: homeRecord, rank: homeRank, netRank: homeRating.netRank, kenPomRank: homeRating.kenPomRank, color: `#${home.team.color || '456'}`, logo: home.team.logo, score: home.score },
        venue: competition.venue?.fullName || 'Venue TBD',
        city: [competition.venue?.address?.city, competition.venue?.address?.state].filter(Boolean).join(', ') || 'Location TBD',
        watchability,
        crowd: crowdScore,
        margin: state === 'pre' ? 'Projection pending' : event.status?.type?.shortDetail || event.status?.type?.detail || '',
        tags,
        conference: 'NCAA Division I',
        state,
        status: event.status?.type?.shortDetail || event.status?.type?.description || '',
        liveExcitement,
        liveRankScore,
        liveFactors,
        neutralSite: Boolean(competition.neutralSite),
        crowdConfidence,
        crowdFactors: [
          competition.neutralSite ? 'neutral-site demand model' : knownHomeAtmosphere !== undefined ? 'historical home-atmosphere baseline' : 'general home-atmosphere baseline',
          venueAdjustment ? 'venue-specific adjustment' : null,
          opponentDemand >= 3 ? 'strong opponent demand' : null,
          rankedDemand ? 'ranked-team demand' : null,
          rivalry ? 'rivalry demand' : null,
          lowerDivisionOpponent ? 'lower-division demand penalty' : null,
          timingBonus >= 2 ? 'weekend or evening boost' : null,
        ].filter(Boolean),
        rankingReasons,
        breakdown: { competitiveness: Math.round(competitiveness), crowd: Math.round(crowdContribution), matchupQuality: Math.round(matchupQuality), stakes: Math.round(stakes), nationalSignificance },
      };
    }).filter(Boolean);

    const baseOrder = [...games].sort((a: any, b: any) =>
      b.watchability - a.watchability
      || b.breakdown.matchupQuality - a.breakdown.matchupQuality
      || b.breakdown.competitiveness - a.breakdown.competitiveness,
    );
    const strongGameCount = baseOrder.filter((game: any) => game.watchability >= 70).length;
    const tenthBestScore = baseOrder[9]?.watchability ?? 100;
    let finalOrder = baseOrder;

    // On a genuinely weak slate, give ranked teams visibility without changing
    // their model score or letting the rule place them inside the top ten.
    if (baseOrder.length >= 15 && strongGameCount < 10 && tenthBestScore < 70) {
      const topTen = baseOrder.slice(0, 10);
      const rest = baseOrder.slice(10);
      const rankedVisibilityGames = rest
        .filter((game: any) => Boolean(game.away.rank || game.home.rank) && !game.tags.includes('Lower-division opponent'))
        .sort((a: any, b: any) => b.watchability - a.watchability || Math.min(a.away.rank ?? 99, a.home.rank ?? 99) - Math.min(b.away.rank ?? 99, b.home.rank ?? 99))
        .slice(0, 5);
      const promotedIds = new Set(rankedVisibilityGames.map((game: any) => game.id));
      const remainingGames = rest.filter((game: any) => !promotedIds.has(game.id));
      rankedVisibilityGames.forEach((game: any) => {
        if (baseOrder.findIndex((candidate: any) => candidate.id === game.id) >= 15) {
          game.tags = [...game.tags, 'Ranked slate priority'];
          game.rankingReasons = [...game.rankingReasons, 'top-15 visibility on a slate with fewer than ten strong matchups'];
        }
      });
      finalOrder = [...topTen, ...rankedVisibilityGames, ...remainingGames];
    }

    finalOrder.forEach((game: any, index: number) => { game.rankingOrder = index + 1; });

    return NextResponse.json({
      date,
      games: finalOrder,
      source: 'ESPN schedule reference',
      sourceUrl: 'https://www.espn.com/mens-college-basketball/schedule',
      ratingSources: { net: netRatings.size > 0, kenPom: kenPomRatings.size > 0 },
    });
  } catch (error) {
    return NextResponse.json({ error: 'The ESPN schedule could not be loaded right now.' }, { status: 502 });
  }
}
