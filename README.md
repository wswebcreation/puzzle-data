# Puzzle Data Builder

This project analyzes queen puzzle grid images to generate structured JSON data for a custom queens puzzle application. It uses Jimp for image processing to:
- Calculate grid dimensions (rows/columns/cells)
- Detect and map regions based on color analysis
- Validate regions by solving the puzzle
- Generate a JSON file containing regions, colors, and solutions

## Features

- **Image Analysis**
  - Automatic grid detection and dimension calculation
  - Color-based region detection and mapping
  - Solution validation through puzzle solving
- **Data Generation**
  - Compact JSON output for the queens app
  - Version tracking with `version.json`
- **Development Tools**
  - Watch mode for automatic rebuilding
  - Detailed logging of processing steps
  - Custom image folder support via command line
  - Comprehensive build statistics and reporting

---

## How to use

### 1. Install dependencies

```bash
npm install
```

### 2. Add puzzle images

Place puzzle grid screenshots in the `images/` folder (or a custom folder of your choice). Each image should be named with the puzzle number, e.g. `001.png`, `002.png`, etc.

### 3. Build once manually

```bash
# Use default images folder
npm run build

# Or specify a custom folder
npm run build -- --folder=custom/path/to/images
```

This will:
- Scan the specified images folder (or default `images` folder) for puzzle grids
- Process each image to detect grid dimensions, map color regions, and solve the puzzle
- Generate `assets/puzzles.json` with the processed data
- Generate `assets/version.json` to track puzzle data versions
- Copy failed puzzles to a `fails` subfolder with reason codes

### 4. Start in watch mode (for development)

```bash
# Use default images folder
npm run dev

# Or specify a custom folder
npm run dev -- --folder=custom/path/to/images
```

---

## Scripts

| Command | Description |
|:--------|:------------|
| `npm run build` | Process all images and generate puzzles.json and version.json |
| `npm run build -- --folder=path` | Process images from a custom folder |
| `npm run dev` | Start watch mode to process images and rebuild on changes |
| `npm run dev -- --folder=path` | Start watch mode with a custom images folder |

---

## Notes

- The project uses Jimp for image processing and analysis
- Already-processed puzzles are skipped on subsequent runs
- Failed puzzles are automatically moved to a `fails` subfolder with reason codes
- Generated JSON includes region definitions, grid dimensions, queen placements, and color mappings

---

## License

MIT License.
