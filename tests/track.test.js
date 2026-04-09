import { generateTrack, buildTrackPath, buildWallPaths, DIR_VEC, DIR_N, DIR_E, DIR_S, DIR_W, turnLeft, turnRight } from '../js/track.js';

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    results.push({ pass: true, message });
  } else {
    failed++;
    results.push({ pass: false, message });
    console.error('FAIL:', message);
  }
}

function runTests() {
  console.log('Running track tests...');

  // Test 1: generateTrack produces at least 10 tiles
  {
    const track = generateTrack(12345);
    assert(track.tiles.length >= 10, `generateTrack produces at least 10 tiles (got ${track.tiles.length})`);
  }

  // Test 2: Seed is preserved in output
  {
    const seed = 42;
    const track = generateTrack(seed);
    assert(track.seed === seed, `Seed is preserved in output (${track.seed} === ${seed})`);
  }

  // Test 3: Same seed = deterministic (identical tiles)
  {
    const t1 = generateTrack(99999);
    const t2 = generateTrack(99999);
    assert(t1.tiles.length === t2.tiles.length, 'Same seed produces same tile count');
    let allMatch = true;
    for (let i = 0; i < t1.tiles.length; i++) {
      if (t1.tiles[i].type !== t2.tiles[i].type ||
          t1.tiles[i].gx !== t2.tiles[i].gx ||
          t1.tiles[i].gy !== t2.tiles[i].gy ||
          t1.tiles[i].dir !== t2.tiles[i].dir) {
        allMatch = false;
        break;
      }
    }
    assert(allMatch, 'Same seed produces identical tile sequence');
  }

  // Test 4: Different seeds = different tracks
  {
    const t1 = generateTrack(11111);
    const t2 = generateTrack(22222);
    let anyDiff = false;
    const minLen = Math.min(t1.tiles.length, t2.tiles.length);
    for (let i = 2; i < minLen; i++) { // skip grid+start
      if (t1.tiles[i].type !== t2.tiles[i].type ||
          t1.tiles[i].gx !== t2.tiles[i].gx ||
          t1.tiles[i].gy !== t2.tiles[i].gy) {
        anyDiff = true;
        break;
      }
    }
    assert(anyDiff || t1.tiles.length !== t2.tiles.length, 'Different seeds produce different tracks');
  }

  // Test 5: No self-intersection (no duplicate grid cells)
  {
    const track = generateTrack(54321);
    const cellSet = new Set();
    let hasDuplicate = false;
    for (const tile of track.tiles) {
      for (const c of tile.cells) {
        const key = `${c.x},${c.y}`;
        if (cellSet.has(key)) {
          hasDuplicate = true;
          break;
        }
        cellSet.add(key);
      }
      if (hasDuplicate) break;
    }
    assert(!hasDuplicate, 'No self-intersection (no duplicate grid cells)');
  }

  // Test 6: First tile is grid, second is start, last is finish
  {
    const track = generateTrack(777);
    assert(track.tiles[0].type === 'grid', `First tile is 'grid' (got '${track.tiles[0].type}')`);
    assert(track.tiles[1].type === 'start', `Second tile is 'start' (got '${track.tiles[1].type}')`);
    assert(track.tiles[track.tiles.length - 1].type === 'finish',
      `Last tile is 'finish' (got '${track.tiles[track.tiles.length - 1].type}')`);
  }

  // Test 7: buildTrackPath produces points with x,y
  {
    const track = generateTrack(555);
    const path = buildTrackPath(track);
    assert(path.length > 0, 'buildTrackPath produces non-empty path');
    const allHaveXY = path.every(p => typeof p.x === 'number' && typeof p.y === 'number' &&
      !isNaN(p.x) && !isNaN(p.y));
    assert(allHaveXY, 'All path points have valid x,y numbers');
  }

  // Test 8: buildWallPaths produces equal-length left/right arrays
  {
    const track = generateTrack(888);
    const path = buildTrackPath(track);
    const walls = buildWallPaths(path);
    assert(walls.left.length === walls.right.length, 'Wall paths have equal length left/right');
    assert(walls.left.length === path.length, 'Wall paths length matches center-line length');
  }

  // Test 9: 20 random seeds all generate without errors
  {
    let allSucceeded = true;
    let failedSeed = null;
    let errorMsg = null;
    for (let i = 0; i < 20; i++) {
      const seed = (i + 1) * 13579;
      try {
        const track = generateTrack(seed);
        const path = buildTrackPath(track);
        const walls = buildWallPaths(path);
        if (track.tiles.length < 10) {
          allSucceeded = false;
          failedSeed = seed;
          errorMsg = `Only ${track.tiles.length} tiles`;
          break;
        }
      } catch (e) {
        allSucceeded = false;
        failedSeed = seed;
        errorMsg = e.message;
        break;
      }
    }
    assert(allSucceeded, failedSeed
      ? `20 random seeds generate without errors (failed at seed ${failedSeed}: ${errorMsg})`
      : '20 random seeds all generate without errors');
  }

  // Display results
  const container = document.getElementById('results');
  if (container) {
    let html = `<h2>Results: ${passed} passed, ${failed} failed</h2>`;
    for (const r of results) {
      const color = r.pass ? 'green' : 'red';
      const icon = r.pass ? '✓' : '✗';
      html += `<div style="color:${color};margin:4px 0">${icon} ${r.message}</div>`;
    }
    container.innerHTML = html;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

runTests();
