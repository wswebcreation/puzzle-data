# Puzzle Data Builder

This project analyzes queen puzzle grid images to generate structured JSON data for a custom queens puzzle application. It uses Jimp for image processing to:
- Calculate grid dimensions (rows/columns/cells)
- Detect and map regions based on color analysis
- Validate regions by solving the puzzle
- Generate a JSON file containing regions, colors, and solutions

## Features

- **Image analysis**
  - Automatic grid detection and dimension calculation
  - Color-based region detection and mapping
  - Solution validation through puzzle solving
- **Data generation**
  - Compact JSON output for the queens app
  - Version tracking with `version.json`
- **Download helper**
  - Fetch answer images for a numeric range (see [Download puzzle images](#download-puzzle-images))
- **Development tools**
  - Watch mode for automatic rebuilding
  - Detailed logging of processing steps
  - Custom image folder and optional puzzle ID filter via command line
  - Comprehensive build statistics and reporting

---

## How to use

### 1. Install dependencies

```bash
npm install
```

### 2. (Optional) Download puzzle images

If you want images pulled automatically instead of adding them by hand, use the download script. It requests `queens-answer-<n>.jpg` from known CDN paths and saves them as zero-padded filenames (`615.jpg`, `616.jpg`, …) in `images/` by default.

```bash
npm run download -- --from=615 --to=705
```

Optional output folder (relative to the current working directory or absolute):

```bash
npm run download -- --from=615 --to=705 --output=custom/path/to/images
```

Existing files in the output folder are skipped. If a puzzle is not found on any configured path, that number is reported as failed. Upload path prefixes live in `src/download.ts` (`UPLOAD_PATHS`); add new year/month segments there when the host changes URLs.

### 3. Add puzzle images manually (alternative)

Place puzzle grid screenshots in the `images/` folder (or another folder you pass to the build). Supported extensions: `.png`, `.jpg`, `.jpeg`. Name each file with the puzzle number, zero-padded to three digits, for example `001.png`, `042.jpg`, `615.jpeg`.

### 4. Build once

```bash
# Default folder: project `images/`
npm run build

# Explicit folder (flag)
npm run build -- --folder=custom/path/to/images

# Explicit folder (positional, same effect)
npm run build -- custom/path/to/images

# Only specific puzzles (comma-separated; padding is optional)
npm run build -- --puzzles=615,616,642
```

The build will:
- Scan the images folder for numbered puzzle files
- Skip puzzles that are already present in `assets/puzzles.json` (incremental runs)
- For each new image: detect the grid, map regions, solve, and append to the dataset
- Write `assets/puzzles.json` and bump `assets/version.json`
- Copy failed images to `<imagesDir>/fails/` with a suffix like `-failed-incomplete` or `-failed-no-solution`

### 5. Watch mode (development)

```bash
npm run dev

npm run dev -- --folder=custom/path/to/images

npm run dev -- --puzzles=615,616
```

Rebuilds when source files change (tsx watch on `src/build.ts`).

---

## Scripts

| Command | Description |
|:--------|:------------|
| `npm run build` | Process all images and generate puzzles.json and version.json |
| `npm run build -- --folder=path` | Process images from a custom folder |
| `npm run build -- path` | Same as `--folder=path` (positional) |
| `npm run build -- --puzzles=a,b,c` | Only process the listed puzzle numbers (new entries not already in JSON) |
| `npm run dev` | Watch mode: run the build script on changes |
| `npm run download -- --from=N --to=M` | Download answer images for puzzle numbers N through M |
| `npm run download -- --from=N --to=M --output=dir` | Download into a specific folder |
| `npm run lint` | Run ESLint on TypeScript sources |
| `npm run lint:fix` | Run ESLint with `--fix` |

---

## Notes

- Processing uses [Jimp](https://github.com/jimp-dev/jimp) for image analysis.
- Puzzles already in `assets/puzzles.json` are skipped on later builds unless you remove them from the file first.
- Failed puzzles are copied under `fails/` next to your image folder with reason codes in the filename.
- Generated JSON includes region definitions, grid dimensions, queen placements, and color mappings.

---

## License

MIT License.
