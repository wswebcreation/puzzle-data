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
const isContrastLine = (image, x, y, window = 2, threshold = 60) => {
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

// Step 2: Deduplicate near-duplicate lines (antialiasing or thick lines)
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

// Step 1: Scan rows to find cell rows (rows with black pixels but without full vertical lines)
const scanVerticalLines = (image, width, maxScanHeight, rowScanHeight, lineThreshold) => {
    const blackXPositionsPerRow = []; // Stores black x positions for each valid row
    let validRowStreak = 0; // counts how many consecutive valid cell rows we've seen
    let tableStartY = null;

    for (let y = 0; y < maxScanHeight; y++) {
        // console.log(`Scanning row ${y}`);

        let verticalBlackLineCount = 0;
        let currentRowXPositions = []; // holds X positions for black pixels in this row

        for (let x = 2; x < width - 2; x++) { // Start from 2 to allow contrast window
            let blackX = 0;
            const color = intToRGBA(image.getPixelColor(x, y));

            // Check if pixel is a "line" based on either blackness or contrast
            const pixelIsLine =
                isBlack(color) ||
                isContrastLine(image, x, y, 2, 60); // window=2, threshold=60

            // If we found a black or contrast pixel, we need to check if we have a vertical black line
            if (pixelIsLine) {
                blackX = x; // We have a black or contrast pixel at position x
                verticalBlackLineCount++; // Start counting if we get a vertical black line
                currentRowXPositions.push(x); // Track black x positions for this row

                // Check if we have a vertical black line based on the threshold
                if (verticalBlackLineCount === lineThreshold) {
                    // console.log(`⚠️ Vertical grid line detected at row y=${y}`);
                    if (tableStartY === null) {
                        // console.log(`🎯 Found table start at Y = ${y}`);
                        tableStartY = y;
                    }
                    validRowStreak = 0; // Reset streak because this is not a valid data row
                    currentRowXPositions = []; // Discard current row positions
                    break; // Stop scanning this row
                }
            } else {
                verticalBlackLineCount = 0; // Reset count on gap
            }
        }

        // If we collected some black pixels and didn't hit a grid line, it's a valid row
        if (currentRowXPositions.length > 0) {
            blackXPositionsPerRow.push(currentRowXPositions); // Save x positions for this row
            validRowStreak++;
            // console.log(`✅ Valid row at y=${y} (row ${validRowStreak}/${rowScanHeight})`);
        }

        // Stop once we've collected enough valid cell rows
        if (validRowStreak === rowScanHeight) {
            // console.log(`🎯 Stopping after ${rowScanHeight} valid cell rows.`);
            break;
        }
    }

    return {
        // Flatten all black x positions from all valid rows
        blackXPositions: blackXPositionsPerRow.flat(),
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

    for (let row = 0; row < numCols; row++) {
        for (let col = 0; col < numCols; col++) {
            const cellStartX = tableStartX + (col * tableWidth) / numCols;
            const cellStartY = tableStartY + (row * tableWidth) / numCols;
            // console.log(`Cell ${col},${row} starts at x=${cellStartX} and y=${cellStartY}`);
            const cellColor = getCellColor({ image, cellStartX, cellStartY, scanWidth: 20, scanHeight: 20 });
            const closestColor = Object.entries(Colors).reduce((closest, [colorName, hexColor]) => {
                // Convert hex to RGB
                const hex = hexColor.replace('#', '');
                const color = {
                    r: parseInt(hex.substring(0, 2), 16),
                    g: parseInt(hex.substring(2, 4), 16), 
                    b: parseInt(hex.substring(4, 6), 16)
                };
                const distance = colorDistance(cellColor, color);
                return distance < closest.distance ? { colorName, distance, hexColor } : closest;
            }, { colorName: 'unknown', distance: Infinity, hexColor: '#000000' });
            // console.log(`Cell ${col},${row} color: ${closestColor.colorName}`);
            puzzleData.cells[row][col] = {
                color: closestColor.colorName,
                hexColor: closestColor.hexColor
            };
        }
    }
    return puzzleData;
}

const drawPuzzleGrid = (puzzleData) => {
    console.log('\nPuzzle Grid:');
    for (let row = 0; row < puzzleData.size; row++) {
        let rowStr = '';
        for (let col = 0; col < puzzleData.size; col++) {
            const cell = puzzleData.cells[row][col];
            rowStr += `\x1b[48;2;${parseInt(cell.hexColor.slice(1,3),16)};${parseInt(cell.hexColor.slice(3,5),16)};${parseInt(cell.hexColor.slice(5,7),16)}m   \x1b[0m`;
        }
        console.log(rowStr);
    }

    console.log('\n###################################')
}

// Main execution
(async () => {
    let puzzleNumbers = [];
    if (process.argv[2]) {
        // Single puzzle number provided
        puzzleNumbers = [process.argv[2]];
    } else {
        // Read all PNG files from images folder
        const files = await fs.readdir('images');
        puzzleNumbers = files
            .filter(file => file.endsWith('.png'))
            .map(file => file.replace('.png', ''));
    }

    for (const puzzleNumber of puzzleNumbers) {
        const image = await Jimp.read(`images/${puzzleNumber}.png`);
        const { width } = image.bitmap;

        const maxVerticalPixelScanHeight = 50; // number of vertical pixels to scan to find a horizontal line
        const horizontalBlackLineThreshold = 15; // number of black pixels to treat multiple black pixels as a line
        const verticalRowScanHeight = 6; // number of vertical pixels to scan in each column

        const { blackXPositions, tableStartY } = scanVerticalLines(
            image,
            width,
            maxVerticalPixelScanHeight,
            verticalRowScanHeight,
            horizontalBlackLineThreshold
        );
        const cleanVerticalLines = dedup(blackXPositions, 3); // Use average-based deduplication

        // Step 3: Calculate columns and table bounds
        const numCols = cleanVerticalLines.length - 1;
        const tableStartX = cleanVerticalLines[0];
        const tableEndX = cleanVerticalLines[cleanVerticalLines.length - 1];
        const tableWidth = tableEndX - tableStartX;

        console.log("\n\u{1F9E9} Scanning puzzle number:", puzzleNumber, "\n");
        // console.log("\u{1F4D0} Vertical grid lines at X:", cleanVerticalLines);
        console.log("\u{1F9EE} Number of columns:", numCols);
        console.log("\u{1F4CF} Table starts at x =", tableStartX);
        console.log("\u{1F4CF} Table starts at y =", tableStartY);
        console.log("\u{1F4CF} Table ends at x =", tableEndX);
        console.log("\u{1F4CF} Table width =", tableWidth);

        // Step 4: Determine the number of rows and columns with their respective bounds
        //         We know that the amount of rows is the same as the number of columns
        // Width and height of each cell is tableWidth / numCols
        const cellWidth = tableWidth / numCols;
        const puzzleData = parseCells({
            image,
            tableStartX,
            tableStartY,
            tableWidth,
            numCols,
        });

        drawPuzzleGrid(puzzleData);
    }
})();