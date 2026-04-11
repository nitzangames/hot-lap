// ── Ghost binary codec ──────────────────────────────────────────────────────
// Compact binary format for a lap's ghost frames. Encodes once at submit time.
//
// Wire format (little-endian):
//
//   Header (6 bytes)
//     [0..1]  magic  "HL"                                      (2 bytes)
//     [2]     version = 1                                      (uint8)
//     [3]     reserved = 0                                     (uint8)
//     [4..5]  frameCount                                       (uint16)
//
//   First frame (6 bytes) — absolute position
//     [0..1]  x       (int16)     world px, signed
//     [2..3]  y       (int16)
//     [4..5]  angle   (int16)     radians * 10000, covers ±π (±3.1416)
//
//   Subsequent frames (3 bytes each) — deltas from previous
//     [0]  dx     (int8)           per-frame px delta, max ~22 px
//     [1]  dy     (int8)
//     [2]  dangle (int8)           delta_radians * 500, covers ±0.254 rad
//
// A 45-second lap = 2700 frames → 6 + 6 + 2699*3 = 8109 bytes binary (~10.8 KB
// base64). Well under the platform's 32 KB attachment cap.

const MAGIC_0 = 0x48; // 'H'
const MAGIC_1 = 0x4C; // 'L'
const VERSION = 1;
const ANGLE_SCALE = 10000;   // first-frame angle: int16 rad * 10000
const DANGLE_SCALE = 500;    // delta-frame: int8 rad * 500

function clampInt(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/**
 * Encode a frame array into a compact Uint8Array.
 * @param {Array<{x:number,y:number,angle:number}>} frames
 * @returns {Uint8Array}
 */
export function encodeGhost(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error('encodeGhost: frames must be a non-empty array');
  }
  const n = frames.length;
  const byteLength = 6 + 6 + (n - 1) * 3;
  const buf = new ArrayBuffer(byteLength);
  const view = new DataView(buf);
  let o = 0;

  // Header
  view.setUint8(o++, MAGIC_0);
  view.setUint8(o++, MAGIC_1);
  view.setUint8(o++, VERSION);
  view.setUint8(o++, 0); // reserved
  view.setUint16(o, n, true); o += 2;

  // First frame — absolute
  const f0 = frames[0];
  view.setInt16(o, clampInt(Math.round(f0.x), -32768, 32767), true); o += 2;
  view.setInt16(o, clampInt(Math.round(f0.y), -32768, 32767), true); o += 2;
  view.setInt16(o, clampInt(Math.round(f0.angle * ANGLE_SCALE), -32768, 32767), true); o += 2;

  // Subsequent frames — deltas
  let prevX = f0.x, prevY = f0.y, prevAngle = f0.angle;
  for (let i = 1; i < n; i++) {
    const f = frames[i];
    const dx = clampInt(Math.round(f.x - prevX), -128, 127);
    const dy = clampInt(Math.round(f.y - prevY), -128, 127);
    const da = clampInt(Math.round((f.angle - prevAngle) * DANGLE_SCALE), -128, 127);
    view.setInt8(o++, dx);
    view.setInt8(o++, dy);
    view.setInt8(o++, da);
    // Reconstruct prev from what we actually stored so decode matches exactly
    prevX = prevX + dx;
    prevY = prevY + dy;
    prevAngle = prevAngle + (da / DANGLE_SCALE);
  }

  return new Uint8Array(buf);
}

/**
 * Decode a Uint8Array back into a frame array.
 * Accepts Uint8Array or ArrayBuffer.
 * @param {Uint8Array | ArrayBuffer} bytes
 * @returns {Array<{x:number,y:number,angle:number}>}
 */
export function decodeGhost(bytes) {
  if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
  if (!(bytes instanceof Uint8Array)) {
    throw new Error('decodeGhost: input must be Uint8Array or ArrayBuffer');
  }
  if (bytes.length < 12) {
    throw new Error('decodeGhost: buffer too small (need at least header + first frame)');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;

  if (view.getUint8(o++) !== MAGIC_0 || view.getUint8(o++) !== MAGIC_1) {
    throw new Error('decodeGhost: bad magic');
  }
  const version = view.getUint8(o++);
  if (version !== VERSION) {
    throw new Error('decodeGhost: unsupported version ' + version);
  }
  o++; // reserved
  const n = view.getUint16(o, true); o += 2;

  const expected = 6 + 6 + (n - 1) * 3;
  if (bytes.length !== expected) {
    throw new Error('decodeGhost: length mismatch (got ' + bytes.length + ', expected ' + expected + ')');
  }

  const frames = new Array(n);
  let x = view.getInt16(o, true); o += 2;
  let y = view.getInt16(o, true); o += 2;
  let angle = view.getInt16(o, true) / ANGLE_SCALE; o += 2;
  frames[0] = { x, y, angle };

  for (let i = 1; i < n; i++) {
    x += view.getInt8(o++);
    y += view.getInt8(o++);
    angle += view.getInt8(o++) / DANGLE_SCALE;
    frames[i] = { x, y, angle };
  }

  return frames;
}
