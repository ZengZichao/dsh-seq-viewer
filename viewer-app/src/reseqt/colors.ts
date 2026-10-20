export type LegendItem = { label: string; color: string };

export const NT_BG: Record<string, string> = {
    A: '#059669', T: '#e11d48', U: '#e11d48', C: '#2563eb', G: '#d97706',
    N: '#64748b', R: '#65a30d', Y: '#9333ea',
    S: '#4f46e5', W: '#475569', K: '#ea580c', M: '#db2777',
    B: '#64748b', D: '#64748b', H: '#64748b', V: '#64748b',
};

export const AA_BG: Record<string, string> = {
    A: '#4f46e5', V: '#4f46e5', I: '#4f46e5', L: '#4f46e5', M: '#4f46e5', F: '#4f46e5', W: '#4f46e5',
    Y: '#7c3aed',
    H: '#0891b2',
    S: '#059669', T: '#059669', N: '#059669', Q: '#059669',
    K: '#dc2626', R: '#dc2626',
    D: '#ea580c', E: '#ea580c',
    C: '#ca8a04',
    G: '#64748b',
    P: '#db2777',
    B: '#475569', Z: '#475569', X: '#475569',
};

export const NT_LEGEND: LegendItem[] = [
    { label: 'Adenine', color: '#059669' },
    { label: 'Thymine / Uracil', color: '#e11d48' },
    { label: 'Cytosine', color: '#2563eb' },
    { label: 'Guanine', color: '#d97706' },
    { label: 'Ambiguous', color: '#64748b' },
];

export const AA_LEGEND: LegendItem[] = [
    { label: 'Hydrophobic', color: '#4f46e5' },
    { label: 'Tyrosine', color: '#7c3aed' },
    { label: 'Histidine', color: '#0891b2' },
    { label: 'Polar', color: '#059669' },
    { label: 'Basic (+)', color: '#dc2626' },
    { label: 'Acidic (−)', color: '#ea580c' },
    { label: 'Cysteine', color: '#ca8a04' },
    { label: 'Glycine', color: '#64748b' },
    { label: 'Proline', color: '#db2777' },
];

export const AA_PROP: Record<string, string> = {
    A: 'Hydrophobic', V: 'Hydrophobic', I: 'Hydrophobic', L: 'Hydrophobic',
    M: 'Hydrophobic', F: 'Hydrophobic', W: 'Hydrophobic',
    Y: 'Aromatic / polar', H: 'Aromatic / basic',
    S: 'Polar', T: 'Polar', N: 'Polar', Q: 'Polar',
    K: 'Basic (+)', R: 'Basic (+)',
    D: 'Acidic (−)', E: 'Acidic (−)',
    C: 'Cysteine', G: 'Glycine', P: 'Proline',
};

export const NT_PROP: Record<string, string> = {
    A: 'Purine', G: 'Purine', C: 'Pyrimidine', T: 'Pyrimidine', U: 'Pyrimidine',
    N: 'Any', R: 'Purine (A/G)', Y: 'Pyrimidine (C/T)',
    S: 'Strong (C/G)', W: 'Weak (A/T)', K: 'Keto (G/T)', M: 'Amino (A/C)',
};

const _rgb: Record<string, [number, number, number]> = {};
export function hexRgb(hex: string): [number, number, number] {
    if (_rgb[hex]) return _rgb[hex];
    return (_rgb[hex] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
}

export function residueBg(ch: string, isAA: boolean): string {
    const c = ch.toUpperCase();
    if (c === '-' || c === '.' || c === ' ') return '';
    return (isAA ? AA_BG : NT_BG)[c] ?? '#64748b';
}

export function residueProp(ch: string, isAA: boolean): string {
    const c = ch.toUpperCase();
    if (c === '-' || c === '.') return 'Gap';
    return (isAA ? AA_PROP : NT_PROP)[c] ?? '';
}

export function seqColor(idx: number): string {
    return `hsl(${((idx * 137.508) % 360).toFixed(0)}, 65%, 52%)`;
}
