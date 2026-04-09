// Check the wall geometry at the loop junction
import { generateTrack, buildTrackPath, buildWallPaths } from './js/track.js';

const track = generateTrack(Date.now());
const centerLine = buildTrackPath(track);
const walls = buildWallPaths(centerLine);

console.log(`Track: ${track.tiles.length} tiles, loop: ${track.isLoop}`);
console.log(`Center line: ${centerLine.length} points`);

// Show first and last few center-line points
console.log('\nFirst 3 center-line points:');
for (let i = 0; i < 3; i++) {
  console.log(`  [${i}] x=${centerLine[i].x.toFixed(1)}, y=${centerLine[i].y.toFixed(1)}`);
}
console.log('Last 3 center-line points:');
for (let i = centerLine.length - 3; i < centerLine.length; i++) {
  console.log(`  [${i}] x=${centerLine[i].x.toFixed(1)}, y=${centerLine[i].y.toFixed(1)}`);
}

// Check gap at junction
const first = centerLine[0];
const last = centerLine[centerLine.length - 1];
const gap = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2);
console.log(`\nJunction gap: ${gap.toFixed(2)} px`);

// Check wall alignment at junction
console.log('\nLeft wall first 2:');
console.log(`  [0] x=${walls.left[0].x.toFixed(1)}, y=${walls.left[0].y.toFixed(1)}`);
console.log(`  [1] x=${walls.left[1].x.toFixed(1)}, y=${walls.left[1].y.toFixed(1)}`);
console.log('Left wall last 2:');
const ln = walls.left.length;
console.log(`  [${ln-2}] x=${walls.left[ln-2].x.toFixed(1)}, y=${walls.left[ln-2].y.toFixed(1)}`);
console.log(`  [${ln-1}] x=${walls.left[ln-1].x.toFixed(1)}, y=${walls.left[ln-1].y.toFixed(1)}`);
const wallGap = Math.sqrt((walls.left[0].x - walls.left[ln-1].x) ** 2 + (walls.left[0].y - walls.left[ln-1].y) ** 2);
console.log(`Left wall junction gap: ${wallGap.toFixed(2)} px`);

// Show tiles near junction
console.log('\nFirst 3 tiles:');
for (let i = 0; i < 3; i++) {
  const t = track.tiles[i];
  console.log(`  [${i}] type=${t.type} gx=${t.gx} gy=${t.gy} dir=${t.dir} exit=(${t.exitGx},${t.exitGy})`);
}
console.log('Last 3 tiles:');
for (let i = track.tiles.length - 3; i < track.tiles.length; i++) {
  const t = track.tiles[i];
  console.log(`  [${i}] type=${t.type} gx=${t.gx} gy=${t.gy} dir=${t.dir} exit=(${t.exitGx},${t.exitGy})`);
}
