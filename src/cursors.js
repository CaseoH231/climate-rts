// Mouse cursors drawn in code: a bronze arrow, plus a sword, pickaxe and hammer that show
// what a right-click will do. Each becomes a CSS cursor (data URL + hotspot).

function cursor(draw, hx, hy) {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  return `url(${c.toDataURL()}) ${hx} ${hy}, auto`;
}

// Draw a shape with a dark outline underneath so it reads on any terrain.
function outlined(ctx, path, fill, line = 1.2) {
  ctx.save();
  path();
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = line + 2;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,200,0.55)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}

let cache = null;

export function cursors() {
  if (cache) return cache;
  const arrow = cursor((ctx) => {
    outlined(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(2, 2); ctx.lineTo(2, 22); ctx.lineTo(7.5, 17); ctx.lineTo(11, 25); ctx.lineTo(14.5, 23.5);
      ctx.lineTo(11, 15.5); ctx.lineTo(18, 15.5); ctx.closePath();
    }, (() => { const g = ctx.createLinearGradient(2, 2, 16, 24); g.addColorStop(0, '#f6e0a0'); g.addColorStop(1, '#a8782e'); return g; })());
  }, 2, 2);

  const sword = cursor((ctx) => {
    // blade from top-left down to the hilt
    outlined(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(2, 2); ctx.lineTo(7, 3); ctx.lineTo(21, 17); ctx.lineTo(17, 21); ctx.lineTo(3, 7); ctx.closePath();
    }, '#dfe3e8');
    outlined(ctx, () => { ctx.beginPath(); ctx.moveTo(15, 25); ctx.lineTo(25, 15); ctx.lineTo(27, 17); ctx.lineTo(17, 27); ctx.closePath(); }, '#c9a227');
    outlined(ctx, () => { ctx.beginPath(); ctx.moveTo(21, 23); ctx.lineTo(23, 21); ctx.lineTo(29, 27); ctx.lineTo(27, 29); ctx.closePath(); }, '#6a4422');
    ctx.fillStyle = '#c9a227';
    ctx.beginPath(); ctx.arc(29, 29, 2, 0, Math.PI * 2); ctx.fill();
  }, 2, 2);

  const pick = cursor((ctx) => {
    // handle
    outlined(ctx, () => { ctx.beginPath(); ctx.moveTo(10, 9); ctx.lineTo(13, 7); ctx.lineTo(29, 26); ctx.lineTo(26, 28); ctx.closePath(); }, '#8a5a2a');
    // iron head, point at top-left
    outlined(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(2, 3); ctx.quadraticCurveTo(10, 2, 20, 3); ctx.lineTo(19, 6); ctx.quadraticCurveTo(10, 6, 2, 3); ctx.closePath();
    }, '#b9bec6');
    outlined(ctx, () => { ctx.beginPath(); ctx.moveTo(8, 2); ctx.lineTo(15, 2); ctx.lineTo(14, 10); ctx.lineTo(9, 10); ctx.closePath(); }, '#9aa0a8');
  }, 2, 3);

  const hammer = cursor((ctx) => {
    outlined(ctx, () => { ctx.beginPath(); ctx.moveTo(12, 12); ctx.lineTo(15, 10); ctx.lineTo(29, 26); ctx.lineTo(26, 28); ctx.closePath(); }, '#8a5a2a');
    outlined(ctx, () => {
      ctx.beginPath();
      ctx.moveTo(2, 9); ctx.lineTo(10, 1); ctx.lineTo(19, 10); ctx.lineTo(11, 18); ctx.closePath();
    }, '#8e949c');
  }, 3, 9);

  cache = { arrow, sword, pick, hammer };
  return cache;
}
