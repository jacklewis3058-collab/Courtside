import { NextResponse } from 'next/server';

const NCAA_SOURCE = 'https://www.ncaa.com/rankings/basketball-men/d1/ncaa-mens-basketball-net-rankings';
const NCAA_DATA = 'https://ncaa-api.henrygd.me/rankings/basketball-men/d1/ncaa-mens-basketball-net-rankings';

export async function GET() {
  try {
    // This endpoint is a live JSON rendering of the linked NCAA.com table. NCAA.com
    // itself requires browser JavaScript, so the server reads the mirrored table and
    // keeps the official NCAA page as the user-facing source of record.
    const response = await fetch(NCAA_DATA, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`NCAA rankings returned ${response.status}`);
    const payload: any = await response.json();
    const rankings = (Array.isArray(payload.data) ? payload.data : []).map((row: Record<string, string>) => ({
      rank: Number(row.Rank), school: row.School, record: row.Record, conference: row.Conf,
      previous: row.Prev, quad1: row['Quad 1'], quad2: row['Quad 2'], quad3: row['Quad 3'], quad4: row['Quad 4'],
    })).filter((row: { rank: number; school?: string }) => Number.isFinite(row.rank) && row.school);
    if (!rankings.length) throw new Error('NCAA rankings table was empty');
    return NextResponse.json({ title: payload.title ?? "NCAA Men's Basketball NET Rankings", updated: payload.updated ?? 'Latest NCAA release', checkedAt: new Date().toISOString(), sourceUrl: NCAA_SOURCE, rankings });
  } catch {
    return NextResponse.json({ error: 'The latest NCAA NET rankings are temporarily unavailable.' }, { status: 502 });
  }
}
