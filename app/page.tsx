'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, ChevronLeft, ChevronRight, CircleUserRound, ExternalLink, Flame, Info, LoaderCircle, MapPin, Radio, RefreshCw, Search, Sparkles, Trophy, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Game = {
  id: number; time: string; network: string;
  away: { id?: string; name: string; short: string; record: string; rank?: number; netRank?: number; kenPomRank?: number; color: string; logo?: string; score?: string };
  home: { id?: string; name: string; short: string; record: string; rank?: number; netRank?: number; kenPomRank?: number; color: string; logo?: string; score?: string };
  venue: string; city: string; watchability: number; crowd: number; margin: string; tags: string[]; conference: string;
  date?: string; state?: 'pre' | 'in' | 'post'; status?: string; liveExcitement?: number; neutralSite?: boolean; rankingReasons?: string[];
  breakdown?: { competitiveness: number; crowd: number; matchupQuality: number; stakes: number; nationalSignificance: number };
  crowdConfidence?: 'High' | 'Medium' | 'Low'; crowdFactors?: string[];
  rankingOrder?: number;
};

type ProbabilityResult = { provider: string; available: boolean; outcomes?: Array<{ teamId?: string; team: string; probability: number }>; marketTitle?: string; marketUrl?: string; asOf?: string; reason?: string };
type MarketsResponse = { kalshi: ProbabilityResult; disclaimer: string };
type NetRanking = { rank: number; school: string; record: string; conference: string; previous: string; quad1: string; quad2: string; quad3: string; quad4: string };
type RankingsResponse = { title: string; updated: string; checkedAt: string; sourceUrl: string; rankings: NetRanking[] };

const games: Game[] = [
  { id: 1, time: '7:00 PM', network: 'ESPN', away: { name: 'Duke', short: 'DUKE', record: '18–3', rank: 4, color: '#2455d6' }, home: { name: 'North Carolina', short: 'UNC', record: '16–5', rank: 12, color: '#77a9e8' }, venue: 'Dean E. Smith Center', city: 'Chapel Hill, NC', watchability: 96, crowd: 98, margin: 'UNC by 1.5', tags: ['Iconic rivalry', 'Marquee', 'Electric crowd'], conference: 'ACC' },
  { id: 2, time: '9:00 PM', network: 'ESPN2', away: { name: 'Houston', short: 'HOU', record: '19–2', rank: 3, color: '#c8102e' }, home: { name: 'Iowa State', short: 'ISU', record: '17–4', rank: 8, color: '#c8102e' }, venue: 'Hilton Coliseum', city: 'Ames, IA', watchability: 93, crowd: 96, margin: 'ISU by 2.0', tags: ['Top 10 matchup', 'Elite defenses'], conference: 'Big 12' },
  { id: 3, time: '8:30 PM', network: 'CBS Sports', away: { name: 'VCU', short: 'VCU', record: '17–5', color: '#f8b800' }, home: { name: 'Dayton', short: 'DAY', record: '18–4', color: '#d71920' }, venue: 'UD Arena', city: 'Dayton, OH', watchability: 89, crowd: 93, margin: 'DAY by 3.5', tags: ['Mid-major gem', 'At-large stakes'], conference: 'A-10' },
  { id: 4, time: '6:30 PM', network: 'FS1', away: { name: 'Marquette', short: 'MARQ', record: '17–4', rank: 10, color: '#003366' }, home: { name: 'Creighton', short: 'CREI', record: '15–6', rank: 21, color: '#005ca9' }, venue: 'CHI Health Center', city: 'Omaha, NE', watchability: 86, crowd: 84, margin: 'CREI by 1.0', tags: ['Ranked matchup', 'Big East'], conference: 'Big East' },
];

function TeamMark({ team }: { team: Game['home'] }) {
  return <div className="team-mark" style={{ '--team-color': team.color } as React.CSSProperties}>{team.logo ? <img src={team.logo} alt="" /> : team.short.slice(0, 3)}</div>;
}

function ScoreRing({ value, label }: { value: number; label: string }) {
  const color = value >= 90 ? '#ff6f1a' : value >= 80 ? '#ff9a1f' : '#8a0d2e';
  return <div className="score-wrap"><div className="score-ring" style={{ '--score': `${value * 3.6}deg`, '--ring': color } as React.CSSProperties}><span>{value}</span></div><small>{label}</small></div>;
}

function CrowdMeter({ value, confidence }: { value: number; confidence?: string }) {
  const colors = ['#77d84b', '#9de34a', '#c7e63e', '#efe53a', '#ffc83b', '#ff9f37', '#ff7138', '#fa4b47', '#ed2f51', '#d91f53'];
  const filledBars = Math.ceil(value / 10);
  const label = value >= 90 ? 'Electric' : value >= 75 ? 'Loud' : value >= 60 ? 'Lively' : value >= 40 ? 'Moderate' : 'Quiet';
  return <div className="crowd-meter-wrap">
    <div className="crowd-meter-copy"><span>PROJECTED CROWD{confidence ? ` · ${confidence.toUpperCase()} CONF.` : ''}</span><strong>{value}<small>/100</small></strong><em>{label}</em></div>
    <div className="crowd-meter" role="meter" aria-label={`Projected crowd atmosphere ${value} out of 100`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      {colors.map((color, index) => <i key={color} className={index < filledBars ? 'filled' : ''} style={{ '--bar-color': color, '--bar-height': `${48 + index * 5}%` } as React.CSSProperties} />)}
    </div>
  </div>;
}

function FeaturedGame({ game, onSelect }: { game: Game; onSelect: (game: Game) => void }) {
  const rankingReason = game.rankingReasons?.length
    ? `${game.rankingReasons.join(' · ')}.`
    : game.state === 'in'
    ? `${game.status}; its live excitement score is ${game.liveExcitement ?? 'updating'}.`
    : game.away.rank && game.home.rank
      ? `two ranked teams meet, led by the #${game.away.rank} vs #${game.home.rank} matchup.`
      : game.away.rank || game.home.rank
        ? `a Top 25 team is in action; competitiveness and atmosphere are still provisional.`
        : `it currently leads the provisional model for this date; detailed matchup inputs are still being added.`;
  return <article className={`featured-card clickable-game ${game.state === 'in' ? 'is-live' : ''}`} role="button" tabIndex={0} onClick={() => onSelect(game)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(game); }}>
    <div className="featured-topline"><div><span className="live-dot" /> {game.state === 'in' ? 'LIVE NOW' : game.state === 'post' ? 'FINAL' : 'TONIGHT\'S PICK'}</div><span>{game.state === 'in' || game.state === 'post' ? game.status : game.time} · {game.network}</span></div>
    <div className="featured-body">
      <div className="featured-matchup">
        <div className="featured-team"><TeamMark team={game.away} /><div><span className="eyebrow">AWAY · {game.away.record}</span><h2>{game.away.rank && <b>#{game.away.rank}</b>} {game.away.name}</h2></div>{game.state !== 'pre' && <strong key={game.away.score} className="featured-game-score">{game.away.score}</strong>}</div>
        <div className="at-mark">at</div>
        <div className="featured-team"><TeamMark team={game.home} /><div><span className="eyebrow home-label">HOME · {game.home.record}</span><h2>{game.home.rank && <b>#{game.home.rank}</b>} {game.home.name}</h2></div>{game.state !== 'pre' && <strong key={game.home.score} className="featured-game-score">{game.home.score}</strong>}</div>
      </div>
      <div className="featured-scores"><ScoreRing value={game.watchability} label="Watchability" /></div>
    </div>
    <div className="featured-footer">
      <div className="venue-line"><MapPin size={15} /> {game.venue} · {game.city}</div>
      <div className="tag-row">{game.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div>
      <div className="why-row"><Sparkles size={16} /><span><strong>Why it ranks #1:</strong> {rankingReason}</span></div>
      <CrowdMeter value={game.crowd} confidence={game.crowdConfidence} />
      <div className="view-details">View full game details <ChevronRight size={14} /></div>
    </div>
  </article>;
}

function GameRow({ game, index, onSelect }: { game: Game; index: number; onSelect: (game: Game) => void }) {
  return <article className={`game-row clickable-game ${game.state === 'in' ? 'is-live' : ''} ${game.state === 'post' ? 'is-final' : ''}`} role="button" tabIndex={0} onClick={() => onSelect(game)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(game); }}>
    <div className="rank-number">{index + 2}</div>
    <div className="game-time"><strong>{game.state === 'in' ? <><i /> LIVE</> : game.state === 'post' ? 'FINAL' : game.time}</strong><span>{game.state === 'in' || game.state === 'post' ? game.status : game.network}</span>{game.state === 'in' && <small>{game.network}</small>}</div>
    <div className="compact-matchup">
      <div><TeamMark team={game.away} /><span>{game.away.rank && <b>#{game.away.rank} </b>}{game.away.name}</span>{game.state !== 'pre' ? <b key={game.away.score} className="row-game-score">{game.away.score}</b> : <small>{game.away.record}</small>}</div>
      <div><TeamMark team={game.home} /><span>{game.home.rank && <b>#{game.home.rank} </b>}{game.home.name} <em>HOME</em></span>{game.state !== 'pre' ? <b key={game.home.score} className="row-game-score">{game.home.score}</b> : <small>{game.home.record}</small>}</div>
    </div>
    <div className="game-context"><span>{game.margin}</span><small>{game.venue}</small></div>
    <div className="mini-score"><strong>{game.watchability}</strong><span>WATCH</span></div><div className="mini-score crowd"><strong>{game.crowd}</strong><span>CROWD</span></div>
  </article>;
}

function ProbabilityCard({ result, teams }: { result?: ProbabilityResult; teams: Game['away'][] }) {
  if (!result) return <div className="market-card loading-market"><LoaderCircle className="spin" size={18} /><span>Loading win probability…</span></div>;
  const isEspn = result.provider === 'ESPN';
  const linkLabel = isEspn ? 'View ESPN game' : 'View market';
  return <div className={`market-card ${result.available ? 'market-found' : ''}`}>
    <div className="market-head"><strong>{result.provider}</strong>{result.available && result.marketUrl && <a href={result.marketUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{linkLabel} <ExternalLink size={12} /></a>}</div>
    {result.available && result.outcomes?.length ? <>
      <p>{result.marketTitle ?? 'Game win probability'}</p>
      <div className="probability-list">{teams.map((team) => {
        const outcome = result.outcomes?.find((item) => (team.id && item.teamId === team.id) || item.team === team.name);
        return <div key={team.name}><span><TeamMark team={team} />{team.name}</span><strong>{outcome?.probability ?? '—'}%</strong><i style={{ width: `${outcome?.probability ?? 0}%` }} /></div>;
      })}</div>
      <small>{isEspn ? 'ESPN Matchup Predictor' : 'Market-implied'} · checked {result.asOf ? new Date(result.asOf).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'just now'}</small>
    </> : <div className="no-market"><Info size={16} /><span>{result.reason ?? 'No win probability is available for this game.'}</span></div>}
  </div>;
}

function GameDetails({ game, open, onOpenChange, date }: { game: Game | null; open: boolean; onOpenChange: (open: boolean) => void; date: string }) {
  const [markets, setMarkets] = useState<MarketsResponse | null>(null);
  const [espnProbability, setEspnProbability] = useState<ProbabilityResult | null>(null);
  useEffect(() => {
    if (!game || !open) return;
    const controller = new AbortController();
    setMarkets(null);
    setEspnProbability(null);
    const params = new URLSearchParams({ away: game.away.name, home: game.home.name, date });
    Promise.all([
      fetch(`/api/markets?${params}`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`/api/game-probability?eventId=${game.id}`, { signal: controller.signal }).then((response) => response.json()),
    ])
      .then(([marketBody, espnBody]) => { setMarkets(marketBody as MarketsResponse); setEspnProbability(espnBody as ProbabilityResult); })
      .catch((error) => { if (error.name !== 'AbortError') { setMarkets({ kalshi: { provider: 'Kalshi', available: false, reason: 'Market lookup is temporarily unavailable.' }, disclaimer: '' }); setEspnProbability({ provider: 'ESPN', available: false, reason: 'ESPN win probability is temporarily unavailable.' }); } });
    return () => controller.abort();
  }, [game, open, date]);
  if (!game) return null;
  const breakdown = game.breakdown ?? { competitiveness: 0, crowd: Math.round(game.crowd * .25), matchupQuality: 0, stakes: 0, nationalSignificance: 0 };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="game-detail-dialog">
    <DialogHeader><DialogTitle>Game details</DialogTitle><DialogDescription>{game.away.name} at {game.home.name} · complete matchup snapshot</DialogDescription></DialogHeader>
    <div className="detail-hero">
      <div className="detail-meta"><span>{game.state === 'in' ? `LIVE · ${game.status}` : game.state === 'post' ? 'FINAL' : game.time}</span><strong>{game.network}</strong></div>
      <div className="detail-teams">
        {[game.away, game.home].map((team, index) => <div key={team.name}><span><TeamMark team={team} /><i>{index === 0 ? 'AWAY' : game.neutralSite ? 'NEUTRAL' : 'HOME'}</i><b>{team.rank && `#${team.rank} `}{team.name}<small>{team.record}{team.netRank ? ` · NET #${team.netRank}` : ''}{team.kenPomRank ? ` · KenPom #${team.kenPomRank}` : ''}</small></b></span>{game.state !== 'pre' && team.score && <strong>{team.score}</strong>}</div>)}
      </div>
      <div className="detail-location"><MapPin size={15} /><span><strong>{game.venue}</strong>{game.city} {game.neutralSite && '· Neutral site'}</span></div>
    </div>
    <div className="detail-score-grid"><div><ScoreRing value={game.watchability} label="Watchability" /></div><div className="detail-crowd"><CrowdMeter value={game.crowd} confidence={game.crowdConfidence} />{game.crowdFactors?.length ? <small>{game.crowdFactors.join(' · ')}</small> : null}</div>{game.liveExcitement !== undefined && <div className="live-detail-score"><strong>{game.liveExcitement}</strong><span>Live excitement</span></div>}</div>
    <section className="detail-section"><div className="detail-section-title"><h3>Why this game ranks here</h3><span>{game.margin}</span></div><div className="detail-tags">{game.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div><ul>{(game.rankingReasons?.length ? game.rankingReasons : ['Schedule data is verified; deeper matchup inputs are still being added.']).map((reason) => <li key={reason}>{reason}</li>)}</ul></section>
    <section className="detail-section"><div className="detail-section-title"><h3>Watchability breakdown</h3><span>{game.watchability}/100</span></div><div className="breakdown-grid">
      {[['Matchup quality', breakdown.matchupQuality, 42], ['Competitiveness', breakdown.competitiveness, 30], ['Rivalry & stakes', breakdown.stakes, 15], ['Crowd atmosphere', breakdown.crowd, 8], ['National significance', breakdown.nationalSignificance, 5]].map(([label, value, max]) => <div key={String(label)}><span>{label}</span><b>{value}/{max}</b><i><em style={{ width: `${Math.min(100, (Number(value) / Number(max)) * 100)}%` }} /></i></div>)}
    </div></section>
    <section className="detail-section market-section"><div className="detail-section-title"><div><h3>Win probabilities</h3><p>ESPN&apos;s matchup projection alongside a verified Kalshi game market.</p></div></div><div className="market-grid"><ProbabilityCard result={espnProbability ?? undefined} teams={[game.away, game.home]} /><ProbabilityCard result={markets?.kalshi} teams={[game.away, game.home]} /></div><p className="market-disclaimer">{markets?.disclaimer ?? 'ESPN projections and market prices can change. Kalshi data is informational, not betting or financial advice.'}</p></section>
  </DialogContent></Dialog>;
}

function LiveBoard({ games, lastUpdated, onSelect }: { games: Game[]; lastUpdated?: Date | null; onSelect: (game: Game) => void }) {
  const liveGames = [...games].filter((game) => game.state === 'in').sort((a, b) => (b.liveExcitement ?? 0) - (a.liveExcitement ?? 0));
  if (!liveGames.length) return <section className="live-board" id="live"><div className="live-board-header"><div><span><Radio size={14} /> LIVE SCOREBOARD</span><h2>No Division I games are live right now</h2><p>ESPN is checked every 15 seconds{lastUpdated ? ` · Last check ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : ''}.</p></div><Badge>Auto-refreshing</Badge></div><div className="live-rule"><Sparkles size={16} /><p>Pregame quality never blocks a game from appearing here. Live margin, time remaining, lead changes, runs, comebacks, overtime, and win-probability swings drive this list.</p></div></section>;
  const leader = liveGames[0];
  return <section className="live-board" id="live">
    <div className="live-board-header"><div><span><Radio size={14} /> LIVE SCOREBOARD</span><h2>Crazy games, regardless of the matchup</h2><p>Scores and clocks refresh from ESPN every 15 seconds{lastUpdated ? ` · Last check ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : ''}.</p></div><Badge>Auto-updating</Badge></div>
    <button className="live-feature" onClick={() => onSelect(leader)}>
      <div className="live-rank">#1 <small>LIVE</small></div>
      <div className="live-teams"><div><strong>{leader.away.name}</strong><b key={leader.away.score}>{leader.away.score}</b></div><div><strong>{leader.home.name}</strong><b key={leader.home.score}>{leader.home.score}</b></div><span><i /> {leader.status}</span></div>
      <div className="live-excitement"><strong>{leader.liveExcitement}</strong><span>LIVE<br />EXCITEMENT</span></div>
      <div className="live-reasons"><span><Flame size={13} /> {Math.abs(Number(leader.home.score) - Number(leader.away.score)) <= 3 ? 'One-possession game' : 'Second-half action'}</span><span>All games eligible</span><span>{leader.network}</span></div>
      <div className="pregame-history"><span>Pregame watchability</span><strong>{leader.watchability}</strong><small>This stays visible, but does not limit its live rank.</small></div>
    </button>
    {liveGames.slice(1, 5).map((game, index) => <button className="live-compact" key={game.id} onClick={() => onSelect(game)}><div className="live-rank">#{index + 2}<small>LIVE</small></div><div><strong>{game.away.name}<b key={game.away.score}>{game.away.score}</b></strong><strong>{game.home.name}<b key={game.home.score}>{game.home.score}</b></strong><span><i /> {game.status}</span></div><div className="live-excitement"><strong>{game.liveExcitement}</strong><span>LIVE</span></div></button>)}
    <div className="live-rule"><Sparkles size={16} /><p><strong>How this works:</strong> live margin, time remaining, lead changes, runs, comebacks, overtime, and win-probability swings determine this list. Team fame and pregame quality cannot keep a wild game out.</p></div>
  </section>;
}

function NetRankings({ query }: { query: string }) {
  const [data, setData] = useState<RankingsResponse | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const load = () => {
    setRefreshing(true); setError('');
    fetch('/api/rankings', { cache: 'no-store' }).then((response) => response.json().then((body: any) => ({ ok: response.ok, body }))).then(({ ok, body }) => {
      if (!ok) throw new Error(body.error || 'NCAA rankings unavailable');
      setData(body as RankingsResponse);
    }).catch((reason) => setError(reason.message)).finally(() => setRefreshing(false));
  };
  useEffect(() => { load(); const timer = window.setInterval(load, 15 * 60 * 1000); return () => window.clearInterval(timer); }, []);
  const rows = data?.rankings.filter((team) => `${team.school} ${team.conference}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  if (!data && refreshing) return <div className="schedule-state"><LoaderCircle className="spin" size={24} /><h3>Loading NCAA NET rankings</h3><p>Checking the latest official release.</p></div>;
  if (error && !data) return <div className="schedule-state error"><h3>Rankings temporarily unavailable</h3><p>{error}</p><Button variant="outline" size="sm" onClick={load}>Try again</Button></div>;
  return <><div className="rankings-source"><div><span>NCAA MEN&apos;S BASKETBALL NET</span><strong>{data?.updated ?? 'Latest release'}</strong><small>Automatically rechecked every 15 minutes</small></div><div><button onClick={load} disabled={refreshing}><RefreshCw className={refreshing ? 'spin' : ''} size={13} /> Refresh</button><a href={data?.sourceUrl} target="_blank" rel="noreferrer">View NCAA source <ExternalLink size={12} /></a></div></div><section className="net-rankings"><div className="net-head"><b>NET</b><span>School</span><span>Record</span><span>Conference</span><span>Previous</span><span>Quad 1</span></div>{rows.map((team) => <div key={`${team.rank}-${team.school}`}><b>{team.rank}</b><strong>{team.school}</strong><span>{team.record}</span><span>{team.conference}</span><span>{team.previous}</span><span>{team.quad1}</span></div>)}</section>{error && <p className="rankings-stale-note">Could not refresh just now. Showing the last successfully loaded NCAA rankings.</p>}</>;
}

const toDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const fromDateKey = (key: string) => new Date(`${key}T12:00:00`);
const shiftDate = (key: string, amount: number) => { const next = fromDateKey(key); next.setDate(next.getDate() + amount); return toDateKey(next); };
const formatGameTime = (iso?: string) => iso ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : 'TBD';
const INITIAL_DATE = new Date().toISOString().slice(0, 10);

export default function Home() {
  const [activeSection, setActiveSection] = useState<'games' | 'live' | 'rankings' | 'rivalries' | 'crowds'>('games');
  const [activeFilter, setActiveFilter] = useState('Best games');
  const [query, setQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(INITIAL_DATE);
  const [todayKey, setTodayKey] = useState(INITIAL_DATE);
  const [scheduleGames, setScheduleGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState('');
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [lastScheduleUpdate, setLastScheduleUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const localToday = toDateKey(new Date());
    setTodayKey(localToday);
    setSelectedDate((current) => current === INITIAL_DATE ? localToday : current);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadSchedule = (silent = false) => {
      if (!silent) { setLoading(true); setScheduleError(''); }
      fetch(`/api/schedule?date=${selectedDate}&t=${Date.now()}`, { signal: controller.signal, cache: 'no-store' })
        .then((response) => response.json().then((body: any) => ({ ok: response.ok, body })))
        .then(({ ok, body }) => {
          if (!ok) throw new Error(body.error || 'Schedule unavailable');
          const nextGames = body.games.map((game: Game) => ({ ...game, time: formatGameTime(game.date) }));
          setScheduleGames(nextGames);
          setSelectedGame((current) => current ? nextGames.find((game: Game) => game.id === current.id) ?? current : null);
          setLastScheduleUpdate(new Date()); setScheduleError('');
        })
        .catch((error) => { if (error.name !== 'AbortError' && !silent) setScheduleError(error.message); })
        .finally(() => { if (!silent) setLoading(false); });
    };
    loadSchedule();
    const timer = activeSection !== 'rankings' && selectedDate === todayKey ? window.setInterval(() => loadSchedule(true), 15000) : undefined;
    return () => { controller.abort(); if (timer) window.clearInterval(timer); };
  }, [selectedDate, activeSection, todayKey]);

  const openSection = (section: typeof activeSection) => {
    setActiveSection(section);
    if (section === 'live') setSelectedDate(toDateKey(new Date()));
  };

  const searchedGames = useMemo(() => scheduleGames.filter((game) => `${game.away.name} ${game.home.name} ${game.conference} ${game.network}`.toLowerCase().includes(query.toLowerCase())), [query, scheduleGames]);
  const filtered = useMemo(() => {
    const ranked = [...searchedGames];
    if (activeSection === 'rivalries') return ranked.filter((game) => game.tags.some((tag) => /rival/i.test(tag)) || (game.breakdown?.stakes ?? 0) >= 7).sort((a, b) => (b.breakdown?.stakes ?? 0) - (a.breakdown?.stakes ?? 0) || b.watchability - a.watchability);
    if (activeSection === 'crowds') return ranked.sort((a, b) => b.crowd - a.crowd || b.watchability - a.watchability);
    if (activeFilter === 'All games') return ranked.sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime());
    if (activeFilter === 'Top 25') return ranked.filter((game) => game.away.rank || game.home.rank).sort((a, b) => b.watchability - a.watchability);
    if (activeFilter === 'On TV') return ranked.filter((game) => game.network !== 'Broadcast TBD').sort((a, b) => (a.rankingOrder ?? 9999) - (b.rankingOrder ?? 9999));
    return ranked.sort((a, b) => (a.rankingOrder ?? 9999) - (b.rankingOrder ?? 9999) || b.watchability - a.watchability);
  }, [activeFilter, activeSection, searchedGames]);
  const dateOptions = [-2, -1, 0, 1, 2].map((offset) => ({ key: shiftDate(selectedDate, offset), date: fromDateKey(shiftDate(selectedDate, offset)) }));
  const selectedDateObject = fromDateKey(selectedDate);
  const topLive = [...scheduleGames].filter((game) => game.state === 'in').sort((a, b) => (b.liveExcitement ?? 0) - (a.liveExcitement ?? 0))[0];
  const liveCount = scheduleGames.filter((game) => game.state === 'in').length;
  return <main>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="#" aria-label="Courtside home"><img className="brand-logo" src="/courtside-logo.png" alt="Courtside" /></a>
      <nav className="main-nav" aria-label="Primary navigation">{([['games', 'Games'], ['live', 'Live'], ['rankings', 'Rankings']] as const).map(([section, label]) => <button key={section} className={activeSection === section ? 'active' : ''} onClick={() => openSection(section)}>{label}</button>)}</nav>
      <div className="header-actions"><Button variant="ghost" size="icon" aria-label="Notifications"><Bell size={19} /></Button><Button variant="ghost" size="icon" aria-label="Account"><CircleUserRound size={21} /></Button></div>
    </div></header>
    <div className="app-shell">
      <aside className="left-rail">
        <p className="rail-label">DISCOVER</p><button className={activeSection === 'games' ? 'active' : ''} onClick={() => { openSection('games'); setActiveFilter('Best games'); }}><Flame size={18} /> Best Games</button><button className={activeSection === 'rivalries' ? 'active' : ''} onClick={() => openSection('rivalries')}><Trophy size={18} /> Rivalries</button><button className={activeSection === 'crowds' ? 'active' : ''} onClick={() => openSection('crowds')}><Users size={18} /> Best Crowds</button><button className={activeSection === 'live' ? 'active' : ''} onClick={() => openSection('live')}><Radio size={18} /> Live Nail-Biters <span className="count">{scheduleGames.filter((game) => game.state === 'in').length}</span></button>
        <div className="rail-note"><Sparkles size={17} /><p><strong>Rankings with a reason.</strong><br />Every score explains what makes a game worth your time.</p></div>
      </aside>
      <section className="content" id="games">
        {activeSection !== 'rankings' && <div className="date-bar"><Button variant="ghost" size="icon" aria-label="Previous day" onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}><ChevronLeft size={20} /></Button>{dateOptions.map(({ key, date }, index) => <button key={key} className={index === 2 ? 'selected' : ''} onClick={() => setSelectedDate(key)}><span>{date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</span><strong>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong>{key === todayKey && <small>TODAY</small>}</button>)}<Button variant="ghost" size="icon" aria-label="Next day" onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}><ChevronRight size={20} /></Button><label className="calendar-button"><CalendarDays size={16} /><span>Calendar</span><input type="date" value={selectedDate} onChange={(event) => event.target.value && setSelectedDate(event.target.value)} /></label></div>}
        <div className="page-heading"><div><p>{activeSection === 'rankings' ? 'LATEST OFFICIAL RELEASE' : selectedDateObject.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</p><h1>{activeSection === 'live' ? 'Live scores & nail-biters' : activeSection === 'rankings' ? 'NCAA NET rankings' : activeSection === 'rivalries' ? 'Rivalries & high-stakes games' : activeSection === 'crowds' ? 'Best crowds' : selectedDate === todayKey ? 'Best games today' : 'Best games'}</h1><span>{activeSection === 'rankings' ? 'Latest official NCAA release · automatically updated' : `${scheduleGames.length} Division I games · Times shown locally · ESPN schedule reference`}</span></div><div className="search-wrap"><Search size={17} /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={activeSection === 'rankings' ? 'Search schools or conferences' : 'Search teams, conferences or networks'} /></div></div>
        <div className="mobile-section-tabs" role="navigation" aria-label="Sections">{([['games', 'Games'], ['live', 'Live'], ['rankings', 'Rankings'], ['rivalries', 'Rivalries'], ['crowds', 'Crowds']] as const).map(([section, label]) => <button key={section} className={activeSection === section ? 'active' : ''} onClick={() => openSection(section)}>{label}</button>)}</div>
        {activeSection !== 'rankings' && selectedDate === todayKey && liveCount > 0 && <div className="live-update-bar" aria-live="polite"><span><i /> {liveCount} {liveCount === 1 ? 'game' : 'games'} live</span><strong>Scores refresh every 15 seconds</strong><small>{lastScheduleUpdate ? `Updated ${lastScheduleUpdate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : 'Connecting…'}</small><button onClick={() => openSection('live')}>View live scoreboard <ChevronRight size={13} /></button></div>}
        {activeSection === 'games' && <div className="filter-row" role="group" aria-label="Game views">{['Best games', 'All games', 'Top 25', 'On TV'].map((filter) => <Button key={filter} onClick={() => setActiveFilter(filter)} variant={activeFilter === filter ? 'default' : 'outline'} size="sm">{filter}</Button>)}</div>}
        {activeSection === 'rankings' ? <NetRankings query={query} /> : loading ? <div className="schedule-state"><LoaderCircle className="spin" size={24} /><h3>Loading ESPN schedule</h3><p>Checking every Division I game for this date.</p></div> : scheduleError ? <div className="schedule-state error"><h3>Schedule temporarily unavailable</h3><p>{scheduleError}</p><Button variant="outline" size="sm" onClick={() => setSelectedDate(todayKey)}>Return to today</Button></div> : activeSection === 'live' ? <LiveBoard games={searchedGames} lastUpdated={lastScheduleUpdate} onSelect={setSelectedGame} /> : filtered.length ? <><FeaturedGame game={filtered[0]} onSelect={setSelectedGame} /><div className="list-heading"><div><h3>{activeSection === 'crowds' ? 'More great atmospheres' : activeSection === 'rivalries' ? 'More rivalry and stakes games' : activeFilter === 'All games' ? 'Full schedule' : 'More games worth your time'}</h3><span>Synced from ESPN · scores refresh every 15 seconds while games are live</span></div><a href="https://www.espn.com/mens-college-basketball/schedule" target="_blank" rel="noreferrer">View ESPN schedule</a></div><div className="game-list">{filtered.slice(1).map((game, index) => <GameRow game={game} index={index} key={game.id} onSelect={setSelectedGame} />)}</div></> : <div className="empty-state"><CalendarDays size={28} /><h3>{activeSection === 'rivalries' ? 'No verified rivalries on this date' : 'No Division I games listed'}</h3><p>{query ? 'Try clearing your search.' : 'ESPN has no matching games listed for this date.'}</p></div>}
      </section>
      <aside className="right-rail">
        <section className="side-card live-card">
          <div className="side-title"><span><Radio size={16} /> LIVE NAIL-BITERS</span><button onClick={() => openSection('live')}>See all</button></div>
          {topLive ? <button className="live-game live-game-button" onClick={() => setSelectedGame(topLive)}><div className="live-status"><span>LIVE</span> {topLive.status}<b>EXCITEMENT {topLive.liveExcitement}</b></div><div><strong>{topLive.away.name}</strong><b>{topLive.away.score}</b></div><div><strong>{topLive.home.name}</strong><b>{topLive.home.score}</b></div><div className="live-movement"><Flame size={13} /><span>Currently the best live finish</span></div><p>Pregame watchability: {topLive.watchability} · Every active game is eligible</p></button> : <div className="no-live-side"><Radio size={17} /><strong>No games are live</strong><span>We&apos;ll rank every game once play begins.</span></div>}
          <div className="all-eligible"><Sparkles size={13} /><span><strong>Every live game is eligible.</strong> Pregame quality never blocks a crazy finish.</span></div>
        </section>
        <section className="side-card"><div className="side-title"><span><Users size={16} /> BEST CROWDS</span><button onClick={() => openSection('crowds')}>See all</button></div>{[...scheduleGames].sort((a, b) => b.crowd - a.crowd).slice(0,3).map((g, i) => <button className="crowd-row" key={g.id} onClick={() => setSelectedGame(g)}><span>{i + 1}</span><div><strong>{g.home.name}</strong><small>vs {g.away.name}</small></div><b>{g.crowd}</b></button>)}</section>
        <p className="sample-note">Schedule, scores, venues, and listed broadcasts use ESPN as a reference. Watchability and crowd ratings are provisional model outputs.</p>
      </aside>
    </div>
    <GameDetails game={selectedGame} open={Boolean(selectedGame)} onOpenChange={(open) => { if (!open) setSelectedGame(null); }} date={selectedDate} />
  </main>;
}
