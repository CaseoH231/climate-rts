// Local test server: serves the site and runs the same RoomCore as the Cloudflare Durable Object,
// over a tiny hand-written WebSocket implementation (no packages needed).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { RoomCore } from '../worker/room-core.js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const PORT = Number(process.argv[2] || 8790);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };
const rooms = new Map();
const LAG = Number(process.env.LAG || 0); // simulated one-way delay in ms

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
  if (u.pathname === '/__drop') { // test hook: cut every connection in a room
    for (const c of (rooms.get(u.searchParams.get('code'))?.conns || [])) if (c.slot == u.searchParams.get('slot')) c.socket.destroy();
    res.end('ok'); return;
  }
  let p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (u.pathname.endsWith('/')) p = path.join(p, 'index.html');
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

function frame(str, opcode = 1) {
  const payload = Buffer.from(str);
  const n = payload.length;
  let head;
  if (n < 126) head = Buffer.from([0x80 | opcode, n]);
  else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([head, payload]);
}

server.on('upgrade', (req, socket) => {
  const u = new URL(req.url, 'http://x');
  const m = u.pathname.match(/^\/api\/room\/([A-Z0-9]{4,8})$/);
  if (!m) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const code = m[1];
  if (!rooms.has(code)) { const core = new RoomCore(code); core.conns = new Set(); rooms.set(code, core); }
  const core = rooms.get(code);
  let open = true;
  const conn = {
    socket,
    send: (s) => { if (!open) return; const f = frame(s); if (LAG) setTimeout(() => open && socket.write(f), LAG); else socket.write(f); },
    close: () => { if (open) { try { socket.write(frame('', 8)); } catch (e) {} socket.end(); } },
  };
  core.conns.add(conn);
  let buf = Buffer.alloc(0);
  let text = [];
  socket.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80; const op = buf[0] & 0x0f; let len = buf[1] & 0x7f; let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const masked = buf[1] & 0x80; const mask = masked ? buf.subarray(off, off + 4) : null; if (masked) off += 4;
      if (buf.length < off + len) return;
      const payload = Buffer.from(buf.subarray(off, off + len)); buf = buf.subarray(off + len);
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      if (op === 8) { socket.end(); return; }
      if (op === 9) { socket.write(frame(payload.toString(), 10)); continue; }
      if (op === 1 || op === 0) {
        text.push(payload);
        if (fin) { const s = Buffer.concat(text).toString(); text = []; if (LAG) setTimeout(() => core.message(conn, s), LAG); else core.message(conn, s); }
      }
    }
  });
  const gone = () => { if (!open) return; open = false; core.conns.delete(conn); core.close(conn); };
  socket.on('close', gone);
  socket.on('error', gone);
});

server.listen(PORT, () => console.log('mp test server on', PORT));
