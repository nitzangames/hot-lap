import {
  TILE, CAR_W, CAR_H,
  WALL_THICKNESS, GHOST_ALPHA,
  GAME_W, GAME_H,
} from './constants.js';
import { DIR_VEC } from './track.js';
import { CAR_STYLES, hueToColors, drawStyledCar } from './car-styles.js';

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

export function drawTrack(ctx, track, walls, centerLine, curbs, brakeMarkers, trackIndex) {
  const T = TILE;

  // 1. Asphalt fill — draw as thick stroke along center line
  if (centerLine && centerLine.length > 1) {
    ctx.save();
    ctx.strokeStyle = '#3d3d3d';
    ctx.lineWidth = T;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(centerLine[0].x, centerLine[0].y);
    for (let i = 1; i < centerLine.length; i++) {
      ctx.lineTo(centerLine[i].x, centerLine[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // 2. Red/white curbs on curve insides
  if (curbs) {
    const curbSegments = 16; // number of alternating red/white segments per curb
    for (const curb of curbs) {
      const { cx, cy, innerR, outerR, startAngle, sweep } = curb;
      const segSweep = sweep / curbSegments;
      for (let i = 0; i < curbSegments; i++) {
        const a0 = startAngle + segSweep * i;
        const a1 = startAngle + segSweep * (i + 1);
        ctx.fillStyle = i % 2 === 0 ? '#cc2222' : '#eeeeee';
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, a0, a1, sweep < 0);
        ctx.arc(cx, cy, innerR, a1, a0, sweep > 0);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // 3. Start / finish checkered pattern
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

  // 3. Grid tile — F1-style grid boxes (4 positions, staggered)
  for (const tile of track.tiles) {
    if (tile.type !== 'grid') continue;
    const { gx, gy, dir } = tile;
    const fwd = DIR_VEC[dir];

    ctx.save();
    ctx.translate((gx + 0.5) * T, (gy + 0.5) * T);
    ctx.rotate(Math.atan2(fwd.y, fwd.x) - Math.PI / 2);

    // Grid box dimensions
    const bw = CAR_W * 1.3;
    const bh = CAR_H * 0.9;
    const cornerLen = bw * 0.3;

    // 4 grid positions: staggered left-right
    // P1: top-left, P2: top-right (slightly behind)
    // P3: below P1, P4: below P2
    const leftX = -T * 0.2;
    const rightX = T * 0.2;
    const row1Y = -T * 0.25;
    const row2Y = T * 0.15;
    const stagger = bh * 0.3; // P2/P4 are slightly behind P1/P3

    const positions = [
      { x: leftX, y: row1Y },             // P1
      { x: rightX, y: row1Y + stagger },   // P2
      { x: leftX, y: row2Y },             // P3
      { x: rightX, y: row2Y + stagger },   // P4
    ];

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const pos of positions) {
      // U-shape in front of car: bar at bottom, arms go up toward start line
      const barY = pos.y + bh * 0.7;
      ctx.beginPath();
      ctx.moveTo(pos.x - bw/2, barY - cornerLen); // left arm up
      ctx.lineTo(pos.x - bw/2, barY);              // left arm down to bar
      ctx.lineTo(pos.x + bw/2, barY);              // bar across
      ctx.lineTo(pos.x + bw/2, barY - cornerLen);  // right arm up
      ctx.stroke();
    }

    ctx.restore();
  }

  // 5. Wall paths — concrete barrier look
  if (walls) {
    for (const side of [walls.left, walls.right]) {
      if (!side || side.length < 2) continue;

      // Dark shadow (offset outward slightly)
      ctx.save();
      ctx.strokeStyle = '#444';
      ctx.lineWidth = WALL_THICKNESS + 4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(side[0].x, side[0].y);
      for (let i = 1; i < side.length; i++) {
        ctx.lineTo(side[i].x, side[i].y);
      }
      ctx.stroke();
      ctx.restore();

      // Main wall
      ctx.save();
      ctx.strokeStyle = '#999';
      ctx.lineWidth = WALL_THICKNESS;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(side[0].x, side[0].y);
      for (let i = 1; i < side.length; i++) {
        ctx.lineTo(side[i].x, side[i].y);
      }
      ctx.stroke();
      ctx.restore();

      // Highlight edge (inner)
      ctx.save();
      ctx.strokeStyle = '#bbb';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(side[0].x, side[0].y);
      for (let i = 1; i < side.length; i++) {
        ctx.lineTo(side[i].x, side[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // 6. Brake marker tiles (3 white lines perpendicular to track)
  if (brakeMarkers) {
    for (const m of brakeMarkers) {
      const tx = m.gx * T;
      const ty = m.gy * T;
      const fwd = DIR_VEC[m.dir];

      // Perpendicular to track: the track is adjacent, so shift lines toward it
      const perp = m.side === 'left' ? { x: fwd.y, y: -fwd.x } : { x: -fwd.y, y: fwd.x };
      const shiftX = perp.x * T * 0.3;
      const shiftY = perp.y * T * 0.3;

      ctx.save();
      ctx.translate(tx + T / 2 + shiftX, ty + T / 2 + shiftY);
      ctx.rotate(Math.atan2(fwd.y, fwd.x) - Math.PI / 2);

      // 3 short white lines perpendicular to track
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 6;
      ctx.lineCap = 'butt';
      const lineSpacing = T * 0.2;
      const lineW = T * 0.25;
      for (let s = -1; s <= 1; s++) {
        const y = s * lineSpacing;
        ctx.beginPath();
        ctx.moveTo(-lineW / 2, y);
        ctx.lineTo(lineW / 2, y);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // In-world track label ("Track NN") painted on the tile after start/finish.
  // Tile 0 is grid, tile 1 is start/finish; tile 2 is the first tile of the lap.
  if (typeof trackIndex === 'number' && track.tiles.length >= 3) {
    const labelTile = track.tiles[2];
    const wcx = (labelTile.gx + 0.5) * TILE;
    const wcy = (labelTile.gy + 0.5) * TILE;
    const fwd = DIR_VEC[labelTile.dir];
    // Rotation such that canvas -y (text letter-up direction) points along
    // the fwd vector. Derivation: canvas -y after ctx.rotate(θ) becomes
    // (sin θ, -cos θ) in world space; set equal to fwd → θ = atan2(fwd.x, -fwd.y).
    const textAngle = Math.atan2(fwd.x, -fwd.y);

    ctx.save();
    ctx.translate(wcx, wcy);
    ctx.rotate(textAngle);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = 'bold 90px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelStr = 'TRACK ' + String(trackIndex + 1).padStart(2, '0');
    ctx.fillText(labelStr, 0, 0);
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

  // (seed display moved to main.js — always visible)

  ctx.restore();
}

// ── Overlay screens ───────────────────────────────────────────────────────────

let titleAnimTime = 0;
export function drawTitleScreen(ctx, dt, styleIndex, hue) {
  titleAnimTime += (dt || 0.016);
  const cx = GAME_W / 2;
  ctx.save();
  // Opaque grass-green background — no race visible behind
  ctx.fillStyle = '#4a7a2e';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // ── Animated "speed lines" on the grass ──
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = '#3d6524';
  ctx.lineWidth = 3;
  for (let i = 0; i < 24; i++) {
    const seed2 = i * 137.5;
    const x = (Math.sin(seed2) * 0.5 + 0.5) * GAME_W;
    const baseY = ((seed2 * 0.73 + titleAnimTime * 520) % (GAME_H + 200)) - 100;
    const lineLen = 70 + Math.sin(seed2 * 2.1) * 50;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY + lineLen);
    ctx.stroke();
  }
  ctx.restore();

  // ── Horizontal track strip across the lower third ──
  // Static asphalt + alternating red/white curbs on the top and bottom edges,
  // with a dashed white center line. The animated cars drive along this strip.
  const trackCenterY = GAME_H * 0.78;
  const trackH = 300;
  const trackTop = trackCenterY - trackH / 2;
  // Asphalt
  ctx.fillStyle = '#3d3d3d';
  ctx.fillRect(0, trackTop, GAME_W, trackH);
  // Curbs
  const curbH = 28;
  const curbSegW = 60;
  const segCount = Math.ceil(GAME_W / curbSegW) + 1;
  for (let i = 0; i < segCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#cc2222' : '#eeeeee';
    ctx.fillRect(i * curbSegW, trackTop, curbSegW, curbH);
    ctx.fillRect(i * curbSegW, trackTop + trackH - curbH, curbSegW, curbH);
  }
  // Dashed center line
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 4;
  ctx.setLineDash([34, 26]);
  ctx.beginPath();
  ctx.moveTo(0, trackCenterY);
  ctx.lineTo(GAME_W, trackCenterY);
  ctx.stroke();
  ctx.restore();

  // ── Animated cars zooming across the track ──
  // Both cars go the same direction (left → right). Two different speeds
  // and phase offsets so they don't stack.
  const sIdx = typeof styleIndex === 'number' ? styleIndex : 0;
  const pHue = typeof hue === 'number' ? hue : 0;
  const animCars = [
    { y: trackCenterY - 60, period: 2.6, phase: 0.0,  hue: pHue,                   scale: 0.95 },
    { y: trackCenterY + 60, period: 3.8, phase: 0.55, hue: (pHue + 210) % 360,     scale: 0.85 },
  ];
  for (const c of animCars) {
    const t = ((titleAnimTime / c.period) + c.phase) % 1;
    const span = GAME_W + 400;
    const x = -200 + t * span;

    // Motion streaks trailing the car
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineCap = 'round';
    for (let s = 0; s < 6; s++) {
      const sx = x - (50 + s * 32);
      const sy = c.y + (((s * 17 + titleAnimTime * 40) % 24) - 12);
      ctx.globalAlpha = 0.26 * (1 - s / 6);
      ctx.lineWidth = 3 - s * 0.35;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - 60, sy);
      ctx.stroke();
    }
    ctx.restore();

    // Car sprite — rotated π/2 so the nose faces +x (right)
    ctx.save();
    ctx.translate(x, c.y);
    ctx.scale(c.scale, c.scale);
    drawStyledCar(ctx, 0, 0, Math.PI / 2, sIdx, c.hue, 0.95);
    ctx.restore();
  }

  // ── Title text with subtle y-bob ──
  const titleBob = Math.sin(titleAnimTime * 1.4) * 6;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 110px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HOT LAP', cx, GAME_H * 0.26 + titleBob);

  // Subtitle
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '34px sans-serif';
  ctx.fillText('CHASE THE GHOST', cx, GAME_H * 0.26 + titleBob + 78);

  // ── CHOOSE CAR button (neutral dark grey with white outline) ──
  const carBtnW = 560;
  const carBtnH = 130;
  const carBtnY = GAME_H * 0.44;
  ctx.fillStyle = '#1f1f1f';
  ctx.beginPath();
  ctx.roundRect(cx - carBtnW / 2, carBtnY, carBtnW, carBtnH, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 58px sans-serif';
  ctx.fillText('CHOOSE CAR', cx, carBtnY + carBtnH / 2);

  // Version
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '24px sans-serif';
  ctx.fillText('v0.48', cx, GAME_H * 0.97);

  ctx.restore();

  return {
    carBox: { x: cx - carBtnW / 2, y: carBtnY, w: carBtnW, h: carBtnH },
  };
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

/**
 * Draw one row of the finish-screen leaderboard panel.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{rank:number, metadata:object, value:number, isMe?:boolean}} entry
 * @param {{x:number, y:number, w:number, h:number}} rect
 * @param {{highlighted:boolean, isTopRank:boolean}} opts
 */
function drawLeaderboardRow(ctx, entry, rect, opts) {
  const { x, y, w, h } = rect;
  const highlighted = !!(opts && opts.highlighted);
  const isTopRank = !!(opts && opts.isTopRank);

  if (highlighted) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill();
  }

  // Rank number (left column)
  ctx.fillStyle = highlighted ? '#fff' : '#aaa';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(entry.rank).padStart(2, '0'), x + 70, y + h / 2);

  // Tiny car sprite (40x40 visual block, rendered at scale)
  const carX = x + 130;
  const carY = y + h / 2;
  const meta = entry.metadata || {};
  const styleIndex = typeof meta.styleIndex === 'number' ? meta.styleIndex : 0;
  const hue = typeof meta.hue === 'number' ? meta.hue : 0;
  ctx.save();
  ctx.translate(carX, carY);
  ctx.scale(0.32, 0.32);
  drawStyledCar(ctx, 0, 0, 0, styleIndex, hue, 1);
  ctx.restore();

  // Name (middle)
  const name = (meta.name || 'player').toString().substring(0, 14);
  ctx.fillStyle = highlighted ? '#fff' : '#ccc';
  ctx.font = '30px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x + 170, y + h / 2);

  // Time (right)
  ctx.fillStyle = isTopRank ? '#f0c040' : (highlighted ? '#fff' : '#ccc');
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatTime((entry.value || 0) / 1000), x + w - 20, y + h / 2);
}

/**
 * Draw the finish screen with a leaderboard panel.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} raceTime - in seconds
 * @param {number|null} delta - in seconds, or null
 * @param {boolean} isNewRecord
 * @param {{
 *   panelData: {top:Array, nearby:Array, total:number, hasAttachment:boolean}|null,
 *   panelLoading: boolean,
 *   panelError: boolean,
 *   signedIn: boolean,
 *   myPreviewRank: {rank:number, total:number}|null,
 *   currentTrackIndex: number,
 * }} lb
 */
export function drawFinishScreen(ctx, raceTime, delta, isNewRecord, lb) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.80)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  const cx = GAME_W / 2;

  // Banner
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (isNewRecord) {
    ctx.fillStyle = '#f0c040';
    ctx.font = 'bold 70px sans-serif';
    ctx.fillText('NEW RECORD!', cx, 130);
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 70px sans-serif';
    ctx.fillText('FINISH', cx, 130);
  }

  // Big time
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 90px monospace';
  ctx.fillText(formatTime(raceTime), cx, 260);

  // Delta pill
  if (delta !== null && delta !== undefined) {
    const sign = delta < 0 ? '-' : '+';
    ctx.fillStyle = delta < 0 ? '#4cff72' : '#ff5555';
    ctx.font = 'bold 32px monospace';
    ctx.fillText(sign + formatTime(Math.abs(delta)), cx, 350);
  }

  // ── Leaderboard panel ─────────────────────────────────────────────────────
  const panelX = 60, panelY = 400, panelW = GAME_W - 120, panelH = 1000;
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 2; ctx.stroke();

  const panelOpts = lb || { panelData: null, panelLoading: true, panelError: false, signedIn: false, myPreviewRank: null, currentTrackIndex: 0 };

  if (panelOpts.panelLoading) {
    // Loading state
    ctx.fillStyle = '#888';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LOADING LEADERBOARD…', panelX + panelW / 2, panelY + panelH / 2);
  } else if (panelOpts.panelError || !panelOpts.panelData) {
    // Error state
    ctx.fillStyle = '#666';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LEADERBOARD UNAVAILABLE', panelX + panelW / 2, panelY + panelH / 2);
  } else {
    // Populated state
    const data = panelOpts.panelData;

    // Header row: "TRACK NN LEADERBOARD" (left) + "RANK X/Y" (right, signed-in only)
    const headerY = panelY + 40;
    ctx.fillStyle = '#888';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const trackLabel = 'TRACK ' + String(panelOpts.currentTrackIndex + 1).padStart(2, '0') + ' LEADERBOARD';
    ctx.fillText(trackLabel, panelX + 30, headerY);

    // Debug diagnostics — rendered on screen for mobile where dev tools aren't available
    if (panelOpts.diagnostics) {
      const d = panelOpts.diagnostics;
      ctx.fillStyle = '#f0c040';
      ctx.font = '18px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('sdk=' + d.hasSdk + ' sign=' + d.signedIn + ' slug=' + d.slugMatch, panelX + 30, headerY + 30);
      ctx.fillText('top=' + data.top.length + ' nearby=' + data.nearby.length + ' total=' + data.total, panelX + 30, headerY + 52);
      // Show raw HTTP response from direct fetch (bypasses PlaySDK error swallowing)
      const rawDbg = data._rawDebug || '';
      ctx.font = '14px monospace';
      ctx.fillStyle = '#ff8888';
      // Wrap long text across two lines
      ctx.fillText(rawDbg.substring(0, 50), panelX + 30, headerY + 74);
      ctx.fillText(rawDbg.substring(50, 100), panelX + 30, headerY + 90);
      ctx.fillText(rawDbg.substring(100, 150), panelX + 30, headerY + 106);
    }

    if (panelOpts.signedIn && data.nearby && data.nearby.length > 0) {
      const myEntry = data.nearby.find(e => e.isMe);
      if (myEntry) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('RANK ' + myEntry.rank + ' / ' + data.total, panelX + panelW - 30, headerY);
      }
    } else if (panelOpts.myPreviewRank) {
      ctx.fillStyle = '#888';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('#' + panelOpts.myPreviewRank.rank + ' / ' + panelOpts.myPreviewRank.total, panelX + panelW - 30, headerY);
    }

    // Top N entries
    const rowH = 80;
    const topTop = panelY + 100;
    for (let i = 0; i < Math.min(data.top.length, 3); i++) {
      const entry = data.top[i];
      drawLeaderboardRow(
        ctx,
        entry,
        { x: panelX + 20, y: topTop + i * rowH, w: panelW - 40, h: rowH - 8 },
        { highlighted: !!entry.isMe, isTopRank: entry.rank === 1 }
      );
    }

    // Dashed divider
    const dividerY = topTop + 3 * rowH + 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(panelX + 40, dividerY);
    ctx.lineTo(panelX + panelW - 40, dividerY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Nearby / call-out
    const nearbyTop = dividerY + 30;
    if (panelOpts.signedIn) {
      // Signed-in: nearby rows from getLeaderboardAroundMe
      // Filter out any entries that overlap with the top 3 already shown
      const topIds = new Set(data.top.slice(0, 3).map(e => e.user_id));
      const filteredNearby = (data.nearby || []).filter(e => !topIds.has(e.user_id));
      for (let i = 0; i < Math.min(filteredNearby.length, 3); i++) {
        const entry = filteredNearby[i];
        drawLeaderboardRow(
          ctx,
          entry,
          { x: panelX + 20, y: nearbyTop + i * rowH, w: panelW - 40, h: rowH - 8 },
          { highlighted: !!entry.isMe, isTopRank: entry.rank === 1 }
        );
      }
    } else {
      // Signed-out call-out card
      const cardH = 160;
      ctx.fillStyle = 'rgba(240,192,64,0.08)';
      ctx.beginPath(); ctx.roundRect(panelX + 20, nearbyTop, panelW - 40, cardH, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(240,192,64,0.35)';
      ctx.lineWidth = 2; ctx.stroke();

      ctx.fillStyle = '#f0c040';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (panelOpts.myPreviewRank) {
        ctx.fillText('Your time would rank #' + panelOpts.myPreviewRank.rank + ' / ' + panelOpts.myPreviewRank.total, panelX + panelW / 2, nearbyTop + 50);
      } else {
        ctx.fillText('Leaderboard active', panelX + panelW / 2, nearbyTop + 50);
      }
      ctx.fillStyle = '#ccc';
      ctx.font = '22px sans-serif';
      ctx.fillText('Sign in on play.nitzan.games to save your ghost', panelX + panelW / 2, nearbyTop + 100);
      ctx.fillText('and compete', panelX + panelW / 2, nearbyTop + 128);
    }

    // Footer — top ghost availability
    const footerY = panelY + panelH - 30;
    if (data.hasAttachment) {
      ctx.fillStyle = '#666';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TOP GHOST AVAILABLE', panelX + panelW / 2, footerY);
    }
  }

  // ── Buttons ───────────────────────────────────────────────────────────────
  const retryY = 1440;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.roundRect(cx - 300, retryY, 600, 110, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 50px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RETRY', cx, retryY + 55);

  const nextY = 1580;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.roundRect(cx - 300, nextY, 600, 95, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ccc';
  ctx.font = '42px sans-serif';
  ctx.fillText('NEXT TRACK', cx, nextY + 48);

  const menuY = 1710;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.roundRect(cx - 300, menuY, 600, 85, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#888';
  ctx.font = '36px sans-serif';
  ctx.fillText('TRACKS', cx, menuY + 43);

  ctx.restore();
  return {
    retryBox: { x: cx - 300, y: retryY, w: 600, h: 110 },
    nextBox: { x: cx - 300, y: nextY, w: 600, h: 95 },
    menuBox: { x: cx - 300, y: menuY, w: 600, h: 85 },
  };
}

export function drawCrashScreen(ctx) {
  const cx = GAME_W / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(180,0,0,0.55)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 130px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CRASH!', cx, GAME_H * 0.35);

  // RETRY button
  const retryY = GAME_H * 0.52;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath(); ctx.roundRect(cx - 200, retryY, 400, 80, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('RETRY', cx, retryY + 42);

  // MAIN MENU button
  const menuY = GAME_H * 0.60;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.roundRect(cx - 200, menuY, 400, 70, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#ddd';
  ctx.font = '36px sans-serif';
  ctx.fillText('MAIN MENU', cx, menuY + 37);

  ctx.restore();
  return {
    retryBox: { x: cx - 200, y: retryY, w: 400, h: 80 },
    menuBox: { x: cx - 200, y: menuY, w: 400, h: 70 },
  };
}

// ── Steering wheel ───────────────────────────────────────────────────────────

/**
 * Draw a steering wheel at the drag origin position.
 * @param {number} screenX - game-space X of drag origin
 * @param {number} screenY - game-space Y of drag origin
 * @param {number} steering - -1 to +1
 */
export function drawSteeringWheel(ctx, screenX, screenY, steering, speed) {
  const rotation = steering * Math.PI * 0.75;

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.translate(screenX, screenY);
  ctx.rotate(rotation);

  // Central carbon body (stadium) dimensions; wings extend outward beyond this
  const bw = 210, bh = 140;

  // ── Red paddle shifters peeking out behind the top of each handle ──
  ctx.fillStyle = '#c1272d';
  ctx.beginPath();
  ctx.moveTo(-128, -38);
  ctx.quadraticCurveTo(-110, -62, -78, -66);
  ctx.lineTo(-65, -54);
  ctx.quadraticCurveTo(-102, -48, -120, -28);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(128, -38);
  ctx.quadraticCurveTo(110, -62, 78, -66);
  ctx.lineTo(65, -54);
  ctx.quadraticCurveTo(102, -48, 120, -28);
  ctx.closePath();
  ctx.fill();

  // ── Central carbon body ──
  ctx.fillStyle = '#0d0d0d';
  ctx.beginPath();
  ctx.roundRect(-bw/2, -bh/2, bw, bh, 18);
  ctx.fill();

  // Carbon weave texture — sparse diagonals clipped to the body
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-bw/2, -bh/2, bw, bh, 18);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = -bw; i < bw; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, -bh/2);
    ctx.lineTo(i + bh, bh/2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i, bh/2);
    ctx.lineTo(i + bh, -bh/2);
    ctx.stroke();
  }
  ctx.restore();

  // ── Curved wing handles (thick stroked C-shapes) ──
  ctx.lineCap = 'round';
  // Left handle
  ctx.strokeStyle = '#0a0a0a';
  ctx.lineWidth = 32;
  ctx.beginPath();
  ctx.moveTo(-100, -38);
  ctx.quadraticCurveTo(-150, -38, -143, 18);
  ctx.quadraticCurveTo(-133, 62, -97, 56);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(-100, -38);
  ctx.quadraticCurveTo(-150, -38, -143, 18);
  ctx.quadraticCurveTo(-133, 62, -97, 56);
  ctx.stroke();
  // Right handle (mirrored)
  ctx.strokeStyle = '#0a0a0a';
  ctx.lineWidth = 32;
  ctx.beginPath();
  ctx.moveTo(100, -38);
  ctx.quadraticCurveTo(150, -38, 143, 18);
  ctx.quadraticCurveTo(133, 62, 97, 56);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(100, -38);
  ctx.quadraticCurveTo(150, -38, 143, 18);
  ctx.quadraticCurveTo(133, 62, 97, 56);
  ctx.stroke();

  // ── Multicolored rev LED strip across the top of the body ──
  // Same center-out "available speed" logic as before (dims as you turn),
  // but now with a rainbow palette — red at the center (low margin), cool
  // hues toward the outside (high margin).
  const ledY = -bh * 0.36;
  const turnFactor = 1 - Math.abs(steering);
  const litCount = Math.round(turnFactor * 11);  // 0-11 LEDs
  const ledPalette = ['#ff2020', '#ff6020', '#ffb030', '#ffe040', '#50ff40', '#30d0f0'];
  for (let i = -5; i <= 5; i++) {
    const idx = Math.abs(i);  // 0-5, center=0
    const isLit = idx < Math.ceil(litCount / 2);
    if (isLit) {
      ctx.fillStyle = ledPalette[idx];
    } else {
      ctx.fillStyle = '#1a1a1a';
    }
    ctx.beginPath();
    ctx.arc(i * 13, ledY, 3.2, 0, Math.PI * 2);
    ctx.fill();
    if (isLit) {
      // Soft halo
      ctx.globalAlpha = 0.25 * 0.9;  // 0.9 = parent wheel alpha
      ctx.beginPath();
      ctx.arc(i * 13, ledY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9;
    }
  }

  // ── Central LCD ──
  const sw = 126, sh = 58;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.roundRect(-sw/2, -sh/2 + 4, sw, sh, 5);
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Speed on screen
  ctx.fillStyle = '#0af';
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const kph = Math.round(speed || 0);
  ctx.fillText(String(kph), 0, 0);
  ctx.fillStyle = '#888';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('km/h', 0, 22);

  // ── Top marker (red notch) for orientation ──
  ctx.fillStyle = '#e63030';
  ctx.fillRect(-3, -bh/2 - 4, 7, 7);

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

// ── Car selection screen ─────────────────────────────────────────────────────

/**
 * Draw the car selection screen.
 * @param {number} selectedStyle - index of currently selected style (0-4)
 * @param {number} hue - current hue (0-360)
 * @returns {{ styleBoxes: {x,y,w,h,index}[], sliderBox: {x,y,w,h} }} hit areas for input
 */
export function drawCarSelect(ctx, selectedStyle, hue) {
  const cx = GAME_W / 2;

  // Dark overlay
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CHOOSE YOUR CAR', cx, 80);

  const { bodyColor, wingColor } = hueToColors(hue);

  // --- 5 car options: 3 on top row, 2 on bottom row ---
  // Square boxes, cars scaled to fit inside with padding
  const boxSize = Math.floor((GAME_W - 80) / 3); // 3 per row with margins
  const carScale = boxSize / (CAR_H * 1.4); // scale so car height fits with padding
  const gap = 20;
  const gridLeft = (GAME_W - boxSize * 3 - gap * 2) / 2;
  const row1Top = 140;
  const row2Top = row1Top + boxSize + gap;
  const styleBoxes = [];

  const positions = [
    { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 },
    { col: 0.5, row: 1 }, { col: 1.5, row: 1 },
  ];

  for (let i = 0; i < CAR_STYLES.length; i++) {
    const pos = positions[i];
    const bx = gridLeft + pos.col * (boxSize + gap);
    const by = pos.row === 0 ? row1Top : row2Top;
    const boxCx = bx + boxSize / 2;
    const boxCy = by + boxSize / 2;

    // Selection box (square)
    if (i === selectedStyle) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(bx, by, boxSize, boxSize, 10); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(bx, by, boxSize, boxSize, 10); ctx.stroke();
    }

    // Draw car centered in box, offset up to leave room for label
    ctx.save();
    ctx.translate(boxCx, boxCy - 16);
    ctx.scale(carScale, carScale);
    CAR_STYLES[i].draw(ctx, bodyColor, wingColor);
    ctx.restore();

    // Label below car
    ctx.fillStyle = i === selectedStyle ? '#fff' : '#777';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(CAR_STYLES[i].name, boxCx, by + boxSize - 6);

    styleBoxes.push({ x: bx, y: by, w: boxSize, h: boxSize, index: i });
  }

  // --- Hue slider ---
  const sliderY = row2Top + boxSize + 50;
  const sliderW = GAME_W * 0.75;
  const sliderH = 50;
  const sliderX = cx - sliderW / 2;

  ctx.fillStyle = '#aaa';
  ctx.font = '30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('COLOR', cx, sliderY - 12);

  // Rainbow gradient
  const grad = ctx.createLinearGradient(sliderX, 0, sliderX + sliderW, 0);
  for (let i = 0; i <= 6; i++) {
    grad.addColorStop(i / 6, `hsl(${(i / 6) * 360}, 80%, 55%)`);
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(sliderX, sliderY, sliderW, sliderH, 10);
  ctx.fill();

  // Thumb
  const thumbX = sliderX + (hue / 360) * sliderW;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(thumbX, sliderY + sliderH / 2, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(thumbX, sliderY + sliderH / 2, 14, 0, Math.PI * 2);
  ctx.fill();

  // --- TRACK SELECTION button ---
  const goY = sliderY + sliderH + 80;
  const goW = 520;
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.roundRect(cx - goW / 2, goY, goW, 90, 18);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TRACK SELECTION', cx, goY + 45);

  const sliderBox = { x: sliderX, y: sliderY - 10, w: sliderW, h: sliderH + 20 };
  const goBox = { x: cx - goW / 2, y: goY, w: goW, h: 90 };

  return { styleBoxes, sliderBox, goBox };
}

// ── Pause button + pause menu ────────────────────────────────────────────────

/** Draw a pause button in the top-right corner during racing. Returns hit area. */
export function drawPauseButton(ctx) {
  const size = 90;
  const margin = 24;
  const x = GAME_W - size - margin;
  const y = margin;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 14);
  ctx.fill();

  // Two vertical bars
  ctx.fillStyle = '#fff';
  const barW = 12;
  const barH = 44;
  const gap = 12;
  const cx = x + size / 2;
  const cy = y + size / 2;
  ctx.fillRect(cx - gap / 2 - barW, cy - barH / 2, barW, barH);
  ctx.fillRect(cx + gap / 2, cy - barH / 2, barW, barH);
  ctx.restore();

  return { x, y, w: size, h: size };
}

/** Draw the pause menu overlay. Returns hit areas for all interactive elements. */
export function drawPauseMenu(ctx, sfxOn, hapticsOn, ghostToggles, topGhostState) {
  // Dim background
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Panel
  const panelW = 760;
  const panelH = 1000;
  const panelX = (GAME_W - panelW) / 2;
  const panelY = (GAME_H - panelH) / 2;
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 32);
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 88px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('PAUSED', GAME_W / 2, panelY + 60);

  // Toggle row helper
  function drawToggle(label, on, y) {
    ctx.fillStyle = '#fff';
    ctx.font = '46px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, panelX + 80, y);

    // Toggle pill
    const tw = 160, th = 76;
    const tx = panelX + panelW - tw - 80;
    const ty = y - th / 2;
    ctx.fillStyle = on ? '#3aa848' : '#444';
    ctx.beginPath();
    ctx.roundRect(tx, ty, tw, th, th / 2);
    ctx.fill();
    // Knob
    const knobR = th / 2 - 8;
    const knobX = on ? tx + tw - knobR - 8 : tx + knobR + 8;
    const knobY = ty + th / 2;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(knobX, knobY, knobR, 0, Math.PI * 2);
    ctx.fill();

    return { x: tx, y: ty, w: tw, h: th };
  }

  const sfxToggle = drawToggle('SOUND', sfxOn, panelY + 200);
  const hapticsToggle = drawToggle('HAPTICS', hapticsOn, panelY + 290);

  // Ghost toggles
  const gt = ghostToggles || { your: true, top: false };
  const yourGhostToggle = drawToggle('YOUR GHOST', gt.your, panelY + 380);

  // Top ghost toggle is disabled when state is 'none' or 'loading'
  const topOn = gt.top && topGhostState === 'ready';
  const topLabel = topGhostState === 'loading' ? 'TOP GHOST (loading…)'
                 : topGhostState === 'none'    ? 'TOP GHOST (none)'
                 : 'TOP GHOST';
  const topDisabled = topGhostState !== 'ready';
  const topGhostToggle = drawToggle(topLabel, topOn, panelY + 470);
  if (topDisabled) {
    // Overlay a dim mask to indicate disabled
    ctx.fillStyle = 'rgba(26,26,26,0.5)';
    ctx.fillRect(topGhostToggle.x - 300, topGhostToggle.y - 20, topGhostToggle.w + 320, topGhostToggle.h + 40);
  }

  // Buttons
  function drawBtn(label, color, y) {
    const bw = panelW - 160;
    const bx = panelX + 80;
    const bh = 100;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(bx, y, bw, bh, 18);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, GAME_W / 2, y + bh / 2);
    return { x: bx, y, w: bw, h: bh };
  }

  const resumeBtn = drawBtn('RESUME', '#2e8a3a', panelY + 600);
  const retryBtn = drawBtn('RETRY', '#444', panelY + 730);
  const menuBtn = drawBtn('MAIN MENU', '#444', panelY + 860);

  ctx.restore();

  return {
    sfxToggle, hapticsToggle,
    yourGhostToggle, topGhostToggle, topGhostDisabled: topDisabled,
    resumeBtn, retryBtn, menuBtn,
  };
}

// ── Track selection screen ──────────────────────────────────────────────────

/**
 * Draw a small minimap of a track's center line into a rectangular region.
 * Scales and centers the track to fill the rect with padding.
 */
function drawMinimapIntoRect(ctx, centerLine, startAngle, x, y, w, h) {
  // Compute bounds
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
  // Account for rotation by using the larger dimension both ways
  const maxDim = Math.max(trackW, trackH);
  const inset = 16;
  const scale = Math.min((w - inset * 2) / maxDim, (h - inset * 2) / maxDim);
  const trackCx = (minX + trackW / 2);
  const trackCy = (minY + trackH / 2);

  ctx.save();
  // Center of the destination rect
  ctx.translate(x + w / 2, y + h / 2);
  // Rotate so start direction points up
  ctx.rotate(-(startAngle || 0));

  const ox = -trackCx * scale;
  const oy = -trackCy * scale;

  // Track path stroke
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
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw the track selection screen.
 * @param {Array<{track, centerLine, startAngle}>} trackPaths - cached paths (length 20)
 * @param {number} currentIndex - currently selected/last-played track index
 * @param {Array<number|null>} bestTimes - best time in ms per track, or null
 * @returns {{ tileBoxes: {x,y,w,h,index}[], backBox: {x,y,w,h} }} hit areas
 */
export function drawTrackSelect(ctx, trackPaths, currentIndex, bestTimes, previewRanks) {
  const cx = GAME_W / 2;

  // Dark overlay
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Back button (top-left)
  const backX = 30, backY = 30, backW = 140, backH = 70;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.roundRect(backX, backY, backW, backH, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('← BACK', backX + backW / 2, backY + backH / 2);

  // Title
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CHOOSE TRACK', cx, 140);

  // Grid: 4 cols x 5 rows
  const cols = 4;
  const rows = 5;
  const gap = 20;
  const tileSize = 230;
  const gridW = cols * tileSize + (cols - 1) * gap;
  const gridLeft = (GAME_W - gridW) / 2;
  const gridTop = 220;

  const tileBoxes = [];

  for (let i = 0; i < trackPaths.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const tx = gridLeft + col * (tileSize + gap);
    const ty = gridTop + row * (tileSize + gap);

    // Tile background
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath(); ctx.roundRect(tx, ty, tileSize, tileSize, 12); ctx.fill();

    // Border (thicker for current)
    if (i === currentIndex) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
    }
    ctx.beginPath(); ctx.roundRect(tx, ty, tileSize, tileSize, 12); ctx.stroke();

    // Minimap (top ~60% of tile to leave room for time + rank)
    const mapH = Math.floor(tileSize * 0.60);
    const path = trackPaths[i];
    drawMinimapIntoRect(ctx, path.centerLine, path.startAngle, tx, ty, tileSize, mapH);

    // Number label (top-left corner)
    const label = String(i + 1).padStart(2, '0');
    ctx.fillStyle = i === currentIndex ? '#fff' : '#ccc';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, tx + 12, ty + 10);

    // Best time (above rank line)
    const bt = bestTimes && bestTimes[i];
    const timeText = bt !== null && bt !== undefined
      ? formatTime(bt / 1000)
      : '--:--.--';
    ctx.fillStyle = bt != null ? '#f0c040' : '#666';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(timeText, tx + tileSize / 2, ty + tileSize - 38);

    // Rank preview line (only when player has a PB AND preview succeeded AND
    // the board has at least one entry)
    const pr = previewRanks && previewRanks[i];
    if (bt != null && pr && pr.total > 0) {
      ctx.fillStyle = pr.rank === 1 ? '#f0c040' : '#888';
      ctx.font = 'bold 16px sans-serif';
      ctx.textBaseline = 'bottom';
      ctx.fillText('#' + pr.rank + ' / ' + pr.total, tx + tileSize / 2, ty + tileSize - 14);
    }

    tileBoxes.push({ x: tx, y: ty, w: tileSize, h: tileSize, index: i });
  }

  return {
    tileBoxes,
    backBox: { x: backX, y: backY, w: backW, h: backH },
  };
}
