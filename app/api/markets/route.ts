import { NextRequest, NextResponse } from 'next/server';

type TeamProbability = { team: string; probability: number };
type ProviderResult = {
  provider: 'Kalshi';
  available: boolean;
  outcomes?: TeamProbability[];
  marketTitle?: string;
  marketUrl?: string;
  asOf?: string;
  reason?: string;
};

const aliases: Record<string, string[]> = {
  connecticut: ['uconn'],
  'miami fl': ['miami hurricanes'],
  'miami oh': ['miami ohio'],
  'saint marys': ['st marys'],
};

const normalize = (value: string) => value
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/\bst\.?\b/g, 'saint')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\b(university|college|mens|men|basketball|badgers|wildcats|bulldogs|eagles|tigers|bears)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const teamVariants = (team: string) => {
  const name = normalize(team);
  return [name, ...(aliases[name] ?? [])].map(normalize);
};

const mentionsTeam = (text: string, team: string) => {
  const source = ` ${normalize(text)} `;
  return teamVariants(team).some((variant) => variant.length >= 3 && source.includes(` ${variant} `));
};

const exactGameMatch = (text: string, away: string, home: string) => mentionsTeam(text, away) && mentionsTeam(text, home);
const percent = (value: unknown) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  const probability = number <= 1 ? number * 100 : number;
  return probability >= 0 && probability <= 100 ? Math.round(probability) : undefined;
};

const unavailable = (provider: ProviderResult['provider'], reason = 'No verified market matched this exact game.'): ProviderResult => ({ provider, available: false, reason });

async function getKalshi(away: string, home: string, date: string): Promise<ProviderResult> {
  try {
    const series = ['KXNCAAMBGAME', 'KXNCAABGAME', 'KXNCAAMBB'];
    const responses = await Promise.all(series.map((ticker) => fetch(`https://external-api.kalshi.com/trade-api/v2/events?series_ticker=${ticker}&status=open&with_nested_markets=true&limit=200`, { cache: 'no-store', headers: { Accept: 'application/json' } })));
    const payloads = await Promise.all(responses.filter((response) => response.ok).map((response) => response.json()));
    const events = payloads.flatMap((payload: any) => payload.events ?? []);
    const event = events.find((candidate: any) => {
      const marketsText = (candidate.markets ?? []).map((market: any) => `${market.title ?? ''} ${market.subtitle ?? ''} ${market.yes_sub_title ?? ''}`).join(' ');
      const text = `${candidate.title ?? ''} ${candidate.sub_title ?? ''} ${marketsText}`;
      const eventDate = String(candidate.strike_date ?? candidate.markets?.[0]?.expected_expiration_time ?? '').slice(0, 10);
      return exactGameMatch(text, away, home) && (!eventDate || Math.abs(new Date(eventDate).getTime() - new Date(date).getTime()) <= 86400000);
    });
    if (!event) return unavailable('Kalshi');

    const markets = event.markets ?? [];
    const getMarketProbability = (team: string) => {
      const market = markets.find((candidate: any) => mentionsTeam(`${candidate.yes_sub_title ?? ''} ${candidate.title ?? ''} ${candidate.subtitle ?? ''}`, team));
      if (!market) return null;
      const bid = Number(market.yes_bid_dollars);
      const ask = Number(market.yes_ask_dollars);
      const last = Number(market.last_price_dollars);
      const raw = Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask > 0 ? (bid + ask) / 2 : last;
      const probability = percent(raw);
      return probability === undefined ? null : { team, probability, market };
    };
    const awayResult = getMarketProbability(away);
    const homeResult = getMarketProbability(home);
    let outcomes: TeamProbability[] = [];
    if (awayResult && homeResult) {
      const total = awayResult.probability + homeResult.probability;
      const awayProbability = total > 0 ? Math.round((awayResult.probability / total) * 100) : awayResult.probability;
      outcomes = [{ team: away, probability: awayProbability }, { team: home, probability: 100 - awayProbability }];
    }
    else if (awayResult || homeResult) {
      const result = awayResult ?? homeResult!;
      outcomes = [{ team: result.team, probability: result.probability }, { team: result.team === away ? home : away, probability: 100 - result.probability }];
    }
    if (outcomes.length !== 2) return unavailable('Kalshi', 'A related event was found, but its team probabilities could not be verified.');
    const market = awayResult?.market ?? homeResult?.market;
    return {
      provider: 'Kalshi', available: true, outcomes,
      marketTitle: event.title ?? market?.title,
      marketUrl: market?.ticker ? `https://kalshi.com/markets/${String(market.ticker).toLowerCase()}` : 'https://kalshi.com/markets',
      asOf: new Date().toISOString(),
    };
  } catch { return unavailable('Kalshi', 'Kalshi data is temporarily unavailable.'); }
}

export async function GET(request: NextRequest) {
  const away = request.nextUrl.searchParams.get('away')?.trim() ?? '';
  const home = request.nextUrl.searchParams.get('home')?.trim() ?? '';
  const date = request.nextUrl.searchParams.get('date')?.trim() ?? '';
  if (!away || !home || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'away, home, and a YYYY-MM-DD date are required.' }, { status: 400 });
  }
  const kalshi = await getKalshi(away, home, date);
  return NextResponse.json({ kalshi, disclaimer: 'ESPN projections and market prices can change. Kalshi data is informational, not betting or financial advice.' });
}
