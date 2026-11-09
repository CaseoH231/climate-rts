// The connection to an online game (see worker/room-core.js for the other end).
// It keeps every turn it receives, so the game can pick them up whenever it's ready, and it reconnects by
// itself if the connection drops.

const TOKEN_KEY = 'age-of-emissions-net-token';
const NAME_KEY = 'age-of-emissions-name';
const LAST_KEY = 'age-of-emissions-last-online-game';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L mix-ups

function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, val);
  } catch (e) { /* storage blocked */ }
  return null;
}

export function playerName() {
  return store(NAME_KEY) || 'Player';
}

export function setPlayerName(name) {
  store(NAME_KEY, String(name).slice(0, 16));
}

function token() {
  let t = store(TOKEN_KEY);
  if (!t) {
    t = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    store(TOKEN_KEY, t);
  }
  return t;
}

export function newCode() {
  const r = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(r, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

export function cleanCode(str) {
  return String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

// The online game this browser was last in (for "Rejoin" after a refresh), if it was recent.
export function lastGame() {
  try {
    const g = JSON.parse(store(LAST_KEY));
    return g && Date.now() - g.at < 3 * 3600 * 1000 ? g : null;
  } catch (e) {
    return null;
  }
}

export function forgetLastGame() {
  store(LAST_KEY, null);
}

// Can this copy of the game reach the online server? (Not when it's opened from a plain local web server.)
export async function onlineAvailable() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) return false;
    const j = await res.json();
    return !!j.ok;
  } catch (e) {
    return false;
  }
}

export class Net {
  constructor(code, role) {
    this.code = cleanCode(code);
    this.role = role;              // 'host' | 'join'
    this.handlers = {};
    this.ws = null;
    this.slot = null;
    this.team = null;
    this.players = [null, null];
    this.settings = { mapType: 'continental', fog: true };
    this.started = false;
    this.turns = new Map();        // turn number -> commands (only turns that have some)
    this.maxTurn = -1;             // the latest turn we've received
    this.turnMs = 100;
    this.ticksPerTurn = 2;
    this.ping = null;
    this.closedByUs = false;
    this.retries = 0;
    this.connected = false;
  }

  on(type, fn) {
    this.handlers[type] = fn;
    return this;
  }

  emit(type, data) {
    const fn = this.handlers[type];
    if (fn) fn(data);
  }

  names() {
    return this.players.map((p) => (p ? p.name : null));
  }

  opponent() {
    return this.slot === null ? null : this.players[1 - this.slot];
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/api/room/${this.code}`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.send({ t: 'hello', role: this.role, token: token(), name: playerName(), have: this.started ? this.maxTurn : -1 });
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      this.receive(m);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.connected = false;
      if (this.closedByUs || e.code === 4001) return;
      this.emit('disconnected', e);
      // Try again a few times (the game keeps everything it has; it only needs the turns it missed).
      if (this.retries < 30) {
        this.retries++;
        setTimeout(() => { if (!this.closedByUs) this.connect(); }, Math.min(5000, 500 * this.retries));
      } else this.emit('lost');
    };
    this.pingTimer = this.pingTimer || setInterval(() => this.send({ t: 'ping', at: performance.now() }), 2000);
    return this;
  }

  receive(m) {
    switch (m.t) {
      case 'welcome':
        this.retries = 0;
        this.slot = m.slot;
        this.team = m.team;
        this.players = m.players;
        this.settings = m.settings;
        this.turnMs = m.turnMs;
        this.ticksPerTurn = m.ticksPerTurn;
        this.remember();
        break;
      case 'lobby':
        this.players = m.players;
        this.settings = m.settings;
        break;
      case 'start':
        this.started = true;
        this.settings = m.settings;
        this.players = m.players;
        this.remember();
        break;
      case 'turn':
        if (m.c && m.c.length) this.turns.set(m.n, m.c);
        if (m.n > this.maxTurn) this.maxTurn = m.n;
        return; // turns are read by the game; no handler needed
      case 'history':
        this.started = true;
        for (const [n, c] of m.turns) this.turns.set(n, c);
        if (m.upTo > this.maxTurn) this.maxTurn = m.upTo;
        break;
      case 'pong':
        this.ping = Math.round(performance.now() - m.at);
        return;
      default: break;
    }
    this.emit(m.t, m);
  }

  // Remember the game so a refresh can rejoin it.
  remember() {
    store(LAST_KEY, JSON.stringify({ code: this.code, role: this.role, at: Date.now(), started: this.started }));
  }

  // The commands to run on turn n (empty if none), or null if we don't have that turn yet.
  turn(n) {
    if (n > this.maxTurn) return null;
    const c = this.turns.get(n) || [];
    this.turns.delete(n);
    return c;
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  close(leave = true) {
    this.closedByUs = true;
    if (leave) this.send({ t: 'leave' });
    clearInterval(this.pingTimer);
    if (this.ws) { try { this.ws.close(1000); } catch (e) { /* ignore */ } }
    forgetLastGame();
  }
}
