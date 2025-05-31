# 🧩 Puzzle Data Builder

This project analyzes queen puzzle grid images to generate structured JSON data for a custom queens puzzle application. It uses Jimp for image processing to:
- Calculate grid dimensions (rows/columns/cells)
- Detect and map regions based on color analysis
- Validate regions by solving the puzzle
- Generate a JSON file containing regions, colors, and solutions

## 📦 Features
- **Image Analysis**
  - Automatic grid detection and dimension calculation
  - Color-based region detection and mapping
  - Solution validation through puzzle solving
- **Data Generation**
  - TypeScript-based puzzle definitions
  - Compact JSON output for the queens app
  - Version tracking with `version.json`
- **Development Tools**
  - Watch mode for automatic rebuilding
  - Detailed logging of processing steps
  - Clean separation between source and output
  - Custom image folder support via command line
  - Comprehensive build statistics and reporting

---

## 🚀 How to use

### 1. Install dependencies

```bash
npm install
```

### 2. Build once manually

```bash
# Use default images folder
npm run build

# Or specify a custom folder
npm run build -- --folder=custom/path/to/images
```

This will:
- Scan the specified images folder (or default `images` folder) for puzzle grids
- Process each image to:
  - Detect grid dimensions
  - Calculate table start/end positions and width
  - Determine regions based on colors
  - Solve the puzzle to validate regions
  - Log processing details and solutions
- Generate `assets/puzzles.json` with the processed data
- Generate `assets/version.json` to track puzzle data versions

Example output:
```
🧩 Scanning puzzle number: 394

🧮 Number of columns: 8
📏 Table starts at x = 4 and y = 0
�� Table width = 392
🎨 Colors detected: 4 regions
✅ Puzzle 394 solved!

Puzzle:
       Q                
             Q          
    Q                   
                   Q    
          Q             
                      Q 
                Q       
 Q                      

Colors:
🟦 Region 1: #0000FF
🟨 Region 2: #FFFF00
🟩 Region 3: #00FF00
🟥 Region 4: #FF0000

📊 Build Summary:
----------------
📈 Total puzzles processed: 387
✅ Successfully solved: 387
❌ Failed to solve: 0
⏱ Build duration: 33.27s

📦 Version updated to: 337
```

---

### 3. Start in watch mode (for development)

```bash
# Use default images folder
npm run dev

# Or specify a custom folder
npm run dev -- --folder=custom/path/to/images
```

This will:
- Monitor the specified images folder (or default `images` folder) for changes
- Automatically process new or modified images
- Update `assets/puzzles.json` with new puzzle data
- Update `assets/version.json` when puzzle data changes
- Log processing details in real-time

---

## 🛠 Scripts

| Command | Description |
|:--------|:------------|
| `npm run build` | Process all images and generate puzzles.json and version.json |
| `npm run build -- --folder=path` | Process images from a custom folder |
| `npm run dev` | Start watch mode to process images and rebuild on changes |
| `npm run dev -- --folder=path` | Start watch mode with a custom images folder |

---

## 🔥 Notes

- Never edit `assets/puzzles.json` or `assets/version.json` manually
- The project uses Jimp for image processing and analysis
- Processing logs include:
  - Number of columns detected
  - Table start/end positions and width
  - Puzzle solutions
  - Region detection results
  - Build statistics and summary
- Generated JSON includes:
  - Region definitions with colors
  - Grid dimensions
  - Queen placements (solutions)
  - Color mappings
- Custom image folders can be specified using the `--folder` flag
- If no folder is specified, the default `images` folder is used
- Failed puzzles are automatically moved to a `fails` subfolder with reason codes

---

## 📜 License

MIT License.  
Feel free to use, modify, or contribute!
