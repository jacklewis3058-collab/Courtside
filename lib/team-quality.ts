export type TeamRating = {
  netRank?: number;
  kenPomRank?: number;
};

export type MatchupQualityGuardrail = {
  adjustment: number;
  ceiling: number;
  label: string;
  limited: boolean;
};

const aliases: Record<string, string> = {
  appst: 'appalachianst',
  carkansas: 'centralarkansas',
  connecticut: 'uconn',
  eillinois: 'easternillinois',
  fdu: 'fairleighdickinson',
  gasouthern: 'georgiasouthern',
  iuindy: 'iuindianapolis',
  mdeastern: 'marylandeasternshore',
  'miamifl': 'miami',
  'miamifla': 'miami',
  mtsu: 'middletenn',
  ndakotast: 'northdakotast',
  nkentucky: 'northernkentucky',
  'northcarolinast': 'ncst',
  'saintmarysca': 'stmarys',
  sfaustin: 'sfa',
  sillinois: 'southernill',
  'stjohnsny': 'stjohns',
  'texasam': 'texasandm',
  'utrgv': 'texasriograndevalley',
};

export function normalizeTeamName(name: string) {
  const normalized = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/&/g, 'and')
    .replace(/saint/g, 'st')
    .replace(/state/g, 'st')
    .replace(/[^a-z0-9]/g, '');
  return aliases[normalized] ?? normalized;
}

function rankStrength(rank?: number) {
  if (rank === undefined) return undefined;
  if (rank <= 25) return 1;
  if (rank <= 50) return 0.92;
  if (rank <= 75) return 0.84;
  if (rank <= 100) return 0.75;
  if (rank <= 150) return 0.61;
  if (rank <= 200) return 0.38;
  if (rank <= 250) return 0.25;
  return 0.14;
}

function blendedStrength(rating: TeamRating, fallback: number) {
  const net = rankStrength(rating.netRank);
  const kenPom = rankStrength(rating.kenPomRank);
  if (net !== undefined && kenPom !== undefined) return net * 0.45 + kenPom * 0.55;
  return net ?? kenPom ?? fallback;
}

function bestAvailableRank(rating: TeamRating) {
  const ranks = [rating.netRank, rating.kenPomRank].filter((rank): rank is number => rank !== undefined);
  return ranks.length ? Math.min(...ranks) : undefined;
}

export function matchupQualityGuardrail(home: TeamRating, away: TeamRating): MatchupQualityGuardrail {
  const homeRank = bestAvailableRank(home);
  const awayRank = bestAvailableRank(away);
  if (homeRank === undefined || awayRank === undefined) {
    return { adjustment: -2, ceiling: 78, label: 'incomplete team-quality data', limited: true };
  }

  const better = Math.min(homeRank, awayRank);
  const weaker = Math.max(homeRank, awayRank);
  if (weaker <= 50) return { adjustment: 7, ceiling: 98, label: 'two top-50 teams', limited: false };
  if (weaker <= 75) return { adjustment: 5, ceiling: 98, label: 'two top-75 teams', limited: false };
  if (weaker <= 100 && better <= 50) return { adjustment: 6, ceiling: 94, label: 'top-50 team against a top-100 opponent', limited: false };
  if (weaker <= 100 && better <= 75) return { adjustment: 1, ceiling: 84, label: 'top-75 team against a top-100 opponent', limited: false };
  if (weaker <= 100) return { adjustment: -10, ceiling: 58, label: 'neither team reaches the top 75', limited: true };
  if (weaker <= 150 && better <= 75) return { adjustment: -2, ceiling: 78, label: 'one top-75 team but a weaker opponent', limited: true };
  if (weaker <= 150) return { adjustment: -7, ceiling: 62, label: 'no top-75 team in the matchup', limited: true };
  if (better <= 150) return { adjustment: -9, ceiling: 58, label: 'only one team reaches the top 150', limited: true };
  return { adjustment: -12, ceiling: 52, label: 'both teams are outside the top 150', limited: true };
}

export function matchupQualityIndex(
  home: TeamRating,
  away: TeamRating,
  homeFallback: number,
  awayFallback: number,
) {
  const homeStrength = blendedStrength(home, homeFallback);
  const awayStrength = blendedStrength(away, awayFallback);
  const stronger = Math.max(homeStrength, awayStrength);
  const weaker = Math.min(homeStrength, awayStrength);

  // The weaker team matters most. This is deliberately different from a
  // popularity score: two strong teams beat one brand-name team and a cupcake.
  return Math.min(1, weaker * 0.62 + stronger * 0.25 + ((homeStrength + awayStrength) / 2) * 0.13);
}

export function ratingLabel(rating: TeamRating) {
  const parts = [
    rating.netRank !== undefined ? `NET #${rating.netRank}` : null,
    rating.kenPomRank !== undefined ? `KenPom #${rating.kenPomRank}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'ratings unavailable';
}
