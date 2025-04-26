export type CellCoord = [number, number];

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
