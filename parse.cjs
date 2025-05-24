const { Jimp } = require("jimp");
const { intToRGBA } = require("@jimp/utils");
const fs = require('fs').promises;
const Colors = {
    black: '#000',
    blue: "#85b4fd",
    brown: '#aea692',
    green: "#a4da97",
    grey: '#d9d9d9',
    lightGrey: '#f6f6f6',
    orange: '#fcbe84',
    lavenderMedium: '#d3bceb',
    lavenderLight: '#eadff5',
    deepPurple: '#7f5aa3',
    pink: "#da96b2",
    purple: '#b096da',
    red: '#fb6b55',
    softAqua: '#95cdd0',
    paleAqua: '#abd0d4',
    vividAqua: '#8aebe5',
    white: '#fff',
    yellow: '#dbf07e',
};
// Define what counts as "black" using luma (brightness)
const isBlack = ({ r, g, b }, threshold = 60) => {
    const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return brightness < threshold;
};

// Helper to calculate color distance
const colorDistance = (a, b) =>
    Math.sqrt(
        Math.pow(a.r - b.r, 2) +
        Math.pow(a.g - b.g, 2) +
        Math.pow(a.b - b.b, 2)
    );

// Helper to compute average RGB over pixel array
const avgColor = (pixels) => {
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
};

// Check if contrast between pixel groups on each side of x is large
const isContrastLine = ({image, x, y, window = 2, threshold = 60}) => {
    const before = [], after = [];
    for (let i = -window; i < 0; i++) {
        before.push(intToRGBA(image.getPixelColor(x + i, y)));
    }
    for (let i = 1; i <= window; i++) {
        after.push(intToRGBA(image.getPixelColor(x + i, y)));
    }
    const dist = colorDistance(avgColor(before), avgColor(after));
    return dist > threshold;
};

// Deduplicate near-duplicate lines (antialiasing or thick lines)
// Group nearby X positions and average them to represent one clean line
const dedup = (arr, gap = 3) => {
    if (arr.length === 0) return [];

    const sorted = [...arr].sort((a, b) => a - b);
    const groups = [];
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
};

// Scan rows to find cell rows (rows with black pixels but without full vertical lines)
const scanVerticalLines = (image, width, maxScanHeight, rowScanHeight, lineThreshold) => {
    const blackXPositionsPerRow = [];
    let validRowStreak = 0; 
    let tableStartY = null;

    for (let y = 0; y < maxScanHeight; y++) {
        let verticalBlackLineCount = 0;
        let currentRowXPositions = []; 

        for (let x = 2; x < width - 2; x++) {
            let blackX = 0;
            const color = intToRGBA(image.getPixelColor(x, y));
            const pixelIsLine = isBlack(color) || isContrastLine({image, x, y, window: 2, threshold: 60});

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
    console.log('cleanVerticalLines', cleanVerticalLines);

    return {
        blackXPositions: cleanVerticalLines,
        tableStartY
    };
};

const getCellColor = ({image, cellStartX, cellStartY, scanWidth, scanHeight}) => {
    const colorCounts = new Map();
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
    
    let mostCommonColor;
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
};

const parseCells = ({ image, tableStartX, tableStartY, tableWidth, numCols }) => {
    const puzzleData = {
        size: numCols,
        cells: Array(numCols).fill(null).map(() => Array(numCols).fill(null))
    };

    // Color distance threshold - colors closer than this will be considered the same
    const COLOR_DISTANCE_THRESHOLD = 30;

    for (let row = 0; row < numCols; row++) {
        for (let col = 0; col < numCols; col++) {
            const cellStartX = tableStartX + (col * tableWidth) / numCols;
            const cellStartY = tableStartY + (row * tableWidth) / numCols;
            const cellColor = getCellColor({ image, cellStartX, cellStartY, scanWidth: 40, scanHeight: 40 });
            
            // First pass: find colors that are very close to the cell color
            const closeColors = Object.entries(Colors).filter(([_, hexColor]) => {
                const hex = hexColor.replace('#', '');
                const color = {
                    r: parseInt(hex.substring(0, 2), 16),
                    g: parseInt(hex.substring(2, 4), 16), 
                    b: parseInt(hex.substring(4, 6), 16)
                };
                return colorDistance(cellColor, color) < COLOR_DISTANCE_THRESHOLD;
            });

            // If we found close colors, use the first one
            // Otherwise fall back to the closest color
            let closestColor;
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

const drawPuzzleToTerminal = (puzzle) => {
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

function isAdjacent(pos1, pos2) {
    const [r1, c1] = pos1;
    const [r2, c2] = pos2;
    return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1;
  }
  
  function getRegionId(puzzle, row, col) {
    return puzzle.regions.find(r =>
      r.cells.some(([r0, c0]) => r0 === row && c0 === col)
    ).id;
  }
  
function solvePuzzle(puzzle) {
    const size = puzzle.size;
    const queens = [];
    const usedCols = new Set();
    const usedRegions = new Set();
  
    function isSafe(row, col) {
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
  
    function backtrack(row) {
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
  
// Parse the puzzle data to create a puzzle object
function parsePuzzle({numCols, puzzleData, puzzleNumber}) {
    const puzzle = {
        id: Number(puzzleNumber),
        size: numCols,
        regions: [],
    }
    for (let row = 0; row < numCols; row++) {
        for (let col = 0; col < numCols; col++) {
            const cell = puzzleData.cells[row][col];
            const region = {
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

// Read all puzzle images
async function readPuzzleImages() {
    if (process.argv[2]) {
        return [process.argv[2]];
    } 

    const files = await fs.readdir('images');
    return files
        .filter(file => file.endsWith('.png'))
        .map(file => file.replace('.png', ''));
    
}
  
(async () => {
    // Some variables
    const puzzles = [];
    const maxVerticalPixelScanHeight = 50;      // number of vertical pixels to scan to find a horizontal line
    const horizontalBlackLineThreshold = 15;    // number of black pixels to treat multiple black pixels as a line
    const verticalRowScanHeight = 10;            // number of vertical pixels to scan in each column

    // Read all puzzle images
    const puzzleNumbers = await readPuzzleImages();

    // Parse each puzzle image
    for (const puzzleNumber of puzzleNumbers) {
        const image = await Jimp.read(`images/${puzzleNumber}.png`);
        const { width } = image.bitmap;

        // Step 1: Scan for vertical lines, these are the start x positions of the columns. Also returns the y position of the table
        const { blackXPositions, tableStartY } = scanVerticalLines(
            image,
            width,
            maxVerticalPixelScanHeight,
            verticalRowScanHeight,
            horizontalBlackLineThreshold
        );

        // Step 2: Calculate columns and table bounds
        const numCols = blackXPositions.length - 1;
        const tableStartX = blackXPositions[0];
        const tableEndX = blackXPositions[blackXPositions.length - 1];
        const tableWidth = tableEndX - tableStartX;

        console.log(`\n\u{1F9E9} Scanning puzzle number: ${puzzleNumber}\n`);
        console.log(`\u{1F9EE} Number of columns: ${numCols}`);
        console.log(`\u{1F4CF} Table starts at x = ${tableStartX} and y = ${tableStartY}`);
        console.log(`\u{1F4CF} Table width = ${tableWidth}`);

        // Step 3: Determine the colors per cell
        const puzzleData = parseCells({
            image,
            tableStartX,
            tableStartY,
            tableWidth,
            numCols,
        });

        // Step 4: parse the puzzle data to create a puzzle object
        const puzzle = parsePuzzle({numCols, puzzleData, puzzleNumber});

        // Step 5: Create logic to determine the queens and add them to the puzzle in a new array call queens
        const queens = solvePuzzle(puzzle);
        const incomplete = puzzle.regions.length !== puzzle.size;
        if (!queens || incomplete) {
            console.warn(`❌ No solution found for puzzle ${puzzle.id}`);
            // When there is no solution or the puzzle is incomplete, move the file to a folder called fails
            await fs.rename(
                `images/${puzzleNumber}.png`,
                `images/fails/${puzzleNumber}-failed-${incomplete ? 'incomplete' : 'no-solution'}.png`
            );
        } else {
            console.log(`✅ Puzzle ${puzzle.id} solved!`);
            puzzle.queens = queens;
            puzzles.push(puzzle);
        }
        drawPuzzleToTerminal(puzzle);
    }

    // Step 6: Write the puzzles to a file
    await fs.writeFile('assets/puzzles-generated.json', JSON.stringify(puzzles));
})();