import {
  TILE, CAR_W, CAR_H,
  WALL_THICKNESS, GHOST_ALPHA,
  GAME_W, GAME_H,
} from './constants.js';
import { DIR_VEC } from './track.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return '--:--.--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function pillRect(ctx, cx, cy, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 + r, cy - h / 2);
  ctx.arcTo(cx + w / 2, cy - h / 2, cx + w / 2, cy + h / 2, r);
  ctx.arcTo(cx + w / 2, cy + h / 2, cx - w / 2, cy + h / 2, r);
  ctx.arcTo(cx - w / 2, cy + h / 2, cx - w / 2, cy - h / 2, r);
  ctx.arcTo(cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2, r);
  ctx.closePath();
}

// ── Track rendering ───────────────────────────────────────────────────────────

export function drawTrack(ctx, track, walls, centerLine) {
  const T = TILE;

  // 1. Asphalt fill
  ctx.fillStyle = '#3d3d3d';
  for (const tile of track.tiles) {
    for (const cell of tile.cells) {
      ctx.fillRect(cell.x * T, cell.y * T, T, T);
    }
  }

  // 2. Start / finish checkered pattern
  for (const tile of track.tiles) {
    if (tile.type !== 'start' && tile.type !== 'finish') continue;

    const { gx, gy, dir } = tile;
    // Center of tile in world coords
    const wcx = (gx + 0.5) * T;
    const wcy = (gy + 0.5) * T;

    const fwd = DIR_VEC[dir];
    // Perpendicular direction (left in screen coords)
    const px = -fwd.y;
    const py = fwd.x;

    // Draw 8 alternating squares across the track width
    const squares = 8;
    const sqW = T / squares;   // along perpendicular
    const sqH = T * 0.12;      // along forward direction (thin stripe)
    const stripeCount = 2;     // two rows of checker

    ctx.save();
    ctx.translate(wcx, wcy);
    // Rotate so "forward" is +Y in local space
    ctx.rotate(Math.atan2(fwd.y, fwd.x) - Math.PI / 2);

    for (let row = 0; row < stripeCount; row++) {
      const rowY = -sqH * stripeCount / 2 + row * sqH;
      for (let col = 0; col < squares; col++) {
        const colX = -T / 2 + col * sqW;
        const isDark = (row + col) % 2 === 0;
        ctx.fillStyle = isDark ? '#000' : '#fff';
        ctx.fillRect(colX, rowY, sqW, sqH);
      }
    }
    ctx.restore();
  }

  // 3. Start tile — pole position marker
  for (const tile of track.tiles) {
    if (tile.type !== 'grid') continue;
    const { gx, gy } = tile;
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.strokeRect(gx * T + 20, gy * T + 20, T - 40, T - 40);
    // Draw "P1" text
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${T * 0.18}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P1', (gx + 0.5) * T, (gy + 0.5) * T);
    ctx.restore();
  }

  // 4. Center dashes
  if (centerLine && centerLine.length > 1) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.setLineDash([40, 40]);
    ctx.lineDashOffset = 0;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(centerLine[0].x, centerLine[0].y);
    for (let i = 1; i < centerLine.length; i++) {
      ctx.lineTo(centerLine[i].x, centerLine[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // 5. Wall paths
  if (walls) {
    ctx.save();
    ctx.strokeStyle = '#888';
    ctx.lineWidth = WALL_THICKNESS;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash([]);

    for (const side of [walls.left, walls.right]) {
      if (!side || side.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(side[0].x, side[0].y);
      for (let i = 1; i < side.length; i++) {
        ctx.lineTo(side[i].x, side[i].y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ── Car rendering ─────────────────────────────────────────────────────────────

export function drawCar(ctx, x, y, angle, bodyColor = '#e63030', wingColor = '#222', alpha = 1) {
  const W = CAR_W;
  const H = CAR_H;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Shadow ellipse
  ctx.save();
  ctx.globalAlpha = alpha * 0.25;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, H * 0.02, W * 0.55, H * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── Local coordinate system: nose at -H/2 (top), tail at +H/2 ──

  const noseY   = -H / 2;
  const tailY   =  H / 2;
  const bodyW   = W * 0.55;

  // Rear wing (behind tail)
  ctx.fillStyle = wingColor;
  ctx.fillRect(-W * 0.48, tailY - H * 0.07, W * 0.96, H * 0.04);
  // rear wing endplates
  ctx.fillRect(-W * 0.48, tailY - H * 0.10, W * 0.06, H * 0.07);
  ctx.fillRect( W * 0.42, tailY - H * 0.10, W * 0.06, H * 0.07);

  // Main body — tapered nose
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  // nose tip
  ctx.moveTo(0, noseY);
  // widen toward monocoque
  ctx.lineTo( bodyW * 0.25, noseY + H * 0.18);
  ctx.lineTo( bodyW * 0.5,  noseY + H * 0.30);
  // full width down the sides
  ctx.lineTo( bodyW * 0.5,  tailY - H * 0.12);
  // taper to tail
  ctx.lineTo( bodyW * 0.35, tailY);
  ctx.lineTo(-bodyW * 0.35, tailY);
  ctx.lineTo(-bodyW * 0.5,  tailY - H * 0.12);
  ctx.lineTo(-bodyW * 0.5,  noseY + H * 0.30);
  ctx.lineTo(-bodyW * 0.25, noseY + H * 0.18);
  ctx.closePath();
  ctx.fill();

  // Cockpit opening
  ctx.fillStyle = '#111';
  const cockpitW = bodyW * 0.45;
  const cockpitTop = noseY + H * 0.32;
  const cockpitBot = noseY + H * 0.56;
  ctx.beginPath();
  ctx.ellipse(0, (cockpitTop + cockpitBot) / 2, cockpitW, (cockpitBot - cockpitTop) / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sidepods
  ctx.fillStyle = bodyColor;
  const podW = W * 0.15;
  const podH = H * 0.28;
  const podY = noseY + H * 0.38;
  // left sidepod
  ctx.fillRect(-bodyW * 0.5 - podW * 0.6, podY, podW * 1.1, podH);
  // right sidepod
  ctx.fillRect( bodyW * 0.5 - podW * 0.5, podY, podW * 1.1, podH);

  // Front wing
  ctx.fillStyle = wingColor;
  const fwY = noseY + H * 0.12;
  ctx.fillRect(-W * 0.40, fwY, W * 0.80, H * 0.035);
  // front wing endplates
  ctx.fillRect(-W * 0.40, fwY - H * 0.02, W * 0.05, H * 0.055);
  ctx.fillRect( W * 0.35, fwY - H * 0.02, W * 0.05, H * 0.055);

  // Tires (4 wheels)
  ctx.fillStyle = '#222';
  const tireW = W * 0.20;
  const tireH = H * 0.13;
  const tireFY = noseY + H * 0.17;   // front axle
  const tireRY = tailY  - H * 0.20;  // rear axle
  const tireX  = bodyW * 0.48;

  // Front-left
  ctx.fillRect(-tireX - tireW, tireFY, tireW, tireH);
  // Front-right
  ctx.fillRect( tireX, tireFY, tireW, tireH);
  // Rear-left
  ctx.fillRect(-tireX - tireW, tireRY, tireW, tireH);
  // Rear-right
  ctx.fillRect( tireX, tireRY, tireW, tireH);

  // Tire highlights
  ctx.fillStyle = '#555';
  const tireHighH = tireH * 0.3;
  const tireHighOff = tireH * 0.15;
  ctx.fillRect(-tireX - tireW, tireFY + tireHighOff, tireW, tireHighH);
  ctx.fillRect( tireX, tireFY + tireHighOff, tireW, tireHighH);
  ctx.fillRect(-tireX - tireW, tireRY + tireHighOff, tireW, tireHighH);
  ctx.fillRect( tireX, tireRY + tireHighOff, tireW, tireHighH);

  // Nose highlight stripe
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(0, noseY);
  ctx.lineTo(bodyW * 0.12, noseY + H * 0.18);
  ctx.lineTo(bodyW * 0.18, noseY + H * 0.30);
  ctx.lineTo(-bodyW * 0.18, noseY + H * 0.30);
  ctx.lineTo(-bodyW * 0.12, noseY + H * 0.18);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// ── HUD rendering ─────────────────────────────────────────────────────────────

export function drawHUD(ctx, currentTime, bestTime, speed, seed) {
  const CX = GAME_W / 2;
  const pillW = 320;
  const pillH = 72;
  const r = 18;

  // Timer pill — top center
  const timerY = 60;
  ctx.save();
  pillRect(ctx, CX, timerY, pillW, pillH, r);
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatTime(currentTime), CX, timerY);

  // Best time
  if (bestTime !== null && bestTime !== undefined) {
    const bestY = timerY + pillH / 2 + 32;
    ctx.fillStyle = '#5bc8f5';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('BEST  ' + formatTime(bestTime), CX, bestY);
  }

  // Seed — top left
  if (seed !== undefined) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '20px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('seed: ' + seed, 16, 16);
  }

  ctx.restore();
}

// ── Overlay screens ───────────────────────────────────────────────────────────

export function drawTitleScreen(ctx, seed) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 110px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RACING 2D', GAME_W / 2, GAME_H * 0.38);

  ctx.fillStyle = '#ccc';
  ctx.font = '52px sans-serif';
  ctx.fillText('Tap to Race', GAME_W / 2, GAME_H * 0.55);

  ctx.fillStyle = '#666';
  ctx.font = '24px sans-serif';
  ctx.fillText('v0.14 — seed: ' + seed, GAME_W / 2, GAME_H * 0.92);

  ctx.restore();
}

export function drawCountdown(ctx, number) {
  ctx.save();

  const cx = GAME_W / 2;
  const cy = GAME_H * 0.3;
  const lightR = 48;
  const spacing = 140;
  const panelW = spacing * 2 + lightR * 2 + 60;
  const panelH = lightR * 2 + 50;

  // Dark panel behind lights
  ctx.fillStyle = 'rgba(20,20,20,0.9)';
  ctx.beginPath();
  ctx.roundRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 16);
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 3 lights: number=3 → 1 lit, number=2 → 2 lit, number=1 → 3 lit, number=0 → all off
  const litCount = number > 0 ? (4 - number) : 0;

  for (let i = 0; i < 3; i++) {
    const lx = cx + (i - 1) * spacing;
    const isLit = i < litCount;

    // Light housing (dark circle)
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(lx, cy, lightR + 6, 0, Math.PI * 2);
    ctx.fill();

    if (isLit) {
      // Glow
      ctx.fillStyle = 'rgba(255,30,30,0.3)';
      ctx.beginPath();
      ctx.arc(lx, cy, lightR + 20, 0, Math.PI * 2);
      ctx.fill();

      // Lit red
      ctx.fillStyle = '#ff2020';
      ctx.beginPath();
      ctx.arc(lx, cy, lightR, 0, Math.PI * 2);
      ctx.fill();

      // Highlight
      ctx.fillStyle = 'rgba(255,150,150,0.4)';
      ctx.beginPath();
      ctx.arc(lx - lightR * 0.2, cy - lightR * 0.25, lightR * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Unlit (dark red)
      ctx.fillStyle = '#3a0a0a';
      ctx.beginPath();
      ctx.arc(lx, cy, lightR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

export function drawFinishScreen(ctx, raceTime, delta, isNewRecord) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (isNewRecord) {
    ctx.fillStyle = '#f0c040';
    ctx.font = 'bold 80px sans-serif';
    ctx.fillText('NEW RECORD!', GAME_W / 2, GAME_H * 0.30);
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 80px sans-serif';
    ctx.fillText('FINISH', GAME_W / 2, GAME_H * 0.30);
  }

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 110px monospace';
  ctx.fillText(formatTime(raceTime), GAME_W / 2, GAME_H * 0.44);

  if (delta !== null && delta !== undefined) {
    const sign = delta < 0 ? '-' : '+';
    ctx.fillStyle = delta < 0 ? '#4cff72' : '#ff5555';
    ctx.font = 'bold 64px monospace';
    ctx.fillText(`${sign}${formatTime(Math.abs(delta))}`, GAME_W / 2, GAME_H * 0.55);
  }

  ctx.fillStyle = '#aaa';
  ctx.font = '52px sans-serif';
  ctx.fillText('Tap to Race Again', GAME_W / 2, GAME_H * 0.70);

  ctx.restore();
}

export function drawCrashScreen(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(180,0,0,0.55)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 130px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CRASH!', GAME_W / 2, GAME_H * 0.40);

  ctx.fillStyle = '#eee';
  ctx.font = '56px sans-serif';
  ctx.fillText('Tap to Retry', GAME_W / 2, GAME_H * 0.55);

  ctx.restore();
}

// ── Steering wheel ───────────────────────────────────────────────────────────

/**
 * Draw a steering wheel at the drag origin position.
 * @param {number} screenX - game-space X of drag origin
 * @param {number} screenY - game-space Y of drag origin
 * @param {number} steering - -1 to +1
 */
export function drawSteeringWheel(ctx, screenX, screenY, steering) {
  const r = 80;
  const rotation = steering * Math.PI * 0.75; // max 135° rotation

  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.translate(screenX, screenY);
  ctx.rotate(rotation);

  // Outer ring
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  // Spokes (3 spokes at 120° apart, starting from bottom)
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  const spokeAngles = [-Math.PI / 2, -Math.PI / 2 + Math.PI * 2 / 3, -Math.PI / 2 - Math.PI * 2 / 3];
  for (const a of spokeAngles) {
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }

  // Center hub
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();

  // Top marker (so you can see rotation)
  ctx.fillStyle = '#e63030';
  ctx.beginPath();
  ctx.arc(0, -r, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ── Minimap ──────────────────────────────────────────────────────────────────

/**
 * Draw a minimap of the track in the bottom-right corner.
 * @param {object} track - track data from generateTrack
 * @param {object} centerLine - center-line path points
 * @param {number} carX - car world X
 * @param {number} carY - car world Y
 */
export function drawMinimap(ctx, track, centerLine, carX, carY, speed, startAngle) {
  const mapSize = 240;
  const margin = 24;
  const mapX = GAME_W - mapSize - margin;
  const mapY = GAME_H - mapSize - margin - 80;
  const mapCx = mapX + mapSize / 2;
  const mapCy = mapY + mapSize / 2;

  ctx.save();

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.arc(mapCx, mapCy, mapSize / 2 + 4, 0, Math.PI * 2);
  ctx.fill();

  // Compute bounds of the track to fit into the map
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of centerLine) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = TILE;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;

  const trackW = maxX - minX;
  const trackH = maxY - minY;
  const scale = Math.min((mapSize - 20) / trackW, (mapSize - 20) / trackH);
  const trackCx = (minX + trackW / 2);
  const trackCy = (minY + trackH / 2);

  // Rotation to make start direction point upward
  // startAngle is the car's world angle at start. We rotate the map by -startAngle
  // so the car's forward direction points up on the minimap.
  const rot = -(startAngle || 0);

  // Clip to circle
  ctx.beginPath();
  ctx.arc(mapCx, mapCy, mapSize / 2, 0, Math.PI * 2);
  ctx.clip();

  // Transform: translate to map center, rotate, then scale and offset
  ctx.translate(mapCx, mapCy);
  ctx.rotate(rot);

  // Helper to convert world coords to rotated map coords (before the ctx transform)
  // After ctx transform, world points just need scale + offset from track center
  const ox = -trackCx * scale;
  const oy = -trackCy * scale;

  // Draw track path
  ctx.strokeStyle = '#888';
  ctx.lineWidth = Math.max(2, TILE * scale * 0.8);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < centerLine.length; i++) {
    const px = centerLine[i].x * scale + ox;
    const py = centerLine[i].y * scale + oy;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // Start/finish line marker
  const startTile = track.tiles.find(t => t.type === 'start');
  if (startTile) {
    const sfx = (startTile.gx + 0.5) * TILE * scale + ox;
    const sfy = (startTile.gy + 0.5) * TILE * scale + oy;
    // Draw a small checkered line perpendicular to track
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sfx, sfy, 5, 0, Math.PI * 2);
    ctx.fill();
    // Cross mark
    const fwd = DIR_VEC[startTile.dir];
    const perpX = -fwd.y * TILE * 0.4 * scale;
    const perpY = fwd.x * TILE * 0.4 * scale;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sfx - perpX, sfy - perpY);
    ctx.lineTo(sfx + perpX, sfy + perpY);
    ctx.stroke();
  }

  // Draw car position dot
  const dotX = carX * scale + ox;
  const dotY = carY * scale + oy;
  ctx.fillStyle = '#e63030';
  ctx.beginPath();
  ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Speed above minimap (reset transform first)
  ctx.restore();
  ctx.save();
  const kph = Math.round(speed || 0);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${kph} km/h`, mapCx, mapY - 12);
  ctx.restore();
}
