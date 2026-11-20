import { NextRequest, NextResponse } from 'next/server';

type EspnTeam = {
  id?: string;
  homeAway?: 'home' | 'away';
  team?: { id?: string; shortDisplayName?: string; displayName?: string };
};

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('eventId')?.trim() ?? '';
  if (!/^\d+$/.test(eventId)) {
    return NextResponse.json({ provider: 'ESPN', available: false, reason: 'A valid ESPN event ID is required.' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${eventId}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`ESPN returned ${response.status}`);
    const data: any = await response.json();
    const predictor = data.predictor;
    const competitors: EspnTeam[] = data.header?.competitions?.[0]?.competitors ?? [];
    const bySide = (side: 'home' | 'away') => competitors.find((team) => team.homeAway === side);
    const projection = (side: 'home' | 'away') => Number(predictor?.[`${side}Team`]?.gameProjection);
    const homeProbability = projection('home');
    const awayProbability = projection('away');

    if (!Number.isFinite(homeProbability) || !Number.isFinite(awayProbability)) {
      return NextResponse.json({ provider: 'ESPN', available: false, reason: 'ESPN has not published a matchup prediction for this game.' });
    }

    const home = bySide('home');
    const away = bySide('away');
    const outcome = (team: EspnTeam | undefined, probability: number) => ({
      teamId: team?.team?.id ?? team?.id,
      team: team?.team?.shortDisplayName ?? team?.team?.displayName ?? 'Team',
      probability: Math.round(probability * 10) / 10,
    });

    return NextResponse.json({
      provider: 'ESPN',
      available: true,
      outcomes: [outcome(away, awayProbability), outcome(home, homeProbability)],
      marketTitle: predictor?.header ?? 'Matchup Predictor',
      marketUrl: `https://www.espn.com/mens-college-basketball/game/_/gameId/${eventId}`,
      asOf: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ provider: 'ESPN', available: false, reason: 'ESPN win probability is temporarily unavailable.' });
  }
}
