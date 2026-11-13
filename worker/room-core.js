// The online relay: one Room per game code. It never runs the game itself — it just keeps time and passes
// commands between the players ("lockstep"):
//
//   • Every 100 ms the room closes a "turn": all commands it received since the last turn are sent to
//     EVERYONE, numbered. A turn covers 2 game ticks; nobody may run a tick until they have its turn.
//     Every game therefore runs exactly the same commands on exactly the same tick, and stays identical.
//     (Computer players are part of the game itself, so every computer runs them identically too.)
//   • Every turn is kept, so a player who drops out or refreshes the page can rejoin and fast-forward,
//     and spectators can join at any time.
//   • Every game sends a fingerprint (hash) of its state every 2 seconds. If two ever differ, the room
//     tells everyone the games have drifted apart ("desync").
//
// Seats: up to four sides (Blue, Red, Green, Yellow). The host decides what each seat is: open for a
// person to join, a computer player, or closed; and its team, AoE2-style: 1–4, or 0 ("–") for nobody's
// ally. Seats with the same team number are allies.
//
// This file has no Cloudflare-specific code, so the same room logic runs in the real Durable Object
// (worker/index.js) and in the local test server.

import { cleanRules } from '../src/setup.js';
import { CIV_CHOICES } from '../src/civs.js';

export const TURN_MS = 100;
export const TICKS_PER_TURN = 2;
const WAIT_FOR_RECONNECT_MS = 90_000;
const TEAMS = ['player', 'enemy', 'green', 'yellow'];
const MAP_TYPES = ['continental', 'lakes', 'highlands', 'river'];
const AI_LEVELS = ['easy', 'normal', 'hard'];
const MAX_MSG_BYTES = 4000;
const MAX_WATCHERS = 8;

const clean = (str, max) => String(str || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

export class RoomCore {
  // timers: { setInterval, clearInterval, setTimeout, clearTimeout } (so tests can control time)
  constructor(code, timers = globalThis) {
    this.code = code;
    this.timers = timers;
    this.reset();
  }

  reset() {
    if (this.clock) this.timers.clearInterval(this.clock);
    for (const t of (this.dropTimers || new Map()).values()) this.timers.clearTimeout(t);
    // seat: { kind: 'human'|'ai'|'open'|'closed', team (0–4), ai?, token?, name?, conn?, connected? }
    this.slots = [
      { kind: 'human', team: 1, token: null, civ: 'random' },
      { kind: 'open', team: 2, civ: 'random' },
      { kind: 'closed', team: 0, civ: 'random' },
      { kind: 'closed', team: 0, civ: 'random' },
    ];
    this.watchers = [];             // spectators: { token, name, conn }
    this.settings = { mapType: 'continental', ...cleanRules({}) };
    this.started = false;
    this.ended = false;
    this.turn = 0;
    this.history = [];              // history[n] = the commands of turn n
    this.pending = [];
    this.clock = null;
    this.waiting = new Set();       // seats we're waiting for (they dropped out mid-game)
    this.dropTimers = new Map();
    this.hashes = new Map();        // tick -> the first fingerprint we got for it
    this.desynced = false;
  }

  get hostHere() {
    return !!(this.slots[0].token && (this.slots[0].connected || this.started));
  }

  get empty() {
    return !this.slots.some((s) => s.kind === 'human' && s.connected) && !this.watchers.length;
  }

  // What everyone may know about the seats.
  publicSlots() {
    return this.slots.map((s, i) => ({
      slot: i, side: TEAMS[i], kind: s.kind, team: s.team, civ: s.civ || 'random',
      ai: s.kind === 'ai' ? s.ai : undefined,
      name: s.kind === 'human' ? s.name : undefined,
      connected: s.kind === 'human' ? !!s.connected : undefined,
    }));
  }

  lobbyMsg() {
    return { t: 'lobby', slots: this.publicSlots(), watchers: this.watchers.map((w) => w.name), settings: this.settings };
  }

  send(conn, msg) {
    try { conn.send(JSON.stringify(msg)); } catch (e) { /* closed */ }
  }

  broadcast(msg) {
    const str = JSON.stringify(msg);
    const conns = [...this.slots.filter((s) => s.kind === 'human' && s.connected).map((s) => s.conn), ...this.watchers.filter((w) => w.conn).map((w) => w.conn)];
    for (const c of conns) { try { c.send(str); } catch (e) { /* closed */ } }
  }

  // A browser connected. hello = { role: 'host' | 'join' | 'watch', token, name, have }
  // `have` is the last turn this browser already has (-1 for none), so a rejoin only gets what it missed.
  join(conn, hello) {
    const token = clean(hello.token, 64);
    if (!token) return this.reject(conn, 'Bad connection request');
    const name = clean(hello.name, 16);
    let slot = this.slots.findIndex((s) => s.kind === 'human' && s.token === token);
    let watcher = slot < 0 ? this.watchers.find((w) => w.token === token) : null;
    if (slot < 0 && !watcher) {
      if (hello.role === 'host') {
        if (this.hostHere) return this.reject(conn, 'That game code is already in use — try again.');
        this.reset();
        slot = 0;
        Object.assign(this.slots[0], { token, name: name || 'Host' });
      } else if (!this.hostHere) {
        return this.reject(conn, 'No game with that code. Check the code with your friend.');
      } else if (hello.role === 'watch') {
        if (this.watchers.length >= MAX_WATCHERS) return this.reject(conn, 'That game already has as many spectators as it can take.');
        watcher = { token, name: name || 'Spectator', conn: null };
        this.watchers.push(watcher);
      } else {
        if (this.started) return this.reject(conn, 'That game has already started — you can still watch it.');
        slot = this.slots.findIndex((s) => s.kind === 'open');
        if (slot < 0) return this.reject(conn, 'That game has no free seats — you can still watch it.');
        Object.assign(this.slots[slot], { kind: 'human', token, name: name || 'Player' });
      }
    }
    const seat = watcher || this.slots[slot];
    if (seat.conn && seat.conn !== conn) { try { seat.conn.close(4000, 'Replaced by a new connection'); } catch (e) { /* ignore */ } }
    seat.conn = conn;
    if (!watcher) seat.connected = true;
    conn.slot = watcher ? null : slot;
    conn.watcher = watcher || null;

    this.send(conn, {
      t: 'welcome', slot: conn.slot, team: watcher ? null : TEAMS[slot], spectator: !!watcher, code: this.code,
      slots: this.publicSlots(), settings: this.settings, started: this.started, ended: this.ended,
      turnMs: TURN_MS, ticksPerTurn: TICKS_PER_TURN,
    });
    if (this.started) {
      const have = Number.isInteger(hello.have) ? hello.have : -1;
      const turns = [];
      for (let n = Math.max(0, have + 1); n < this.history.length; n++) if (this.history[n].length) turns.push([n, this.history[n]]);
      this.send(conn, { t: 'history', upTo: this.history.length - 1, turns });
    }
    this.broadcast(this.lobbyMsg());
    if (!watcher && this.started && this.waiting.has(slot)) this.stopWaiting(slot);
    return slot;
  }

  reject(conn, msg) {
    this.send(conn, { t: 'error', msg });
    try { conn.close(4001, 'rejected'); } catch (e) { /* ignore */ }
    return -1;
  }

  message(conn, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MSG_BYTES) return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') { this.join(conn, m); return; }
    const watcher = conn.watcher;
    const slot = conn.slot;
    const seat = watcher || (slot !== undefined && slot !== null ? this.slots[slot] : null);
    if (!seat || seat.conn !== conn) return;
    const host = slot === 0;
    switch (m.t) {
      case 'settings':
        if (!host || this.started) return;
        // map type + game settings (map size, resources, starting age, population, reveal, peace, victory, climate)
        this.settings = { mapType: MAP_TYPES.includes(m.mapType) ? m.mapType : this.settings.mapType, ...cleanRules({ ...this.settings, ...m }) };
        this.broadcast(this.lobbyMsg());
        break;
      case 'slot': {
        // The host sets a seat: { i, kind?: 'open'|'ai'|'closed', ai?: level, team?: 0–4 }
        if (!host || this.started || !Number.isInteger(m.i) || m.i < 0 || m.i > 3) return;
        const s = this.slots[m.i];
        if (Number.isInteger(m.team) && m.team >= 0 && m.team <= 4) s.team = m.team;
        if (m.i !== 0 && s.kind !== 'human' && ['open', 'ai', 'closed'].includes(m.kind)) {
          s.kind = m.kind;
          if (m.kind === 'ai') s.ai = AI_LEVELS.includes(m.ai) ? m.ai : 'normal';
        }
        this.broadcast(this.lobbyMsg());
        break;
      }
      case 'civ': {
        // A player picks their own civilisation; the host also picks for computer seats.
        if (this.started || !Number.isInteger(m.i) || m.i < 0 || m.i > 3 || !CIV_CHOICES.includes(m.civ)) return;
        const s = this.slots[m.i];
        if (watcher || !(m.i === slot || (host && s.kind === 'ai'))) return;
        s.civ = m.civ;
        this.broadcast(this.lobbyMsg());
        break;
      }
      case 'preset': {
        // A quick set-up: which seats are in the game and their teams. Seats people are sitting in stay theirs.
        if (!host || this.started || !Array.isArray(m.seats) || m.seats.length !== 4) return;
        m.seats.forEach((p, i) => {
          const s = this.slots[i];
          if (!p || typeof p !== 'object') return;
          if (Number.isInteger(p.team) && p.team >= 0 && p.team <= 4) s.team = p.team;
          if (i === 0 || s.kind === 'human') return;
          if (p.used && s.kind === 'closed') s.kind = 'open';
          if (!p.used) s.kind = 'closed';
        });
        this.broadcast(this.lobbyMsg());
        break;
      }
      case 'start': {
        if (!host || this.started) return;
        const problem = this.startProblem();
        if (problem) { this.send(conn, { t: 'notice', msg: problem }); return; }
        this.started = true;
        this.settings.seed = Math.floor(Math.random() * 1e9);
        this.settings.slots = this.publicSlots().map((s) => ({ kind: s.kind, team: s.team, ai: s.ai, name: s.name, civ: s.civ }));
        this.broadcast({ t: 'start', settings: this.settings, slots: this.publicSlots(), turnMs: TURN_MS, ticksPerTurn: TICKS_PER_TURN });
        this.clock = this.timers.setInterval(() => this.closeTurn(), TURN_MS);
        break;
      }
      case 'cmd':
        // Only seated players give orders, and only ever to their own side.
        if (watcher || !this.started || this.ended || this.slots[slot].left || !m.c || typeof m.c !== 'object' || typeof m.c.k !== 'string') return;
        this.pending.push({ ...m.c, p: TEAMS[slot] });
        break;
      case 'hash': this.checkHash(m.tick, m.h); break;
      case 'chat': {
        const text = clean(m.text, 200);
        if (text) this.broadcast({ t: 'chat', slot: watcher ? null : slot, name: watcher ? `${seat.name} (watching)` : seat.name, text });
        break;
      }
      case 'ping': this.send(conn, { t: 'pong', at: m.at }); break;
      case 'over':
        // The game ended (it ends on the same tick for everyone). No more turns are needed.
        if (this.started && !this.ended) this.end();
        break;
      case 'leave':
        if (watcher) this.dropWatcher(watcher);
        else this.leave(slot);
        break;
      default: break;
    }
  }

  // Why the host can't start yet (or null if they can).
  startProblem() {
    const seats = this.slots.filter((s) => s.kind === 'human' || s.kind === 'ai');
    if (this.slots.some((s) => s.kind === 'open')) return 'Waiting for players to fill the open seats (or set them to Computer or Closed).';
    if (this.slots.some((s) => s.kind === 'human' && !s.connected)) return 'Waiting for a player to reconnect.';
    if (seats.length < 2) return 'You need at least two sides.';
    const alliance = (s) => (s.team > 0 ? s.team : 10 + this.slots.indexOf(s));
    if (new Set(seats.map(alliance)).size < 2) return 'Everyone is on the same team — put at least one side on another team (or on "–").';
    return null;
  }

  closeTurn() {
    if (this.waiting.size || this.ended) return;
    const n = this.turn++;
    const cmds = this.pending;
    this.pending = [];
    this.history.push(cmds);
    this.broadcast(cmds.length ? { t: 'turn', n, c: cmds } : { t: 'turn', n });
  }

  checkHash(tick, h) {
    if (!Number.isInteger(tick) || typeof h !== 'number') return;
    if (!this.hashes.has(tick)) {
      this.hashes.set(tick, h);
      if (this.hashes.size > 300) this.hashes.delete(this.hashes.keys().next().value);
    } else if (this.hashes.get(tick) !== h && !this.desynced) {
      this.desynced = true;
      this.broadcast({ t: 'desync', tick });
    }
  }

  // A connection dropped.
  close(conn) {
    if (conn.watcher) {
      if (conn.watcher.conn === conn) this.dropWatcher(conn.watcher);
      return;
    }
    const slot = conn.slot;
    if (slot === undefined || slot === null) return;
    const s = this.slots[slot];
    if (s.kind !== 'human' || s.conn !== conn) return;
    s.connected = false;
    s.conn = null;
    if (!this.started) {
      // In the lobby: a guest just leaves (their seat opens up again); if the host leaves, the room closes.
      if (slot === 0) { this.broadcast({ t: 'closed', msg: 'The host left.' }); this.reset(); return; }
      this.slots[slot] = { kind: 'open', team: s.team };
      this.broadcast(this.lobbyMsg());
      return;
    }
    if (this.ended) { if (this.empty) this.reset(); return; }
    if (s.left) return;
    // Mid-game: stop the clock and give them time to come back.
    this.waiting.add(slot);
    this.broadcast({ t: 'wait', slot, name: s.name, seconds: WAIT_FOR_RECONNECT_MS / 1000 });
    this.broadcast(this.lobbyMsg());
    if (this.dropTimers.has(slot)) this.timers.clearTimeout(this.dropTimers.get(slot));
    this.dropTimers.set(slot, this.timers.setTimeout(() => this.leave(slot, 'timeout'), WAIT_FOR_RECONNECT_MS));
  }

  stopWaiting(slot) {
    this.waiting.delete(slot);
    if (this.dropTimers.has(slot)) { this.timers.clearTimeout(this.dropTimers.get(slot)); this.dropTimers.delete(slot); }
    if (!this.waiting.size) this.broadcast({ t: 'resume' });
  }

  dropWatcher(w) {
    this.watchers = this.watchers.filter((x) => x !== w);
    if (w.conn) { const c = w.conn; w.conn = null; try { c.close(1000, 'left'); } catch (e) { /* ignore */ } }
    if (this.started && this.empty) { this.end(); this.reset(); return; }
    this.broadcast(this.lobbyMsg());
  }

  // A player quit (or never came back). Mid-game their side resigns — as an order in the next turn, so
  // every computer removes them on exactly the same tick — and the game carries on for everyone else.
  leave(slot, reason = 'left') {
    const s = this.slots[slot];
    if (!s || s.kind !== 'human') return;
    if (this.started && !this.ended && !s.left) {
      s.left = true;
      this.pending.push({ k: 'resign', p: TEAMS[slot] });
      this.broadcast({ t: 'left', slot, name: s.name, reason });
      if (this.waiting.has(slot)) this.stopWaiting(slot);
    }
    s.connected = false;
    if (s.conn) { const c = s.conn; s.conn = null; try { c.close(1000, 'left'); } catch (e) { /* ignore */ } }
    if (!this.started) {
      if (slot === 0) { this.broadcast({ t: 'closed', msg: 'The host left.' }); this.reset(); return; }
      this.slots[slot] = { kind: 'open', team: s.team };
      this.broadcast(this.lobbyMsg());
      return;
    }
    // Nobody left to play or watch: stop.
    if (this.empty) { this.end(); this.reset(); return; }
    this.broadcast(this.lobbyMsg());
  }

  end() {
    this.ended = true;
    if (this.clock) { this.timers.clearInterval(this.clock); this.clock = null; }
    for (const t of this.dropTimers.values()) this.timers.clearTimeout(t);
    this.dropTimers.clear();
    this.waiting.clear();
  }
}
