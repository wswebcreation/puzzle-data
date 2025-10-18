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
const maxVerticalPixelScanHeight = 50;
const horizontalBlackLineThreshold = 25;
const verticalRowScanHeight = 25;

async function build(): Promise<void> {
  const startTime = Date.now();
  const stats = {
    total: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    failedPuzzles: [] as { id: string; reason: string; path: string }[]
  };

  ensureAssetsFolder(assetsDir);

  let existingPuzzles: Puzzle[] = [];
  try {
    if (fs.existsSync(puzzleOutputPath)) {
      const existingData = fs.readFileSync(puzzleOutputPath, 'utf-8');
      existingPuzzles = JSON.parse(existingData);
      console.log(`📚 Loaded ${existingPuzzles.length} existing puzzles`);
    }
  } catch {
    console.warn('⚠️ Could not load existing puzzles, starting fresh');
  }

  const existingPuzzleIds = new Set(existingPuzzles.map(p => p.id));
  const puzzles: Puzzle[] = [...existingPuzzles];
  const puzzleNumbers = readPuzzleImages(imagesDir);
  stats.total = puzzleNumbers.length;

  for (const puzzleNumber of puzzleNumbers) {
    const puzzleId = parseInt(puzzleNumber);
    
    if (existingPuzzleIds.has(puzzleId)) {
      console.log(`⏭️ Skipping puzzle ${puzzleNumber} (already exists)`);
      stats.skipped++;
      continue;
    }

    console.log(`\n🔍 Processing new puzzle: ${puzzleNumber}`);
    
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
        const reason = incomplete ? 'incomplete' : 'no-solution';
        const failPath = path.join(imagesDir, 'fails', `${puzzleNumber}-failed-${reason}.png`);
        console.warn(`❌ No solution found for puzzle ${puzzle.id}`);
        // copy the image to a folder called fails
        await fs.copyFileSync(
            path.join(imagesDir, `${puzzleNumber}.png`),
            failPath
        );
        stats.failed++;
        stats.failedPuzzles.push({
          id: puzzle.id.toString(),
          reason,
          path: failPath
        });
    } else {
        console.log(`✅ Puzzle ${puzzle.id} solved!`);
        puzzle.queens = queens;
        puzzles.push(puzzle);
        stats.succeeded++;
    }

    drawPuzzleToTerminal(puzzle);
  }

  await fs.writeFileSync(puzzleOutputPath, JSON.stringify(puzzles));

  const currentVersion = getCurrentVersion(versionOutputPath);
  const newVersion = currentVersion + 1;
  const versionOutput = { version: newVersion };
  const versionJson = JSON.stringify(versionOutput);

  fs.writeFileSync(versionOutputPath, versionJson, 'utf-8');
  
  // Print summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n📊 Build Summary:');
  console.log('----------------');
  console.log(`📁 Total images found: ${stats.total}`);
  console.log(`⏭️ Skipped (already exist): ${stats.skipped}`);
  console.log(`✅ Successfully solved: ${stats.succeeded}`);
  console.log(`❌ Failed to solve: ${stats.failed}`);
  console.log(`⏱️ Build duration: ${duration}s`);
  
  if (stats.failed > 0) {
    console.log('\n\u{26A0} Failed puzzles:');
    stats.failedPuzzles.forEach(({ id, reason, path }) => {
      console.log(`  - ${id} (${reason}): ${path}`);
    });
  }
  
  console.log(`\n📦 Version updated to: ${newVersion}`);
}

build();