import { CAR_W, CAR_H } from './constants.js';

/**
 * 5 car styles. Each is a function(ctx, bodyColor, wingColor) that draws
 * the car centered at origin, nose pointing -Y.
 * bodyColor is the main color, wingColor is derived from it.
 */

const W = CAR_W;
const H = CAR_H;

function darken(hex, amt) {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amt);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amt);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amt);
  return `rgb(${r},${g},${b})`;
}

// F. Wide Wings
function drawStyleF(ctx, color, wing) {
  const w = W, h = H;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(2, 2, w*0.55, h*0.4, 0, 0, Math.PI*2); ctx.fill();
  // Rear tires
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-w*0.5, h*0.08, w*0.17, h*0.24);
  ctx.fillRect(w*0.33, h*0.08, w*0.17, h*0.24);
  ctx.fillRect(-w*0.48, -h*0.3, w*0.14, h*0.18);
  ctx.fillRect(w*0.34, -h*0.3, w*0.14, h*0.18);
  // Rear wing
  ctx.fillStyle = wing;
  ctx.fillRect(-w*0.6, h*0.34, w*1.2, h*0.05);
  ctx.fillRect(-w*0.62, h*0.26, w*0.06, h*0.15);
  ctx.fillRect(w*0.56, h*0.26, w*0.06, h*0.15);
  ctx.fillStyle = darken(wing, 30);
  ctx.fillRect(-w*0.55, h*0.28, w*1.1, h*0.03);
  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -h*0.44); ctx.lineTo(w*0.18, -h*0.2); ctx.lineTo(w*0.24, 0);
  ctx.lineTo(w*0.28, h*0.25); ctx.lineTo(-w*0.28, h*0.25); ctx.lineTo(-w*0.24, 0);
  ctx.lineTo(-w*0.18, -h*0.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.ellipse(0, -h*0.08, w*0.13, h*0.1, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = darken(color, 20);
  ctx.fillRect(-w*0.34, -h*0.02, w*0.12, h*0.2);
  ctx.fillRect(w*0.22, -h*0.02, w*0.12, h*0.2);
  // Front wing
  ctx.fillStyle = wing;
  ctx.fillRect(-w*0.522, -h*0.36, w*1.044, h*0.04);
  ctx.fillRect(-w*0.54, -h*0.4, w*0.06, h*0.1);
  ctx.fillRect(w*0.48, -h*0.4, w*0.06, h*0.1);
  ctx.fillStyle = darken(wing, 30);
  ctx.fillRect(-w*0.468, -h*0.32, w*0.936, h*0.025);
  // Nose
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-w*0.06, -h*0.44); ctx.lineTo(w*0.06, -h*0.44);
  ctx.lineTo(w*0.04, -h*0.48); ctx.lineTo(-w*0.04, -h*0.48);
  ctx.closePath(); ctx.fill();
}

// G. Swept Aero
function drawStyleG(ctx, color, wing) {
  const w = W, h = H;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(2, 2, w*0.5, h*0.4, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-w*0.5, h*0.06, w*0.16, h*0.25);
  ctx.fillRect(w*0.34, h*0.06, w*0.16, h*0.25);
  ctx.fillRect(-w*0.46, -h*0.3, w*0.14, h*0.17);
  ctx.fillRect(w*0.32, -h*0.3, w*0.14, h*0.17);
  // Rear wing
  ctx.fillStyle = wing;
  ctx.beginPath();
  ctx.moveTo(-w*0.55, h*0.38); ctx.lineTo(-w*0.48, h*0.32);
  ctx.lineTo(w*0.48, h*0.32); ctx.lineTo(w*0.55, h*0.38); ctx.closePath(); ctx.fill();
  ctx.fillStyle = darken(wing, -20);
  ctx.beginPath();
  ctx.moveTo(-w*0.5, h*0.30); ctx.lineTo(-w*0.42, h*0.26);
  ctx.lineTo(w*0.42, h*0.26); ctx.lineTo(w*0.5, h*0.30); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.fillRect(-w*0.56, h*0.22, w*0.06, h*0.18);
  ctx.fillRect(w*0.50, h*0.22, w*0.06, h*0.18);
  ctx.fillStyle = '#444';
  ctx.fillRect(-w*0.1, h*0.22, w*0.04, h*0.12);
  ctx.fillRect(w*0.06, h*0.22, w*0.04, h*0.12);
  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -h*0.46); ctx.lineTo(w*0.2, -h*0.18); ctx.lineTo(w*0.26, h*0.05);
  ctx.lineTo(w*0.22, h*0.3); ctx.lineTo(-w*0.22, h*0.3); ctx.lineTo(-w*0.26, h*0.05);
  ctx.lineTo(-w*0.2, -h*0.18); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.fillRect(-w*0.1, -h*0.12, w*0.2, h*0.16);
  ctx.fillStyle = '#222';
  ctx.fillRect(-w*0.05, -h*0.2, w*0.1, h*0.06);
  // Front wing
  ctx.fillStyle = wing;
  ctx.beginPath();
  ctx.moveTo(-w*0.12, -h*0.38); ctx.lineTo(-w*0.468, -h*0.3);
  ctx.lineTo(-w*0.468, -h*0.33); ctx.lineTo(-w*0.12, -h*0.41); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w*0.12, -h*0.38); ctx.lineTo(w*0.468, -h*0.3);
  ctx.lineTo(w*0.468, -h*0.33); ctx.lineTo(w*0.12, -h*0.41); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.fillRect(-w*0.486, -h*0.35, w*0.05, h*0.08);
  ctx.fillRect(w*0.441, -h*0.35, w*0.05, h*0.08);
}

// H. Endplate Beast
function drawStyleH(ctx, color, wing) {
  const w = W, h = H;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(2, 2, w*0.5, h*0.42, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-w*0.52, h*0.04, w*0.2, h*0.28);
  ctx.fillRect(w*0.32, h*0.04, w*0.2, h*0.28);
  ctx.fillRect(-w*0.48, -h*0.32, w*0.16, h*0.2);
  ctx.fillRect(w*0.32, -h*0.32, w*0.16, h*0.2);
  // Rear wing
  ctx.fillStyle = wing;
  ctx.fillRect(-w*0.48, h*0.32, w*0.96, h*0.05);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-w*0.52, h*0.22); ctx.lineTo(-w*0.48, h*0.22);
  ctx.lineTo(-w*0.48, h*0.4); ctx.lineTo(-w*0.56, h*0.4); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w*0.52, h*0.22); ctx.lineTo(w*0.48, h*0.22);
  ctx.lineTo(w*0.48, h*0.4); ctx.lineTo(w*0.56, h*0.4); ctx.closePath(); ctx.fill();
  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-w*0.06, -h*0.46); ctx.lineTo(w*0.06, -h*0.46);
  ctx.lineTo(w*0.22, -h*0.2); ctx.lineTo(w*0.28, h*0.1);
  ctx.lineTo(w*0.24, h*0.32); ctx.lineTo(-w*0.24, h*0.32);
  ctx.lineTo(-w*0.28, h*0.1); ctx.lineTo(-w*0.22, -h*0.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.ellipse(0, -h*0.06, w*0.14, h*0.1, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = darken(color, 20);
  ctx.fillRect(-w*0.36, -h*0.02, w*0.12, h*0.22);
  ctx.fillRect(w*0.24, -h*0.02, w*0.12, h*0.22);
  // Front wing
  ctx.fillStyle = wing;
  ctx.fillRect(-w*0.468, -h*0.35, w*0.936, h*0.04);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-w*0.504, -h*0.4); ctx.lineTo(-w*0.468, -h*0.4);
  ctx.lineTo(-w*0.432, -h*0.28); ctx.lineTo(-w*0.504, -h*0.28); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w*0.504, -h*0.4); ctx.lineTo(w*0.468, -h*0.4);
  ctx.lineTo(w*0.432, -h*0.28); ctx.lineTo(w*0.504, -h*0.28); ctx.closePath(); ctx.fill();
}

// I. Layered Wing
function drawStyleI(ctx, color, wing) {
  const w = W, h = H;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(2, 2, w*0.48, h*0.4, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-w*0.5, h*0.06, w*0.16, h*0.25);
  ctx.fillRect(w*0.34, h*0.06, w*0.16, h*0.25);
  ctx.fillRect(-w*0.46, -h*0.3, w*0.14, h*0.17);
  ctx.fillRect(w*0.32, -h*0.3, w*0.14, h*0.17);
  // Rear wing stacked
  ctx.fillStyle = '#222';
  ctx.fillRect(-w*0.5, h*0.2, w*0.05, h*0.2);
  ctx.fillRect(w*0.45, h*0.2, w*0.05, h*0.2);
  ctx.fillStyle = wing;
  ctx.fillRect(-w*0.52, h*0.36, w*1.04, h*0.035);
  ctx.fillStyle = darken(wing, -20);
  ctx.fillRect(-w*0.50, h*0.31, w*1.0, h*0.03);
  ctx.fillStyle = darken(wing, -40);
  ctx.fillRect(-w*0.48, h*0.265, w*0.96, h*0.025);
  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -h*0.44); ctx.lineTo(w*0.15, -h*0.22); ctx.lineTo(w*0.22, 0);
  ctx.lineTo(w*0.22, h*0.22); ctx.lineTo(-w*0.22, h*0.22); ctx.lineTo(-w*0.22, 0);
  ctx.lineTo(-w*0.15, -h*0.22); ctx.closePath(); ctx.fill();
  // White stripe
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -h*0.44); ctx.lineTo(w*0.03, -h*0.22); ctx.lineTo(w*0.03, h*0.22);
  ctx.lineTo(-w*0.03, h*0.22); ctx.lineTo(-w*0.03, -h*0.22); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.ellipse(0, -h*0.06, w*0.12, h*0.1, 0, 0, Math.PI*2); ctx.fill();
  // Front wing stacked
  ctx.fillStyle = wing;
  ctx.fillRect(-w*0.45, -h*0.36, w*0.9, h*0.03);
  ctx.fillStyle = darken(wing, -20);
  ctx.fillRect(-w*0.432, -h*0.32, w*0.864, h*0.025);
  ctx.fillStyle = darken(wing, -40);
  ctx.fillRect(-w*0.405, -h*0.285, w*0.81, h*0.02);
  ctx.fillStyle = '#222';
  ctx.fillRect(-w*0.468, -h*0.39, w*0.05, h*0.13);
  ctx.fillRect(w*0.423, -h*0.39, w*0.05, h*0.13);
}

// J. Arrow Aero
function drawStyleJ(ctx, color, wing) {
  const w = W, h = H;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.moveTo(0, -h*0.42); ctx.lineTo(w*0.45, h*0.3); ctx.lineTo(-w*0.45, h*0.3);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-w*0.52, h*0.06, w*0.17, h*0.26);
  ctx.fillRect(w*0.35, h*0.06, w*0.17, h*0.26);
  ctx.fillRect(-w*0.48, -h*0.28, w*0.14, h*0.16);
  ctx.fillRect(w*0.34, -h*0.28, w*0.14, h*0.16);
  // Rear wing
  ctx.fillStyle = wing;
  ctx.beginPath();
  ctx.moveTo(-w*0.58, h*0.4); ctx.lineTo(-w*0.54, h*0.3);
  ctx.lineTo(w*0.54, h*0.3); ctx.lineTo(w*0.58, h*0.4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = darken(wing, 30);
  ctx.beginPath();
  ctx.moveTo(-w*0.6, h*0.42); ctx.lineTo(-w*0.56, h*0.24);
  ctx.lineTo(-w*0.52, h*0.24); ctx.lineTo(-w*0.56, h*0.42); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w*0.6, h*0.42); ctx.lineTo(w*0.56, h*0.24);
  ctx.lineTo(w*0.52, h*0.24); ctx.lineTo(w*0.56, h*0.42); ctx.closePath(); ctx.fill();
  // Body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -h*0.48); ctx.lineTo(w*0.1, -h*0.28); ctx.lineTo(w*0.32, h*0.05);
  ctx.lineTo(w*0.28, h*0.32); ctx.lineTo(-w*0.28, h*0.32); ctx.lineTo(-w*0.32, h*0.05);
  ctx.lineTo(-w*0.1, -h*0.28); ctx.closePath(); ctx.fill();
  ctx.fillStyle = darken(color, 20);
  ctx.beginPath();
  ctx.moveTo(w*0.1, -h*0.28); ctx.lineTo(w*0.32, h*0.05);
  ctx.lineTo(w*0.28, h*0.2); ctx.lineTo(w*0.08, h*0.2); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-w*0.1, -h*0.28); ctx.lineTo(-w*0.32, h*0.05);
  ctx.lineTo(-w*0.28, h*0.2); ctx.lineTo(-w*0.08, h*0.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.moveTo(0, -h*0.16); ctx.lineTo(w*0.1, -h*0.02);
  ctx.lineTo(0, h*0.1); ctx.lineTo(-w*0.1, -h*0.02); ctx.closePath(); ctx.fill();
  // Front wing
  ctx.fillStyle = wing;
  ctx.beginPath();
  ctx.moveTo(-w*0.1, -h*0.38); ctx.lineTo(-w*0.486, -h*0.26);
  ctx.lineTo(-w*0.486, -h*0.3); ctx.lineTo(-w*0.1, -h*0.42); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w*0.1, -h*0.38); ctx.lineTo(w*0.486, -h*0.26);
  ctx.lineTo(w*0.486, -h*0.3); ctx.lineTo(w*0.1, -h*0.42); ctx.closePath(); ctx.fill();
  ctx.fillStyle = darken(wing, 30);
  ctx.beginPath();
  ctx.moveTo(-w*0.504, -h*0.22); ctx.lineTo(-w*0.468, -h*0.22);
  ctx.lineTo(-w*0.504, -h*0.34); ctx.lineTo(-w*0.522, -h*0.34); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w*0.504, -h*0.22); ctx.lineTo(w*0.468, -h*0.22);
  ctx.lineTo(w*0.504, -h*0.34); ctx.lineTo(w*0.522, -h*0.34); ctx.closePath(); ctx.fill();
}

export const CAR_STYLES = [
  { name: 'Wide Wings', draw: drawStyleF },
  { name: 'Swept Aero', draw: drawStyleG },
  { name: 'Endplate', draw: drawStyleH },
  { name: 'Layered', draw: drawStyleI },
  { name: 'Arrow', draw: drawStyleJ },
];

/**
 * Convert hue (0-360) to a hex color and wing color.
 */
export function hueToColors(hue) {
  const h = hue / 60;
  const c = 0.8, x = c * (1 - Math.abs(h % 2 - 1)), m = 0.15;
  let r, g, b;
  if (h < 1) { r = c; g = x; b = 0; }
  else if (h < 2) { r = x; g = c; b = 0; }
  else if (h < 3) { r = 0; g = c; b = x; }
  else if (h < 4) { r = 0; g = x; b = c; }
  else if (h < 5) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  const bodyColor = '#' + toHex(r) + toHex(g) + toHex(b);
  const wingColor = darken(bodyColor, 40);
  return { bodyColor, wingColor };
}

/**
 * Draw a car with a specific style and color.
 */
export function drawStyledCar(ctx, x, y, angle, styleIndex, hue, alpha) {
  const { bodyColor, wingColor } = hueToColors(hue);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  CAR_STYLES[styleIndex].draw(ctx, bodyColor, wingColor);
  ctx.restore();
}

const STORAGE_KEY = 'racing-2d:car-config';

export function loadCarConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return { styleIndex: data.styleIndex || 0, hue: data.hue || 0 };
    }
  } catch (_) {}
  return { styleIndex: 0, hue: 0 };
}

export function saveCarConfig(styleIndex, hue) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ styleIndex, hue }));
  } catch (_) {}
}
