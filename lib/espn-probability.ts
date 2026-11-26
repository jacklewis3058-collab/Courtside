export type EspnProbabilityOutcome = {
  teamId?: string;
  team: string;
  probability: number;
};

export type EspnProbabilityResult = {
  provider: 'ESPN';
  available: boolean;
  outcomes?: EspnProbabilityOutcome[];
  marketTitle?: string;
  marketUrl?: string;
  asOf?: string;
  reason?: string;
  state?: string;
};

type EspnTeam = {
  id?: string;
  homeAway?: 'home' | 'away';
  team?: { id?: string; shortDisplayName?: string; displayName?: string };
};

const roundedPercent = (value: number) => Math.round(value * 10) / 10;

export async function loadEspnProbability(eventId: string): Promise<EspnProbabilityResult> {
  const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${eventId}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`ESPN returned ${response.status}`);

  const data = await response.json();
  const competition = data.header?.competitions?.[0];
  const state = competition?.status?.type?.state ?? 'pre';
  const competitors: EspnTeam[] = competition?.competitors ?? [];
  const bySide = (side: 'home' | 'away') => competitors.find((team) => team.homeAway === side);
  const home = bySide('home');
  const away = bySide('away');
  const outcome = (team: EspnTeam | undefined, probability: number) => ({
    teamId: team?.team?.id ?? team?.id,
    team: team?.team?.shortDisplayName ?? team?.team?.displayName ?? 'Team',
    probability: roundedPercent(probability),
  });

  if (state === 'in' && Array.isArray(data.winprobability) && data.winprobability.length) {
    const latest = [...data.winprobability].reverse().find((entry) => Number.isFinite(Number(entry?.homeWinPercentage)));
    if (latest) {
      const rawHome = Number(latest.homeWinPercentage);
      const homeProbability = rawHome <= 1 ? rawHome * 100 : rawHome;
      const awayProbability = 100 - homeProbability;
      return {
        provider: 'ESPN',
        available: true,
        outcomes: [outcome(away, awayProbability), outcome(home, homeProbability)],
        marketTitle: 'ESPN Live Win Probability',
        marketUrl: `https://www.espn.com/mens-college-basketball/game/_/gameId/${eventId}`,
        asOf: new Date().toISOString(),
        state,
      };
    }
  }

  const predictor = data.predictor;
  const homeProjection = Number(predictor?.homeTeam?.gameProjection);
  const awayProjection = Number(predictor?.awayTeam?.gameProjection);
  if (Number.isFinite(homeProjection) && Number.isFinite(awayProjection)) {
    return {
      provider: 'ESPN',
      available: true,
      outcomes: [outcome(away, awayProjection), outcome(home, homeProjection)],
      marketTitle: predictor?.header ?? 'ESPN Matchup Predictor',
      marketUrl: `https://www.espn.com/mens-college-basketball/game/_/gameId/${eventId}`,
      asOf: new Date().toISOString(),
      state,
    };
  }

  return {
    provider: 'ESPN',
    available: false,
    reason: state === 'in'
      ? 'ESPN has not published a live win probability for this game yet.'
      : 'ESPN has not published a matchup prediction for this game.',
    state,
  };
}
