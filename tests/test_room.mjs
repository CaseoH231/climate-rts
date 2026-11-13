import { RoomCore } from '../worker/room-core.js';
let t = 0; const timers = []; let id = 0;
const T = {
  setInterval: (f, ms) => { const o = { id: ++id, f, ms, next: t + ms, rep: true }; timers.push(o); return o.id; },
  setTimeout: (f, ms) => { const o = { id: ++id, f, ms, next: t + ms, rep: false }; timers.push(o); return o.id; },
  clearInterval: (i) => { const k = timers.findIndex((o) => o.id === i); if (k >= 0) timers.splice(k, 1); },
  clearTimeout: (i) => { const k = timers.findIndex((o) => o.id === i); if (k >= 0) timers.splice(k, 1); },
};
const advance = (ms) => { const end = t + ms; for (;;) { const due = timers.filter((o) => o.next <= end).sort((a, b) => a.next - b.next)[0]; if (!due) break; t = due.next; if (due.rep) due.next += due.ms; else timers.splice(timers.indexOf(due), 1); due.f(); } t = end; };
const conn = () => ({ got: [], closed: false, send(s) { this.got.push(JSON.parse(s)); }, close() { this.closed = true; } });
const last = (c, type) => [...c.got].reverse().find((m) => m.t === type);
const all = (c, type) => c.got.filter((m) => m.t === type);
const say = (r, c, m) => r.message(c, JSON.stringify(m));
let fails = 0; const ok = (cond, msg) => { if (!cond) fails++; console.log(cond ? 'PASS' : 'FAIL', msg); };

const r = new RoomCore('ABCDE', T);
const h = conn(); say(r, h, { t: 'hello', role: 'host', token: 'h', name: 'Hana' });
const g = conn(); say(r, g, { t: 'hello', role: 'join', token: 'g', name: 'Gus' });
ok(last(g, 'welcome').team === 'enemy', 'first guest takes the open Red seat');
const x = conn(); say(r, x, { t: 'hello', role: 'join', token: 'x' });
ok(last(x, 'error') && x.closed, 'no free seats -> refused');
say(r, h, { t: 'slot', i: 2, kind: 'open', team: 1 });
const x2 = conn(); say(r, x2, { t: 'hello', role: 'join', token: 'x2', name: 'Xi' });
ok(last(x2, 'welcome').team === 'green', 'opening Green lets a third player in');
say(r, g, { t: 'slot', i: 3, kind: 'ai' }); ok(r.slots[3].kind === 'closed', 'guests cannot change seats');
say(r, h, { t: 'slot', i: 1, kind: 'closed' }); ok(r.slots[1].kind === 'human', 'host cannot close a seat someone is in');
say(r, h, { t: 'slot', i: 3, kind: 'ai', ai: 'hard', team: 2 }); ok(r.slots[3].ai === 'hard', 'host adds a hard computer player');
const w = conn(); say(r, w, { t: 'hello', role: 'watch', token: 'w', name: 'Wes' });
ok(last(w, 'welcome').spectator && last(h, 'lobby').watchers[0] === 'Wes', 'spectator joins and is listed');
say(r, h, { t: 'slot', i: 1, team: 1 }); say(r, h, { t: 'slot', i: 3, team: 1 });
say(r, h, { t: 'start' }); ok(!r.started && /same team/.test(last(h, 'notice').msg), 'everyone on one team -> cannot start');
say(r, h, { t: 'slot', i: 1, team: 2 }); say(r, h, { t: 'slot', i: 3, team: 2 });
say(r, h, { t: 'start' }); ok(r.started && last(w, 'start').settings.slots.length === 4, 'start: seats fixed and sent to spectators too');
say(r, w, { t: 'cmd', c: { k: 'move', ids: [1] } }); say(r, g, { t: 'cmd', c: { k: 'move', p: 'player' } });
advance(100); const turn = last(h, 'turn');
ok(turn.c.length === 1 && turn.c[0].p === 'enemy', 'spectator orders ignored; player orders stamped with their own side');
for (const c of [h, g, x2]) say(r, c, { t: 'hash', tick: 40, h: 7 });
ok(!last(h, 'desync'), 'three matching fingerprints are fine');
say(r, h, { t: 'hash', tick: 80, h: 7 }); say(r, w, { t: 'hash', tick: 80, h: 8 });
ok(last(g, 'desync').tick === 80, 'any mismatch (even from a spectator) is reported');
r.close(x2); ok(last(h, 'wait').name === 'Xi', 'a dropout pauses the game');
const n0 = last(h, 'turn').n; advance(1000); ok(last(h, 'turn').n === n0, 'clock paused');
advance(90000); const lt = last(h, 'turn');
ok(last(h, 'left').reason === 'timeout' && all(h, 'turn').some((m) => (m.c || []).some((c) => c.k === 'resign' && c.p === 'green')), 'after 90 s their side resigns (as an order) and the game goes on');
say(r, g, { t: 'leave' }); advance(200);
ok(all(h, 'turn').some((m) => (m.c || []).some((c) => c.k === 'resign' && c.p === 'enemy')) && !r.ended, 'leaving mid-game resigns that side, game continues');
const g2 = conn(); say(r, g2, { t: 'hello', role: 'join', token: 'zz' }); ok(/already started/.test(last(g2, 'error').msg), 'new players cannot join a running game');
const w2 = conn(); say(r, w2, { t: 'hello', role: 'watch', token: 'w2', have: -1 });
ok(last(w2, 'history').upTo === r.history.length - 1, 'a late spectator gets the whole game so far');
say(r, h, { t: 'over' }); ok(r.ended && !r.clock, 'game over stops the clock');
r.close(h); r.close(w); r.close(w2); ok(!r.started, 'room resets once everyone has gone');
console.log(fails ? `${fails} FAILED` : 'all passed');
// quick set-ups and "–" teams
const r2 = new RoomCore('PRSET', T); const a = conn(), b = conn();
say(r2, a, { t: 'hello', role: 'host', token: 'a', name: 'A' }); say(r2, b, { t: 'hello', role: 'join', token: 'b', name: 'B' });
say(r2, a, { t: 'preset', seats: [{ used: true, team: 1 }, { used: true, team: 2 }, { used: true, team: 2 }, { used: true, team: 2 }] });
ok(r2.slots[1].kind === 'human' && r2.slots[2].kind === 'open' && r2.slots[3].kind === 'open' && r2.slots[3].team === 2, '1 v 3 preset opens seats and keeps the guest');
say(r2, a, { t: 'preset', seats: [{ used: true, team: 0 }, { used: true, team: 0 }, { used: false, team: 0 }, { used: false, team: 0 }] });
ok(r2.slots[2].kind === 'closed' && r2.slots[0].team === 0, '1v1 free-for-all preset closes the spare seats');
say(r2, a, { t: 'start' }); ok(r2.started, 'two players both on "–" can start (they are enemies)');
console.log(fails ? `${fails} FAILED` : 'all passed (incl. presets)');
