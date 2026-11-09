// The Cloudflare Worker for Age of Emissions.
//   • Everything except /api/... is the game itself (the static files), served straight from Cloudflare.
//   • /api/room/CODE opens a live connection (WebSocket) to the Room for that game code. Each Room is a
//     Durable Object: one small server that both players connect to, wherever they are in the world.
// The room logic itself lives in room-core.js.
import { DurableObject } from 'cloudflare:workers';
import { RoomCore } from './room-core.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    const m = url.pathname.match(/^\/api\/room\/([A-Z0-9]{4,8})$/);
    if (m) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      const room = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
      return room.fetch(request);
    }
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = null;
  }

  async fetch(request) {
    const code = new URL(request.url).pathname.split('/').pop();
    if (!this.core) {
      this.core = new RoomCore(code, {
        setInterval: (f, ms) => setInterval(f, ms),
        clearInterval: (id) => clearInterval(id),
        setTimeout: (f, ms) => setTimeout(f, ms),
        clearTimeout: (id) => clearTimeout(id),
      });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const conn = {
      send: (s) => server.send(s),
      close: (code, reason) => server.close(code, reason),
    };
    server.addEventListener('message', (e) => this.core.message(conn, typeof e.data === 'string' ? e.data : ''));
    let closed = false;
    const onClose = () => {
      if (closed) return;
      closed = true;
      this.core.close(conn);
      try { server.close(1000, 'bye'); } catch (e) { /* already closed */ }
    };
    server.addEventListener('close', onClose);
    server.addEventListener('error', onClose);
    return new Response(null, { status: 101, webSocket: client });
  }
}
