import React from 'react';
type Props = { onEvent: (action: string, detail: string, result?: string) => void; onNavigate: (route: any) => void };
export function HomeView({ onEvent, onNavigate }: Props) { return <div className="home-view">
  <div className="eyebrow">MONDAY · 03 AUGUST 2026 <span className="pill green">LOCAL STUDY MODE</span></div>
  <section className="hero"><div><p className="kicker">YOUR DAY, IN ONE PLACE</p><h1>Make room for<br /><em>what matters.</em></h1><p className="subhead">A calm command centre for tasks, time and attention.</p></div><div className="hero-orbit"><span>09—17</span><small>WORK WINDOW</small></div></section>
  <div className="home-grid"><section className="panel now-panel"><div className="panel-head"><span>NOW</span><button onClick={() => onNavigate('focus')}>Focus →</button></div><h2>Post 1 — Kabrito digital</h2><p>09:00 · 1 hour · work</p><div className="progress"><span style={{ width: '34%' }} /></div><small>34% of the day planned</small></section>
    <section className="panel health-panel"><div className="panel-head"><span>PLAN HEALTH</span><span className="pill amber">1 REVIEW</span></div><div className="health-stat"><strong>7 / 8</strong><span>blocks placed today</span></div><button className="text-button" onClick={() => { onEvent('validation', 'Reviewed daily plan', 'needs-review'); onNavigate('week'); }}>Review missing blocks →</button></section>
    <section className="panel next-panel"><div className="panel-head"><span>UP NEXT</span><span className="muted">TODAY</span></div><div className="next-row"><b>10:00</b><span>Post 2 — Kabrito digital</span></div><div className="next-row"><b>11:00</b><span>Post 3 — Kabrito digital</span></div><div className="next-row"><b>12:00</b><span className="break-label">Lunch · protected</span></div></section>
  </div>
  <div className="quick-input" onClick={() => onEvent('command', 'Opened quick capture')}><span>+</span><span>What needs your attention?</span><kbd>/</kbd></div>
</div>; }
