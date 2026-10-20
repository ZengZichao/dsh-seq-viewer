export type SortKey     = 'original' | 'name' | 'length' | 'gaps' | 'identity' | 'manual';
export type SortDir     = 'asc' | 'desc';
export type ColorScheme = 'residue' | 'conservation' | 'identity' | 'mono';
export type HoverCell   = { row: number; col: number; cx: number; cy: number };
