// The online relay: one Room per game code. It never runs the game itself — it just keeps time and passes
// commands between the two players ("lockstep"):
//
//   • Every 100 ms the room closes a "turn": all commands it received since the last turn are sent to BOTH
//     players, numbered. A turn covers 2 game ticks; nobody may run a tick until they have its turn.
//     Both games therefore run exactly the same commands on exactly the same tick, and stay identical.
//   • Every turn is kept, so a player who drops out or refreshes the page can rejoin and fast-forward.
//   • Both games send a fingerprint (hash) of their state every 2 seconds. If they ever differ, the room
//     tells both players the games have drifted apart ("desync").
//
// This file has no Cloudflare-specific code, so the same room logic runs in the real Durable Object
// (worker/index.js) and in the local test server.

export const TURN_MS = 100;
export const TICKS_PER_TURN = 2;
const WAIT_FOR_RECONNECT_MS = 90_000;
const TEAMS = ['player', 'enemy'];
const MAP_TYPES = ['continental', 'lakes', 'highlands', 'river'];
const MAX_CMD_BYTES = 4000;

const clean = (str, max) => String(str || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

export class RoomCore {
  // timers: { setInterval, clearInterval, setTimeout, clearTimeout, now } (so tests can control time)
  constructor(code, timers = globalThis) {
    this.code = code;
    this.timers = timers;
    this.reset();
  }

  reset() {
    if (this.clock) this.timers.clearInterval(this.clock);
    if (this.dropTimer) this.timers.clearTimeout(this.dropTimer);
    this.slots = [null, null];      // { token, name, conn, connected }
    this.settings = { mapType: 'continental', fog: true };
    this.started = false;
    this.ended = false;
    this.turn = 0;
    this.history = [];              // history[n] = the commands of turn n
    this.pending = [];
    this.clock = null;
    this.dropTimer = null;
    this.waitingFor = null;
    this.hashes = new Map();        // tick -> [hash from host, hash from guest]
    this.desynced = false;
  }

  get empty() {
    return !this.slots.some((s) => s && s.connected);
  }

  players() {
    return this.slots.map((s, i) => (s ? { slot: i, team: TEAMS[i], name: s.name, connected: s.connected } : null));
  }

  send(conn, msg) {
    try { conn.send(JSON.stringify(msg)); } catch (e) { /* closed */ }
  }

  broadcast(msg) {
    const str = JSON.stringify(msg);
    for (const s of this.slots) if (s && s.connected) { try { s.conn.send(str); } catch (e) { /* closed */ } }
  }

  // A browser connected. hello = { role: 'host' | 'join', token, name, have }
  // `have` is the last turn this browser already has (-1 for none), so a rejoin only gets what it missed.
  join(conn, hello) {
    const token = clean(hello.token, 64);
    if (!token) return this.reject(conn, 'Bad connection request');
    let slot = this.slots.findIndex((s) => s && s.token === token);
    if (slot < 0) {
      if (hello.role === 'host') {
        if (this.slots[0] && (this.slots[0].connected || this.started)) return this.reject(conn, 'That game code is already in use — try again.');
        if (this.slots[0]) this.reset(); // an abandoned lobby: start over
        slot = 0;
      } else {
        if (!this.slots[0] || (!this.slots[0].connected && !this.started)) return this.reject(conn, 'No game with that code. Check the code with your friend.');
        if (this.slots[1]) return this.reject(conn, 'That game already has two players.');
        slot = 1;
      }
      this.slots[slot] = { token, name: clean(hello.name, 16) || (slot ? 'Guest' : 'Host'), conn: null, connected: false };
    }
    const s = this.slots[slot];
    if (s.conn && s.conn !== conn) { try { s.conn.close(4000, 'Replaced by a new connection'); } catch (e) { /* ignore */ } }
    s.conn = conn;
    s.connected = true;
    conn.slot = slot;

    this.send(conn, {
      t: 'welcome', slot, team: TEAMS[slot], code: this.code, players: this.players(), settings: this.settings,
      started: this.started, ended: this.ended, turnMs: TURN_MS, ticksPerTurn: TICKS_PER_TURN,
    });
    if (this.started) {
      const have = Number.isInteger(hello.have) ? hello.have : -1;
      const turns = [];
      for (let n = Math.max(0, have + 1); n < this.history.length; n++) if (this.history[n].length) turns.push([n, this.history[n]]);
      this.send(conn, { t: 'history', upTo: this.history.length - 1, turns });
    }
    this.broadcast({ t: 'lobby', players: this.players(), settings: this.settings });
    if (this.started && this.waitingFor === slot) this.resume();
    return slot;
  }

  reject(conn, msg) {
    this.send(conn, { t: 'error', msg });
    try { conn.close(4001, 'rejected'); } catch (e) { /* ignore */ }
    return -1;
  }

  message(conn, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_CMD_BYTES) return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') { this.join(conn, m); return; }
    const slot = conn.slot;
    if (slot === undefined || !this.slots[slot] || this.slots[slot].conn !== conn) return;
    switch (m.t) {
      case 'settings':
        if (slot !== 0 || this.started) return;
        this.settings = {
          mapType: MAP_TYPES.includes(m.mapType) ? m.mapType : 'continental',
          fog: m.fog !== false,
        };
        this.broadcast({ t: 'lobby', players: this.players(), settings: this.settings });
        break;
      case 'start':
        if (slot !== 0 || this.started || !this.slots[1] || !this.slots[1].connected) return;
        this.started = true;
        this.settings.seed = Math.floor(Math.random() * 1e9);
        this.broadcast({ t: 'start', settings: this.settings, players: this.players(), turnMs: TURN_MS, ticksPerTurn: TICKS_PER_TURN });
        this.clock = this.timers.setInterval(() => this.closeTurn(), TURN_MS);
        break;
      case 'cmd':
        if (!this.started || this.ended || !m.c || typeof m.c !== 'object' || typeof m.c.k !== 'string') return;
        this.pending.push({ ...m.c, p: TEAMS[slot] }); // you can only ever give orders to your own side
        break;
      case 'hash': this.checkHash(slot, m.tick, m.h); break;
      case 'chat': {
        const text = clean(m.text, 200);
        if (text) this.broadcast({ t: 'chat', slot, name: this.slots[slot].name, text });
        break;
      }
      case 'ping': this.send(conn, { t: 'pong', at: m.at }); break;
      case 'over':
        // The game ended (it ends on the same tick for both). No more turns are needed.
        if (this.started && !this.ended) this.end();
        break;
      case 'leave':
        this.leave(slot);
        break;
      default: break;
    }
  }

  closeTurn() {
    if (this.waitingFor !== null || this.ended) return;
    const n = this.turn++;
    const cmds = this.pending;
    this.pending = [];
    this.history.push(cmds);
    this.broadcast(cmds.length ? { t: 'turn', n, c: cmds } : { t: 'turn', n });
  }

  checkHash(slot, tick, h) {
    if (!Number.isInteger(tick) || typeof h !== 'number') return;
    const e = this.hashes.get(tick) || [null, null];
    e[slot] = h;
    if (e[0] !== null && e[1] !== null) {
      this.hashes.delete(tick);
      if (e[0] !== e[1] && !this.desynced) {
        this.desynced = true;
        this.broadcast({ t: 'desync', tick });
      }
    } else {
      this.hashes.set(tick, e);
      if (this.hashes.size > 200) this.hashes.delete(this.hashes.keys().next().value);
    }
  }

  // A player's connection dropped.
  close(conn) {
    const slot = conn.slot;
    if (slot === undefined || !this.slots[slot] || this.slots[slot].conn !== conn) return;
    const s = this.slots[slot];
    s.connected = false;
    s.conn = null;
    if (!this.started) {
      // In the lobby: the guest just leaves; if the host leaves, the room closes.
      if (slot === 1) this.slots[1] = null;
      else { this.broadcast({ t: 'closed', msg: 'The host left.' }); this.reset(); return; }
      this.broadcast({ t: 'lobby', players: this.players(), settings: this.settings });
      return;
    }
    if (this.ended) { if (this.empty) this.reset(); return; }
    // Mid-game: stop the clock and give them time to come back.
    this.waitingFor = slot;
    this.broadcast({ t: 'wait', slot, name: s.name, seconds: WAIT_FOR_RECONNECT_MS / 1000 });
    if (this.dropTimer) this.timers.clearTimeout(this.dropTimer);
    this.dropTimer = this.timers.setTimeout(() => this.leave(slot, 'timeout'), WAIT_FOR_RECONNECT_MS);
  }

  resume() {
    this.waitingFor = null;
    if (this.dropTimer) { this.timers.clearTimeout(this.dropTimer); this.dropTimer = null; }
    this.broadcast({ t: 'resume' });
  }

  // Someone quit (or never came back). Online, quitting a running game counts as resigning.
  leave(slot, reason = 'left') {
    const s = this.slots[slot];
    if (!s) return;
    if (this.started && !this.ended) {
      this.broadcast({ t: 'left', slot, name: s.name, reason });
      this.end();
    }
    s.connected = false;
    if (s.conn) { try { s.conn.close(1000, 'left'); } catch (e) { /* ignore */ } }
    s.conn = null;
    if (!this.started) {
      if (slot === 1) this.slots[1] = null;
      else { this.broadcast({ t: 'closed', msg: 'The host left.' }); this.reset(); return; }
      this.broadcast({ t: 'lobby', players: this.players(), settings: this.settings });
    } else if (this.empty) this.reset();
  }

  end() {
    this.ended = true;
    if (this.clock) { this.timers.clearInterval(this.clock); this.clock = null; }
    if (this.dropTimer) { this.timers.clearTimeout(this.dropTimer); this.dropTimer = null; }
    this.waitingFor = null;
  }
}
