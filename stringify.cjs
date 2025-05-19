// I want to load the assets/puzzles.json file
// Then I want to stringify the data so the file will be minified
// Then I want to write the minified content to the same file

const fs = require('fs');
const puzzles = require('./assets/puzzles.json');
const minifiedPuzzles = JSON.stringify(puzzles);
fs.writeFileSync('./assets/puzzles.json', minifiedPuzzles);