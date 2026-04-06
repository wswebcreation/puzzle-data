import fs from 'fs';
import { intToRGBA } from 'jimp';
import { Colors } from './colors.js';
import { 
  CellCoord, 
  Puzzle, 
  Region, 
  RGB,
  ContrastLineParams,
  ScanVerticalLinesParams,
  GetCellColorParams,
  ParseCellsParams,
  ParsePuzzleParams,
  PuzzleData,
} from './types.js';

export function ensureAssetsFolder(assetsDir: string): void {
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir);
    console.log(`📁 Created ${assetsDir} directory`);
  }
}

export function getCurrentVersion(versionOutputPath: string): number {
  if (fs.existsSync(versionOutputPath)) {
    const existing = JSON.parse(fs.readFileSync(versionOutputPath, 'utf-8'));
    return typeof existing.version === 'number' ? existing.version : 0;
  }
  return 0;
}

const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

export function readPuzzleImages(folder: string): string[] {
  const files = fs.readdirSync(folder);

  return files
      .filter(file => SUPPORTED_EXTENSIONS.some(ext => file.endsWith(ext)))
      .map(file => SUPPORTED_EXTENSIONS.reduce((name, ext) => name.replace(ext, ''), file))
      .sort((a, b) => parseInt(a) - parseInt(b));
}

export function getPuzzleImagePath(folder: string, puzzleNumber: string): string {
  for (const ext of SUPPORTED_EXTENSIONS) {
    const candidate = `${folder}/${puzzleNumber}${ext}`;
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`No image found for puzzle ${puzzleNumber} in ${folder}`);
}

// Define what counts as "black" using luma (brightness)
function isBlack(color: RGB, threshold: number = 60): boolean {
  const brightness = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return brightness < threshold;
}

// Helper to calculate color distance
function colorDistance(a: RGB, b: RGB): number {
  return Math.sqrt(
    Math.pow(a.r - b.r, 2) +
    Math.pow(a.g - b.g, 2) +
    Math.pow(a.b - b.b, 2)
  );
}

// Helper to compute average RGB over pixel array
function avgColor(pixels: RGB[]): RGB {
  const len = pixels.length;
  const sum = pixels.reduce((acc, p) => ({
      r: acc.r + p.r,
      g: acc.g + p.g,
      b: acc.b + p.b,
  }), { r: 0, g: 0, b: 0 });
  return {
      r: sum.r / len,
      g: sum.g / len,
      b: sum.b / len,
  };
}

// Deduplicate near-duplicate lines (antialiasing or thick lines)
// Group nearby X positions and average them to represent one clean line
function dedup(arr: number[], gap: number = 3): number[] {
  if (arr.length === 0) return [];

  const sorted = [...arr].sort((a, b) => a - b);
  const groups: number[][] = [];
  let currentGroup = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] <= gap) {
          currentGroup.push(sorted[i]);
      } else {
          groups.push(currentGroup);
          currentGroup = [sorted[i]];
      }
  }
  groups.push(currentGroup); // last group

  // Compute average X of each group
  return groups.map(group =>
      Math.round(group.reduce((sum, val) => sum + val, 0) / group.length)
  );
}

// Normalize detected grid lines by:
// 1. Removing spurious lines (one extra line splitting a cell into two near-equal halves)
// 2. Interpolating missing lines (gap much larger than the expected cell size)
// 3. Subdividing when detected spacing is a multiple of the true cell size (e.g. every-other-line)
function normalizeGridLines(lines: number[]): number[] {
  if (lines.length < 3) return lines;

  const gaps = (arr: number[]) => arr.slice(1).map((x, i) => x - arr[i]);

  // Estimate expected cell size from the median of "reasonable" gaps (25–120px)
  const allGaps = gaps(lines);
  const validGaps = allGaps.filter(g => g >= 25 && g <= 120).sort((a, b) => a - b);
  if (validGaps.length === 0) return lines;
  const expectedGap = validGaps[Math.floor(validGaps.length / 2)];

  // Pass 1: remove spurious lines.
  // A line is spurious when the gaps on both sides are each < 70% of expected
  // AND together they sum to ~one expected cell width.
  let result = [...lines];
  let changed = true;
  while (changed) {
    changed = false;
    const g = gaps(result);
    for (let i = 0; i < g.length - 1; i++) {
      const combined = g[i] + g[i + 1];
      if (
        g[i] < 0.7 * expectedGap &&
        g[i + 1] < 0.7 * expectedGap &&
        combined >= 0.7 * expectedGap &&
        combined <= 1.3 * expectedGap
      ) {
        result.splice(i + 1, 1); // remove the middle (spurious) line
        changed = true;
        break;
      }
    }
  }

  // Pass 2: interpolate missing lines.
  // When a gap is >1.5× expected, insert evenly-spaced lines to fill it.
  let final: number[] = [result[0]];
  for (let i = 1; i < result.length; i++) {
    const gap = result[i] - result[i - 1];
    if (gap > 1.5 * expectedGap) {
      const numMissing = Math.round(gap / expectedGap) - 1;
      for (let j = 1; j <= numMissing; j++) {
        final.push(Math.round(result[i - 1] + j * (gap / (numMissing + 1))));
      }
    }
    final.push(result[i]);
  }

  // Pass 3: subdivision.
  // If we still have fewer than 6 columns, the detected spacing may be a 2× or 3× multiple
  // of the true cell size (happens when same-color interior lines are invisible in JPEG).
  const numCols = final.length - 1;
  if (numCols > 0 && numCols < 6 && final.length >= 2) {
    const tableWidth = final[final.length - 1] - final[0];
    for (const divisor of [2, 3]) {
      const trueGap = expectedGap / divisor;
      const estimatedCols = Math.round(tableWidth / trueGap);
      if (estimatedCols >= 6 && estimatedCols <= 12) {
        const subdivided: number[] = [final[0]];
        for (let i = 1; i < final.length; i++) {
          const gap = final[i] - final[i - 1];
          const numToInsert = Math.round(gap / trueGap) - 1;
          for (let j = 1; j <= numToInsert; j++) {
            subdivided.push(Math.round(final[i - 1] + j * (gap / (numToInsert + 1))));
          }
          subdivided.push(final[i]);
        }
        final = subdivided;
        break;
      }
    }
  }

  return final;
}

// Check if contrast between pixel groups on each side of x is large
function isContrastLine({image, x, y, window = 2, threshold = 60}: ContrastLineParams): boolean {
  const before: RGB[] = [], after: RGB[] = [];
  for (let i = -window; i < 0; i++) {
      before.push(intToRGBA(image.getPixelColor(x + i, y)));
  }
  for (let i = 1; i <= window; i++) {
      after.push(intToRGBA(image.getPixelColor(x + i, y)));
  }
  const dist = colorDistance(avgColor(before), avgColor(after));
  return dist > threshold;
}

export function scanVerticalLines({image, width, lineThreshold, puzzleNumber}: ScanVerticalLinesParams): { blackXPositions: number[], tableStartY: number | null } {
  const height = image.bitmap.height;

  // Per-puzzle brightness override (legacy PNG puzzles that needed tighter thresholds)
  const brightnessOverrides: Record<number, number> = { 172: 55, 320: 55 };
  const brightnessThreshold = brightnessOverrides[parseInt(puzzleNumber)] ?? 80;

  // Scan the full image height.
  // For each x position, count how many rows have a dark or high-contrast pixel there.
  // Real grid lines appear in nearly every row; crown icons and cell content appear in far fewer.
  const xHitCount = new Array(width).fill(0);
  let tableStartY: number | null = null;

  for (let y = 0; y < height; y++) {
    let consecutiveDark = 0;
    for (let x = 2; x < width - 2; x++) {
      const color = intToRGBA(image.getPixelColor(x, y));
      const dark = isBlack(color, brightnessThreshold);

      if (dark) {
        consecutiveDark++;
        // Detect the top horizontal border: first row with >= lineThreshold consecutive dark pixels
        if (consecutiveDark >= lineThreshold && tableStartY === null) {
          tableStartY = y;
        }
      } else {
        consecutiveDark = 0;
      }

      // Count this x as a candidate grid line if it's dark OR has strong left/right contrast
      if (dark || isContrastLine({image, x, y, window: 2, threshold: 30})) {
        xHitCount[x]++;
      }
    }
  }

  // Keep x positions that appear in at least 15% of image rows
  const minHits = Math.floor(height * 0.15);
  const candidateX = Array.from({length: width}, (_, x) => x).filter(x => xHitCount[x] >= minHits);
  const cleanVerticalLines = normalizeGridLines(dedup(candidateX, 3));

  // Fallback for tableStartY (images with thin/light borders that don't trigger the run-length check)
  if (tableStartY === null && cleanVerticalLines.length > 0) {
    const checkX = cleanVerticalLines[Math.floor(cleanVerticalLines.length / 2)];
    for (let y = 0; y < height; y++) {
      const color = intToRGBA(image.getPixelColor(checkX, y));
      if (isBlack(color, brightnessThreshold)) {
        tableStartY = y;
        break;
      }
    }
  }

  console.log(`🔬 Detected vertical lines (${cleanVerticalLines.length}): [${cleanVerticalLines.join(', ')}]`);

  return { blackXPositions: cleanVerticalLines, tableStartY };
}

function getCellColor({image, cellStartX, cellStartY, scanWidth, scanHeight}: GetCellColorParams): RGB {
  const colorCounts = new Map<string, number>();
  for (let x = cellStartX; x < cellStartX + scanWidth; x++) {
      for (let y = cellStartY; y < cellStartY + scanHeight; y++) {
          const color = intToRGBA(image.getPixelColor(x, y));
          if (isBlack(color)) {
              continue;
          }
          const colorKey = `${color.r},${color.g},${color.b}`;
          colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);
      }
  }

  // console.log('Color counts:', colorCounts);
  
  let mostCommonColor: RGB;
  let maxCount = 0;
  for (const [colorKey, count] of colorCounts) {
      if (count > maxCount) {
          maxCount = count;
          const [r, g, b] = colorKey.split(',').map(Number);
          mostCommonColor = {r, g, b, a: 255};
      }
  }
  // console.log('Most common color:', mostCommonColor);
  return mostCommonColor;
}

// Greedy k-means++ style centroid initialisation (deterministic: picks maximally spread colors)
function initCentroids(colors: RGB[], k: number): RGB[] {
  if (colors.length === 0 || k === 0) return [];
  k = Math.min(k, colors.length);

  const overall = avgColor(colors);
  // First centroid: the color farthest from the overall average
  let first = colors[0];
  let maxD = -1;
  for (const c of colors) {
    const d = colorDistance(c, overall);
    if (d > maxD) { maxD = d; first = c; }
  }

  const centroids: RGB[] = [{ ...first }];
  while (centroids.length < k) {
    let bestColor = colors[0];
    let bestMinDist = -1;
    for (const c of colors) {
      const minDist = Math.min(...centroids.map(ct => colorDistance(c, ct)));
      if (minDist > bestMinDist) { bestMinDist = minDist; bestColor = c; }
    }
    centroids.push({ ...bestColor });
  }
  return centroids;
}

// Run k-means and return per-color cluster assignments
function kMeans(colors: RGB[], k: number): { assignments: number[], centroids: RGB[] } {
  let centroids = initCentroids(colors, k);
  let assignments = new Array(colors.length).fill(0);

  for (let iter = 0; iter < 30; iter++) {
    let changed = false;
    for (let i = 0; i < colors.length; i++) {
      let minD = Infinity, best = 0;
      for (let j = 0; j < centroids.length; j++) {
        const d = colorDistance(colors[i], centroids[j]);
        if (d < minD) { minD = d; best = j; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;

    const clusters: RGB[][] = Array.from({ length: k }, () => []);
    colors.forEach((c, i) => clusters[assignments[i]].push(c));
    centroids = clusters.map((cl, j) => cl.length > 0 ? avgColor(cl) : centroids[j]);
  }

  return { assignments, centroids };
}

// Map cluster centroids to unique palette colors (greedy closest-first, no reuse)
function assignPaletteColors(centroids: RGB[]): Map<number, { colorName: string; hexColor: string }> {
  const palette = Object.entries(Colors).map(([name, hex]) => ({
    name,
    hex,
    rgb: { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }
  }));

  const centroidRanked = centroids.map((centroid, idx) => ({
    idx,
    ranked: [...palette].sort((a, b) => colorDistance(centroid, a.rgb) - colorDistance(centroid, b.rgb))
  }));

  // Assign the closest unambiguous match first, then resolve conflicts
  centroidRanked.sort((a, b) => colorDistance(centroids[a.idx], a.ranked[0].rgb) - colorDistance(centroids[b.idx], b.ranked[0].rgb));

  const result = new Map<number, { colorName: string; hexColor: string }>();
  const used = new Set<string>();

  for (const { idx, ranked } of centroidRanked) {
    const best = ranked.find(p => !used.has(p.name)) ?? ranked[0];
    result.set(idx, { colorName: best.name, hexColor: best.hex });
    used.add(best.name);
  }

  return result;
}

// Fix non-contiguous regions via connected-component analysis.
// For each cluster, finds all connected components and reassigns cells in non-largest
// components to neighboring clusters. Single-cell regions are their own main component
// and are never reassigned.
function enforceConnectivity(
  assignments: number[], rawColors: RGB[],
  numRows: number, numCols: number, centroids: RGB[]
): number[] {
  let result = [...assignments];

  for (let pass = 0; pass < 10; pass++) {
    // BFS to find connected components
    const component = new Array(result.length).fill(-1);
    let nextComp = 0;
    const compToCluster: number[] = [];

    for (let start = 0; start < result.length; start++) {
      if (component[start] !== -1) continue;
      const cluster = result[start];
      const queue = [start];
      component[start] = nextComp;
      compToCluster[nextComp] = cluster;
      while (queue.length > 0) {
        const idx = queue.shift()!;
        const row = Math.floor(idx / numCols), col = idx % numCols;
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const r = row + dr, c = col + dc;
          if (r < 0 || r >= numRows || c < 0 || c >= numCols) continue;
          const nIdx = r * numCols + c;
          if (component[nIdx] === -1 && result[nIdx] === cluster) {
            component[nIdx] = nextComp;
            queue.push(nIdx);
          }
        }
      }
      nextComp++;
    }

    // Find largest component per cluster
    const compSize = new Array(nextComp).fill(0);
    for (const c of component) compSize[c]++;
    const clusterMainComp = new Map<number, number>();
    for (let comp = 0; comp < nextComp; comp++) {
      const cluster = compToCluster[comp];
      if (!clusterMainComp.has(cluster) || compSize[comp] > compSize[clusterMainComp.get(cluster)!]) {
        clusterMainComp.set(cluster, comp);
      }
    }

    // Check if all cells are already in main components
    if (result.every((cl, i) => component[i] === clusterMainComp.get(cl))) break;

    // Reassign non-main cells to nearest neighboring cluster's centroid
    const next = [...result];
    for (let idx = 0; idx < result.length; idx++) {
      if (component[idx] === clusterMainComp.get(result[idx])) continue;
      const row = Math.floor(idx / numCols), col = idx % numCols;
      let minDist = Infinity, bestCluster = result[idx];
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const r = row + dr, c = col + dc;
        if (r < 0 || r >= numRows || c < 0 || c >= numCols) continue;
        const nCluster = result[r * numCols + c];
        if (nCluster === result[idx]) continue;
        const d = colorDistance(rawColors[idx], centroids[nCluster]);
        if (d < minDist) { minDist = d; bestCluster = nCluster; }
      }
      if (bestCluster !== result[idx]) next[idx] = bestCluster;
    }
    result = next;
  }

  return result;
}

export function parseCells({image, tableStartX, tableStartY, tableWidth, numCols}: ParseCellsParams): PuzzleData {
  const startY = tableStartY ?? 0;
  const cellSize = tableWidth / numCols;

  // Sample the center of each cell to avoid JPEG-compressed boundary pixels.
  // Inset by ~15% of the cell size on each side.
  const inset = Math.max(4, Math.floor(cellSize * 0.15));
  const scanSize = Math.min(40, Math.max(20, Math.floor(cellSize - 2 * inset)));

  // Step 1: Sample the dominant color for every cell (from the cell center)
  const rawColors: RGB[] = [];
  for (let row = 0; row < numCols; row++) {
    for (let col = 0; col < numCols; col++) {
      const cellStartX = tableStartX + col * cellSize + inset;
      const cellStartY = startY + row * cellSize + inset;
      rawColors.push(getCellColor({ image, cellStartX, cellStartY, scanWidth: scanSize, scanHeight: scanSize }));
    }
  }

  // Step 2: Cluster into exactly numCols groups via k-means.
  // This ensures two distinct regions with similar-looking JPEG colors never collapse
  // into the same palette entry.
  const { assignments: rawAssignments, centroids } = kMeans(rawColors, numCols);

  // Step 3: Enforce connectivity — fix non-contiguous regions without eating single-cell regions
  const assignments = enforceConnectivity(rawAssignments, rawColors, numCols, numCols, centroids);

  // Step 4: Map each cluster centroid to a unique palette color
  const palette = assignPaletteColors(centroids);

  // Step 5: Build PuzzleData using cluster assignments
  const puzzleData: PuzzleData = {
    size: numCols,
    cells: Array(numCols).fill(null).map(() => Array(numCols).fill(null))
  };

  let flatIdx = 0;
  for (let row = 0; row < numCols; row++) {
    for (let col = 0; col < numCols; col++) {
      const clusterIdx = assignments[flatIdx++];
      const { colorName, hexColor } = palette.get(clusterIdx)!;
      puzzleData.cells[row][col] = { color: colorName, hexColor };
    }
  }

  return puzzleData;
}

// Parse the puzzle data to create a puzzle object
export function parsePuzzle({numCols, puzzleData, puzzleNumber}: ParsePuzzleParams): Puzzle {
  const puzzle: Puzzle = {
      id: Number(puzzleNumber),
      size: numCols,
      regions: [],
      queens: []
  }
  for (let row = 0; row < numCols; row++) {
      for (let col = 0; col < numCols; col++) {
          const cell = puzzleData.cells[row][col];
          const region: Region = {
              id: cell.color,
              color: Colors[cell.color],
              cells: [[row, col]]
          }
          if (!puzzle.regions.find(r => r.color === region.color)) {
              puzzle.regions.push(region);
          } else {
              const existingRegion = puzzle.regions.find(r => r.color === region.color);
              existingRegion.cells.push([row, col]);
          }
      }
  }

  return puzzle;
}

  
function getRegionId(puzzle: Puzzle, row: number, col: number): string {
  return puzzle.regions.find(r =>
    r.cells.some(([r0, c0]) => r0 === row && c0 === col)
  )?.id || '';
}


function isAdjacent(pos1: CellCoord, pos2: CellCoord): boolean {
  const [r1, c1] = pos1;
  const [r2, c2] = pos2;
  return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1;
}

export function solvePuzzle(puzzle: Puzzle): CellCoord[] | null {
  const size = puzzle.size;
  const queens: CellCoord[] = [];
  const usedCols = new Set<number>();
  const usedRegions = new Set<string>();

  function isSafe(row: number, col: number): boolean {
    // No other queen in this column
    if (usedCols.has(col)) return false;

    // No other queen in the same region
    const regionId = getRegionId(puzzle, row, col);
    if (!regionId || usedRegions.has(regionId)) return false;

    // No adjacent queens
    for (const [qr, qc] of queens) {
      if (isAdjacent([row, col], [qr, qc])) {
        return false;
      }
    }

    return true;
  }

  function backtrack(row: number): boolean {
    if (row === size) return true;

    const rowCandidates= [];
    for (let col = 0; col < size; col++) {
      rowCandidates.push([row, col]);
    }

    for (const [r, c] of rowCandidates) {
      const regionId = getRegionId(puzzle, r, c);
      if (!regionId) continue;

      if (isSafe(r, c)) {
        queens.push([r, c]);
        usedCols.add(c);
        usedRegions.add(regionId);

        if (backtrack(row + 1)) return true;

        // backtrack
        queens.pop();
        usedCols.delete(c);
        usedRegions.delete(regionId);
      }
    }

    return false;
  }

  const success = backtrack(0);
  return success ? queens : null;
}

export function drawPuzzleToTerminal(puzzle: Puzzle): void {
  console.log('\nPuzzle:');
  const { size, regions, queens } = puzzle;
  const grid = Array(size).fill(null).map(() => Array(size).fill(null));
  for (const region of regions) {
      const { color, cells } = region;
      for (const cell of cells) {
          const [row, col] = cell;
          grid[row][col] = color;
      }
  }
  for (let row = 0; row < size; row++) {
      let rowStr = '';
      for (let col = 0; col < size; col++) {
          const isQueen = queens?.some(([qRow, qCol]) => qRow === row && qCol === col);
          const cellColor = grid[row][col];
          if (isQueen) {
              rowStr += `\x1b[48;2;${parseInt(cellColor.slice(1, 3), 16)};${parseInt(cellColor.slice(3, 5), 16)};${parseInt(cellColor.slice(5, 7), 16)}m Q \x1b[0m`;
          } else {
              rowStr += `\x1b[48;2;${parseInt(cellColor.slice(1, 3), 16)};${parseInt(cellColor.slice(3, 5), 16)};${parseInt(cellColor.slice(5, 7), 16)}m   \x1b[0m`;
          }
      }
      console.log(rowStr);
  }
  console.log('\n###################################')
}