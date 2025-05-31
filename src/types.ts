import { Jimp } from 'jimp';

type JimpImage = typeof Jimp.prototype;

export type CellCoord = [number, number];

export interface RGB {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface Region {
  id: string;
  color: string;
  cells: CellCoord[];
}

export interface Puzzle {
  id: number;
  size: number;
  regions: Region[];
  queens: CellCoord[];
}

export interface ContrastLineParams {
  image: JimpImage;
  x: number;
  y: number;
  window?: number;
  threshold?: number;
}

export interface ScanVerticalLinesParams {
  image: JimpImage;
  width: number;
  maxScanHeight: number;
  rowScanHeight: number;
  lineThreshold: number;
  puzzleNumber: string;
}

export interface GetCellColorParams {
  image: JimpImage;
  cellStartX: number;
  cellStartY: number;
  scanWidth: number;
  scanHeight: number;
}

export interface ParseCellsParams {
  image: JimpImage;
  tableStartX: number;
  tableStartY: number;
  tableWidth: number;
  numCols: number;
}

export interface ParsePuzzleParams {
  numCols: number;
  puzzleData: PuzzleData;
  puzzleNumber: string;
}

export interface PuzzleData {
  size: number;
  cells: Array<Array<{
    color: string;
    hexColor: string;
  }>>;
}

export interface ColorMatch {
  colorName: string;
  distance: number;
  hexColor: string;
}

export interface VersionData {
  version: number;
}
