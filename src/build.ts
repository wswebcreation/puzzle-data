import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { puzzles } from './puzzles.js';
import { Colors } from './colors.js';
import packageJson from '../package.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputPath = path.resolve(__dirname, '../assets/puzzles.json');

function resolveColors(puzzles: any[]) {
  return puzzles.map((puzzle) => ({
    ...puzzle,
    regions: puzzle.regions.map((region: any) => ({
      ...region,
      color: typeof region.color === 'string' ? region.color : (Colors as Record<string, string>)[region.color],
    })),
  }));
}

function build() {
  const resolvedPuzzles = resolveColors(puzzles);
  const output = {
    version: packageJson.version,
    puzzles: resolvedPuzzles,
  };
  const json = JSON.stringify(output, null, 2);

  fs.writeFileSync(outputPath, json, 'utf-8');

  console.log(`✅ Successfully built puzzles.json (${resolvedPuzzles.length} puzzles)`);
}

build();
