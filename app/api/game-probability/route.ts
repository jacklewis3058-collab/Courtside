import { NextRequest, NextResponse } from 'next/server';
import { loadEspnProbability } from '@/lib/espn-probability';

export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get('eventId')?.trim() ?? '';
  if (!/^\d+$/.test(eventId)) {
    return NextResponse.json({ provider: 'ESPN', available: false, reason: 'A valid ESPN event ID is required.' }, { status: 400 });
  }

  try {
    return NextResponse.json(await loadEspnProbability(eventId));
  } catch {
    return NextResponse.json({ provider: 'ESPN', available: false, reason: 'ESPN win probability is temporarily unavailable.' });
  }
}
