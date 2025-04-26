import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { puzzles } from './puzzles.js';
import { Colors } from './colors.js';
import { Puzzle } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const assetsDir = path.resolve(__dirname, '../assets');
const outputPath = path.resolve(assetsDir, 'puzzles.json');

function ensureAssetsFolder() {
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir);
    console.log('📁 Created assets/ directory');
  }
}

function getCurrentVersion(): number {
  if (fs.existsSync(outputPath)) {
    const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    return typeof existing.version === 'number' ? existing.version : 0;
  }
  return 0;
}

function resolveColors(puzzles: Puzzle[]) {
  return puzzles.map((puzzle) => ({
    ...puzzle,
    regions: puzzle.regions.map((region: any) => ({
      ...region,
      color: typeof region.color === 'string' ? region.color : (Colors as Record<string, string>)[region.color],
    })),
  }));
}

function build() {
  ensureAssetsFolder();

  const resolvedPuzzles = resolveColors(puzzles);
  const currentVersion = getCurrentVersion();
  const newVersion = currentVersion + 1;
  const output = {
    version: newVersion,
    puzzles: resolvedPuzzles,
  };

  const json = JSON.stringify(output);

  fs.writeFileSync(outputPath, json, 'utf-8');

  console.log(`✅ Successfully built puzzles.json (${resolvedPuzzles.length} puzzles)`);
  console.log(`📦 Version updated to: ${newVersion}`);
}

build();
