# 🧩 Puzzle Data Builder

This project generates a static JSON file containing puzzle definitions for a side project.

It is designed to make it easy to:
- **Create**, **edit** and **manage** large sets of puzzles.
- **Build** a clean JSON output that can be used in any app.
- **Automatically rebuild** on source changes with a development watch mode.

---

## 📦 Features
- Write the puzzles in **TypeScript** (with full type safety)
- Convert puzzles into a **compact JSON file** at build time
- **Auto-resolve** colors or other references if needed
- **Watch mode** to automatically rebuild on changes
- Clean separation between source (`src/`) and output (`assets/`)

---

## 🚀 How to use

### 1. Install dependencies

```bash
npm install
```

### 2. Build once manually

```bash
npm run build
```

This will:
- Compile TypeScript
- Generate `assets/puzzles.json` ready to use.

---

### 3. Start in watch mode (for development)

```bash
npm run watch
```

This will:
- Automatically rebuild the JSON when you change `src/puzzles.ts` or other source files.

---

## 🛠 Scripts

| Command | Description |
|:--------|:------------|
| `npm run build` | Compile TypeScript and build puzzles.json |
| `npm run watch` | Start watch mode to rebuild on file changes |

---

## 🔥 Notes

- Never edit `assets/puzzles.json` manually. Always edit `src/puzzles.ts` and rebuild.

---

## 📜 License

MIT License.  
Feel free to use, modify, or contribute!
