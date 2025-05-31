import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Jimp } from 'jimp';
import { drawPuzzleToTerminal, ensureAssetsFolder, getCurrentVersion, parseCells, parsePuzzle, readPuzzleImages, scanVerticalLines, solvePuzzle } from './utils.js';
import { Puzzle } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.resolve(__dirname, '../assets');

// Parse command line arguments
function parseArgs() {
  // Skip the first two arguments (node and script path) and any '--' argument
  const args = process.argv.slice(2).filter(arg => arg !== '--');
  let imagesDir = path.resolve(__dirname, '../images'); // default value

  console.log('Arguments received:', args);

  for (const arg of args) {
    if (arg.startsWith('--folder=')) {
      imagesDir = path.resolve(process.cwd(), arg.split('=')[1]);
    } else if (!arg.startsWith('--')) {
      // If it's not a named argument and we haven't set the folder yet, use it as positional
      imagesDir = path.resolve(process.cwd(), arg);
    }
  }

  console.log(`\n\u{1F9E9} Using images from: ${imagesDir}\n`);

  return { imagesDir };
}

const { imagesDir } = parseArgs();
const puzzleOutputPath = path.resolve(assetsDir, 'puzzles.json');
const versionOutputPath = path.resolve(assetsDir, 'version.json');
const puzzles: Puzzle[] = [];
const maxVerticalPixelScanHeight = 50;
const horizontalBlackLineThreshold = 25;
const verticalRowScanHeight = 25;

async function build(): Promise<void> {
  ensureAssetsFolder(assetsDir);

  const puzzleNumbers = readPuzzleImages(imagesDir);
  for (const puzzleNumber of puzzleNumbers) {
    const image = await Jimp.read(path.join(imagesDir, `${puzzleNumber}.png`));
    const { width } = image.bitmap;
            
    // Step 1: Scan for vertical lines, these are the start x positions of the columns. Also returns the y position of the table
    const { blackXPositions, tableStartY } = scanVerticalLines({
      image,
      lineThreshold: horizontalBlackLineThreshold,
      maxScanHeight: maxVerticalPixelScanHeight,
      puzzleNumber,
      rowScanHeight: verticalRowScanHeight,
      width,
    });

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
    const puzzle = parsePuzzle({ numCols, puzzleData, puzzleNumber });

    // Step 5: Create logic to determine the queens and add them to the puzzle in a new array call queens
    const queens = solvePuzzle(puzzle);
    const incomplete = puzzle.regions.length !== puzzle.size;
    if (!queens || incomplete) {
        console.warn(`❌ No solution found for puzzle ${puzzle.id}`);
        // copy the image to a folder called fails
        await fs.copyFileSync(
            path.join(imagesDir, `${puzzleNumber}.png`),
            path.join(imagesDir, 'fails', `${puzzleNumber}-failed-${incomplete ? 'incomplete' : 'no-solution'}.png`)
        ); 
    } else {
        console.log(`✅ Puzzle ${puzzle.id} solved!`);
        puzzle.queens = queens;
        puzzles.push(puzzle);
    }

    drawPuzzleToTerminal(puzzle);
  }

  await fs.writeFileSync(puzzleOutputPath, JSON.stringify(puzzles));

  const currentVersion = getCurrentVersion(versionOutputPath);
  const newVersion = currentVersion + 1;
  const versionOutput = { version: newVersion };
  const versionJson = JSON.stringify(versionOutput);

  fs.writeFileSync(versionOutputPath, versionJson, 'utf-8');
  console.log(`📦 Version updated to: ${newVersion}`);
}

build();