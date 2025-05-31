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

export function readPuzzleImages(folder: string): string[] {
  const files = fs.readdirSync(folder);

  return files
      .filter(file => file.endsWith('.png'))
      .map(file => file.replace('.png', ''))
      .sort((a, b) => parseInt(a) - parseInt(b));
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

export function scanVerticalLines({image, width, maxScanHeight, rowScanHeight, lineThreshold, puzzleNumber}: ScanVerticalLinesParams): { blackXPositions: number[], tableStartY: number | null } {
  const blackXPositionsPerRow: number[][] = [];
  let validRowStreak = 0; 
  let tableStartY: number | null = null;

  for (let y = 0; y < maxScanHeight; y++) {
      let verticalBlackLineCount = 0;
      let currentRowXPositions = []; 
      // There are puzzles that for some reason can't handle the default threshold, so we need to manually set it
      const thresholdPuzzles = {
          // 100:20,
          172: 55,
          320: 55,
      }

      for (let x = 2; x < width - 2; x++) {
          let blackX = 0;
          const color = intToRGBA(image.getPixelColor(x, y));
          const threshold = thresholdPuzzles[puzzleNumber] || 60;
          const pixelIsLine = isBlack(color, threshold) || isContrastLine({image, x, y, window: 2, threshold});

          // If we found a black or contrast pixel, we need to check if we have a vertical black line
          if (pixelIsLine) {
              blackX = x;
              verticalBlackLineCount++;
              currentRowXPositions.push(x);

              // Check if we have a vertical black line based on the threshold
              if (verticalBlackLineCount === lineThreshold) {
                  if (tableStartY === null) {
                      tableStartY = y;
                  }
                  validRowStreak = 0;
                  currentRowXPositions = [];
                  break;
              }
          } else {
              verticalBlackLineCount = 0;
          }
      }

      // If we collected some black pixels and didn't hit a grid line, it's a valid row
      if (currentRowXPositions.length > 0) {
          blackXPositionsPerRow.push(currentRowXPositions); // Save x positions for this row
          validRowStreak++;
      }

      // Stop once we've collected enough valid cell rows
      if (validRowStreak === rowScanHeight) {
          break;
      }
  }

  const blackXPositions = blackXPositionsPerRow.flat();
  const cleanVerticalLines = dedup(blackXPositions, 3); 

  return {
      blackXPositions: cleanVerticalLines,
      tableStartY
  };
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

export function parseCells({image, tableStartX, tableStartY, tableWidth, numCols}: ParseCellsParams): PuzzleData {
  const puzzleData: PuzzleData = {
      size: numCols,
      cells: Array(numCols).fill(null).map(() => Array(numCols).fill(null))
  };
  

  for (let row = 0; row < numCols; row++) {
      for (let col = 0; col < numCols; col++) {
          const cellStartX = tableStartX + (col * tableWidth) / numCols;
          const cellStartY = tableStartY + (row * tableWidth) / numCols;
          const cellColor = getCellColor({ image, cellStartX, cellStartY, scanWidth: 40, scanHeight: 40 });
          
          // First pass: find colors that are very close to the cell color
          const closeColors = Object.entries(Colors).filter(([colorName, hexColor]) => {
              const hex = hexColor.replace('#', '');
              const color = {
                  r: parseInt(hex.substring(0, 2), 16),
                  g: parseInt(hex.substring(2, 4), 16), 
                  b: parseInt(hex.substring(4, 6), 16)
              };
   
              return colorDistance(cellColor, color) < 15;
          });

          // If we found close colors, use the first one
          // Otherwise fall back to the closest color
          let closestColor: { colorName: string, distance: number, hexColor: string };
          if (closeColors.length > 0) {
              const [colorName, hexColor] = closeColors[0];
              closestColor = { colorName, distance: 0, hexColor };
          } else {
              closestColor = Object.entries(Colors).reduce((closest, [colorName, hexColor]) => {
                  const hex = hexColor.replace('#', '');
                  const color = {
                      r: parseInt(hex.substring(0, 2), 16),
                      g: parseInt(hex.substring(2, 4), 16), 
                      b: parseInt(hex.substring(4, 6), 16)
                  };
                  const distance = colorDistance(cellColor, color);
                  return distance < closest.distance ? { colorName, distance, hexColor } : closest;
              }, { colorName: 'unknown', distance: Infinity, hexColor: '#000000' });
          }

          puzzleData.cells[row][col] = {
              color: closestColor.colorName,
              hexColor: closestColor.hexColor
          };
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