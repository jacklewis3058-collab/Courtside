export type TeamRating = {
  netRank?: number;
  kenPomRank?: number;
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

export function bothOutsideTop150(home: TeamRating, away: TeamRating) {
  const ranks = [home.netRank, home.kenPomRank, away.netRank, away.kenPomRank];
  const hasHomeRating = home.netRank !== undefined || home.kenPomRank !== undefined;
  const hasAwayRating = away.netRank !== undefined || away.kenPomRank !== undefined;
  return hasHomeRating && hasAwayRating && ranks.every((rank) => rank === undefined || rank > 150);
}

export function ratingLabel(rating: TeamRating) {
  const parts = [
    rating.netRank !== undefined ? `NET #${rating.netRank}` : null,
    rating.kenPomRank !== undefined ? `KenPom #${rating.kenPomRank}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'ratings unavailable';
}
