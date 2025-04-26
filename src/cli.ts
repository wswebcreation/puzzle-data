import fs from 'fs/promises';
import chokidar from 'chokidar';
import chalk from 'chalk';
import { rawlist } from '@inquirer/prompts';
import path from 'path';

const PUZZLE_FILE = path.resolve('assets', 'puzzles.json');

let statusMessage = ''; 
let selectedPuzzle: any | null = null;

async function loadPuzzles() {
  const raw = await fs.readFile(PUZZLE_FILE, 'utf-8');
  const data = JSON.parse(raw);
  return data.puzzles;
}

async function selectPuzzle(puzzles: any[]) {
  const selectedId = await rawlist({
    message: 'Which puzzle do you want to watch?',
    choices: puzzles.map(p => ({
      name: `Puzzle #${p.id}`,
      value: p.id,
    })),
  });

  return puzzles.find(p => p.id === selectedId);
}

function findRegionColor(puzzle: any, x: number, y: number) {
  for (const region of puzzle.regions) {
    if (region.cells.some(([rx, ry]: [number, number]) => rx === x && ry === y)) {
      return region.color;
    }
  }
  return '#000000'; 
}

function isQueenAt(puzzle: any, x: number, y: number) {
  return puzzle.queens.some(([qx, qy]: [number, number]) => qx === x && qy === y);
}

function drawPuzzle(puzzle: any) {
  console.clear();
  console.log(`Puzzle #${puzzle.id}\n`);

  for (let x = 0; x < puzzle.size; x++) {
    let row = '';
    for (let y = 0; y < puzzle.size; y++) {
      const color = findRegionColor(puzzle, x, y);
      const isQueen = isQueenAt(puzzle, x, y);
      const chalked = chalk.hex(color);

      if (isQueen) {
        row += chalked(' Q ');
      } else {
        row += chalked('███');
      }
    }
    console.log(row);
  }

  console.log('\n');
  if (statusMessage) {
    console.log(statusMessage); 
  }
}

async function main() {
  try {
    const puzzles = await loadPuzzles();
    selectedPuzzle = await selectPuzzle(puzzles);

    if (selectedPuzzle) {
      drawPuzzle(selectedPuzzle);
    }
  } catch (err) {
    statusMessage = `Error: ${(err as Error).message}`;
    console.log(statusMessage);
  }

  chokidar.watch(PUZZLE_FILE).on('change', async () => {
    statusMessage = 'Reloading...';
    drawPuzzle(selectedPuzzle);

    try {
      const puzzles = await loadPuzzles();
      const updatedPuzzle = puzzles.find((p: any) => p.id === selectedPuzzle.id);

      if (updatedPuzzle) {
        selectedPuzzle = updatedPuzzle;
        statusMessage = 'Reloaded successfully ✅';
      } else {
        statusMessage = 'Selected puzzle no longer exists ❌';
      }
    } catch (err) {
      statusMessage = `Error while reloading: ${(err as Error).message}`;
    }

    drawPuzzle(selectedPuzzle);
  });
}

main().catch(err => {
  statusMessage = `Fatal Error: ${(err as Error).message}`;
  if (selectedPuzzle) {
    drawPuzzle(selectedPuzzle);
  }
  console.error(statusMessage);
});
