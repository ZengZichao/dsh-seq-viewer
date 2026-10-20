'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import styles from './ReSeqt.module.css';
import {
    NT_BG, AA_BG, NT_LEGEND, AA_LEGEND,
    residueBg, residueProp, seqColor, hexRgb,
} from './colors';
import {
    AXIS_H, LOGO_H, TOOLBAR_H, SEARCH_H, GOTO_H, SORT_H,
    COLORSCHEME_H, EXPORT_H, LEGEND_H, STATUSBAR_H, MAX_CANVAS_H,
    OVERVIEW_H, ROW_NUM_W, CHIP_W, PAD_L, MIN_LBL, MAX_LBL, CELL_STEPS,
} from './constants';
import { type Seq, parseFasta } from './fasta';
import type { SortKey, SortDir, ColorScheme, HoverCell } from './types';

function computeIdentity(a: string, b: string): number {
    let matches = 0, total = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const ca = a[i].toUpperCase(), cb = b[i].toUpperCase();
        if (ca !== '-' && ca !== '.' && cb !== '-' && cb !== '.') {
            total++;
            if (ca === cb) matches++;
        }
    }
    return total > 0 ? matches / total : 0;
}

export type ReSeqtProps = { fasta: string; isAminoAcid?: boolean; height?: number | string };
type Props = ReSeqtProps;

// ── Component ─────────────────────────────────────────────────────────────────

export function ReSeqt({ fasta, isAminoAcid = false, height }: Props) {
    const gridRef        = useRef<HTMLDivElement>(null);
    const sentinelRef    = useRef<HTMLDivElement>(null);
    const lblRef         = useRef<HTMLCanvasElement>(null);
    const axRef          = useRef<HTMLCanvasElement>(null);
    const mainRef        = useRef<HTMLCanvasElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const gotoPosInputRef = useRef<HTMLInputElement>(null);
    const rafRef         = useRef<number | null>(null);
    const scrollRef      = useRef({ x: 0, y: 0 });
    const hoverRef       = useRef<HoverCell | null>(null);
    const cellSizeRef    = useRef(CELL_STEPS[3]);
    const isDarkRef      = useRef(false);
    const matchRef       = useRef<Set<number>>(new Set());
    const hasSearchRef   = useRef(false);
    const conservationRef  = useRef<{ score: number; char: string }[]>([]);
    const consensusRowRef  = useRef<HTMLCanvasElement>(null);
    const showConsensRef   = useRef(true);
    const overviewRef       = useRef<HTMLCanvasElement>(null);
    const overviewDragRef   = useRef(false);
    const showOverviewRef   = useRef(true);
    const logoRef           = useRef<HTMLCanvasElement>(null);
    const showLogoRef       = useRef(false);
    const logoDataRef       = useRef<({ freqs: Record<string, number>; IC: number } | null)[]>([]);
    const colorSchemeRef    = useRef<ColorScheme>('residue');
    const refSeqIdxRef      = useRef(0);
    const selectionRef      = useRef<{ r1: number; c1: number; r2: number; c2: number } | null>(null);
    const selAnchorRef      = useRef<{ row: number; col: number } | null>(null);
    const isDraggingSelRef  = useRef(false);
    const lblDragRef        = useRef<number | null>(null);
    const dropLineRef       = useRef<number | null>(null);
    const seqsRef           = useRef<Seq[]>([]);
    const baseSeqsRef       = useRef<Seq[]>([]);
    const drawAllRef        = useRef<() => void>(() => {});

    const [zoomIdx, setZoomIdx]                   = useState(2);
    const [gridSize, setGridSize]                 = useState({ w: 800, h: 400 });
    const [hover, setHover]                       = useState<HoverCell | null>(null);
    const [showLegend, setShowLegend]             = useState(true);
    const [showSearch, setShowSearch]             = useState(false);
    const [showGotoPos, setShowGotoPos]           = useState(false);
    const [showSort, setShowSort]                 = useState(false);
    const [sortKey, setSortKey]                   = useState<SortKey>('original');
    const [sortDir, setSortDir]                   = useState<SortDir>('asc');
    const [sortRefSeqName, setSortRefSeqName]     = useState('');
    const [manualOrder, setManualOrder]           = useState<number[]>([]);
    const [colorScheme, setColorScheme]           = useState<ColorScheme>('residue');
    const [showColorScheme, setShowColorScheme]   = useState(false);
    const [refSeqName, setRefSeqName]             = useState('');
    const [selection, setSelection]               = useState<{ r1: number; c1: number; r2: number; c2: number } | null>(null);
    const [copiedFeedback, setCopiedFeedback]     = useState(false);
    const [gotoPosValue, setGotoPosValue]         = useState('');
    const [showConsensus, setShowConsensus]       = useState(true);
    const [showOverview, setShowOverview]         = useState(true);
    const [showLogo, setShowLogo]                 = useState(false);
    const [showExport, setShowExport]             = useState(false);
    const [isDark, setIsDark]                     = useState(false);
    const [searchQuery, setSearchQuery]           = useState('');

    const cellSize  = CELL_STEPS[zoomIdx];
    const baseSeqs  = useMemo(() => parseFasta(fasta), [fasta]);
    const seqs      = useMemo(() => {
        if (sortKey === 'original') return baseSeqs;
        if (sortKey === 'manual') return manualOrder.length
            ? (manualOrder.map(i => baseSeqs[i]).filter(Boolean) as Seq[])
            : baseSeqs;
        const sortRef = sortRefSeqName
            ? (baseSeqs.find(s => s.name === sortRefSeqName) ?? baseSeqs[0])
            : baseSeqs[0];
        return [...baseSeqs].sort((a, b) => {
            let cmp = 0;
            switch (sortKey) {
                case 'name':     cmp = a.name.localeCompare(b.name); break;
                case 'length':   cmp = a.seq.replace(/[-. ]/g, '').length - b.seq.replace(/[-. ]/g, '').length; break;
                case 'gaps':     cmp = (a.seq.match(/[-. ]/g)?.length ?? 0) / a.seq.length
                    - (b.seq.match(/[-. ]/g)?.length ?? 0) / b.seq.length; break;
                case 'identity': if (sortRef) cmp = computeIdentity(a.seq, sortRef.seq) - computeIdentity(b.seq, sortRef.seq); break;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [baseSeqs, sortKey, sortDir, sortRefSeqName, manualOrder]);
    const numRows  = seqs.length;
    const numCols  = seqs[0]?.seq.length ?? 0;

    const labelWidth = useMemo(() => {
        const maxLen = seqs.reduce((m, s) => Math.max(m, s.name.length), 0);
        return Math.min(Math.max(PAD_L + ROW_NUM_W + 6 + CHIP_W + 8 + maxLen * 7, MIN_LBL), MAX_LBL);
    }, [seqs]);

    const gapFreeCount = useMemo(() => {
        if (!seqs.length || !numCols) return 0;
        let n = 0;
        for (let c = 0; c < numCols; c++) {
            if (!seqs.some(s => s.seq[c] === '-' || s.seq[c] === '.')) n++;
        }
        return n;
    }, [seqs, numCols]);

    // Match rows for search
    const matchRows = useMemo(() => {
        if (!searchQuery.trim()) return new Set<number>();
        const q = searchQuery.toLowerCase();
        return new Set(seqs.map((s, i) => s.name.toLowerCase().includes(q) ? i : -1).filter(i => i >= 0));
    }, [seqs, searchQuery]);

    // ── Conservation per column ───────────────────────────────────────────────
    // score = count(consensus char) / numSeqs  (gaps count against conservation)
    const conservation = useMemo(() => {
        if (!seqs.length || !numCols) return [];
        return Array.from({ length: numCols }, (_, c) => {
            const counts: Record<string, number> = {};
            for (const s of seqs) {
                const ch = (s.seq[c] ?? '-').toUpperCase();
                if (ch !== '-' && ch !== '.' && ch !== ' ') {
                    counts[ch] = (counts[ch] ?? 0) + 1;
                }
            }
            let maxCnt = 0, maxChar = '-';
            for (const [ch, cnt] of Object.entries(counts)) {
                if (cnt > maxCnt) { maxCnt = cnt; maxChar = ch; }
            }
            return { score: maxCnt / seqs.length, char: maxChar };
        });
    }, [seqs, numCols]);

    // ── Reference sequence index (by name, survives sort changes) ────────────
    const refSeqIdx = useMemo(() => {
        if (!refSeqName) return 0;
        const idx = seqs.findIndex(s => s.name === refSeqName);
        return idx >= 0 ? idx : 0;
    }, [seqs, refSeqName]);

    // ── Per-column nucleotide frequency + information content (NT mode only) ──
    const logoData = useMemo(() => {
        if (!seqs.length || !numCols || isAminoAcid) return [];
        const NT_CHARS = ['A', 'C', 'G', 'T', 'U'];
        return Array.from({ length: numCols }, (_, c) => {
            const counts: Record<string, number> = {};
            let total = 0;
            for (const s of seqs) {
                const ch = (s.seq[c] ?? '-').toUpperCase();
                if (NT_CHARS.includes(ch)) {
                    counts[ch] = (counts[ch] ?? 0) + 1;
                    total++;
                }
            }
            if (total === 0) return null;
            const freqs: Record<string, number> = {};
            for (const ch of NT_CHARS) {
                if (counts[ch]) freqs[ch] = counts[ch] / total;
            }
            const IC = Math.max(0, 2 + Object.values(freqs).reduce((s, f) => s + f * Math.log2(f), 0));
            return { freqs, IC };
        });
    }, [seqs, numCols, isAminoAcid]);

    // Keep refs in sync
    matchRef.current        = matchRows;
    hasSearchRef.current    = searchQuery.trim().length > 0;
    conservationRef.current = conservation;
    showConsensRef.current  = showConsensus;
    showOverviewRef.current = showOverview;
    showLogoRef.current     = showLogo;
    logoDataRef.current     = logoData;
    colorSchemeRef.current  = colorScheme;
    refSeqIdxRef.current    = refSeqIdx;
    selectionRef.current    = selection;
    seqsRef.current         = seqs;
    baseSeqsRef.current     = baseSeqs;

    // ── Dark mode ─────────────────────────────────────────────────────────────
    isDarkRef.current = isDark;

    useEffect(() => {
        const update = () => setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
        update();
        const mo = new MutationObserver(update);
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => mo.disconnect();
    }, []);

    // ── Resize ────────────────────────────────────────────────────────────────
    useEffect(() => {
        const el = gridRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setGridSize({ w: e.contentRect.width, h: e.contentRect.height }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // ── Draw ──────────────────────────────────────────────────────────────────

    const drawAll = useCallback(() => {
        const dpr   = window.devicePixelRatio || 1;
        const sx    = scrollRef.current.x;
        const sy    = scrollRef.current.y;
        const h     = hoverRef.current;
        const cs    = cellSizeRef.current;
        const isAA  = isAminoAcid;
        const dark  = isDarkRef.current;
        const match = matchRef.current;
        const hasSrch = hasSearchRef.current;

        const lblC = lblRef.current;
        const axC  = axRef.current;
        const mnC  = mainRef.current;
        if (!lblC || !axC || !mnC || !seqs.length) return;

        const mainW = mnC.clientWidth;
        const mainH = mnC.clientHeight;
        const lblW  = lblC.clientWidth;
        const lblH  = lblC.clientHeight;
        const axW   = axC.clientWidth;

        const startCol = Math.max(0, Math.floor(sx / cs));
        const endCol   = Math.min(numCols, Math.ceil((sx + mainW) / cs) + 1);
        const startRow = Math.max(0, Math.floor(sy / cs));
        const endRow   = Math.min(numRows, Math.ceil((sy + mainH) / cs) + 1);

        // ── Theme tokens ──────────────────────────────────────────────────────
        const bgClr        = dark ? '#0f172a' : '#ffffff';
        const stripeClr    = dark ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.014)';
        const crossClr     = dark ? 'rgba(129,140,248,0.065)' : 'rgba(99,102,241,0.05)';
        const gapClr       = dark ? '#2a3a50' : '#dde4ed';
        const borderClr    = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        const lblTextClr   = dark ? '#94a3b8' : '#64748b';
        const lblActClr    = dark ? '#a5b4fc' : '#4f46e5';
        const lblNumClr    = dark ? '#334155' : '#cbd5e1';
        const axNumClr     = dark ? '#475569' : '#94a3b8';
        const axActClr     = dark ? '#a5b4fc' : '#4f46e5';
        const tickClr      = dark ? '#1a2537' : '#e2e8f0';
        const dimAlpha     = hasSrch ? 0.18 : 1;

        // ── Main canvas ────────────────────────────────────────────────────────
        const mc     = mnC.getContext('2d')!;
        const scheme = colorSchemeRef.current;
        const refIdx = refSeqIdxRef.current;
        const refStr = seqs[refIdx]?.seq ?? '';

        mc.clearRect(0, 0, mnC.width, mnC.height);
        mc.save();
        mc.scale(dpr, dpr);

        mc.fillStyle = bgClr;
        mc.fillRect(0, 0, mainW, mainH);

        const fontSize = Math.round(cs * 0.60);
        mc.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`;
        mc.textAlign = 'center';
        mc.textBaseline = 'middle';

        for (let row = startRow; row < endRow; row++) {
            const cy      = row * cs - sy;
            const isDim   = hasSrch && !match.has(row);
            const isMatch = hasSrch && match.has(row);
            const rowAlpha = isDim ? dimAlpha : 1;

            if (row % 2 === 1) {
                mc.fillStyle = stripeClr;
                mc.fillRect(0, cy, mainW, cs);
            }
            if (isMatch) {
                mc.fillStyle = dark ? 'rgba(129,140,248,0.07)' : 'rgba(99,102,241,0.05)';
                mc.fillRect(0, cy, mainW, cs);
            }
            // Reference row highlight in identity mode
            if (scheme === 'identity' && row === refIdx) {
                mc.fillStyle = dark ? 'rgba(251,191,36,0.08)' : 'rgba(245,158,11,0.07)';
                mc.fillRect(0, cy, mainW, cs);
            }

            for (let col = startCol; col < endCol; col++) {
                const cx    = col * cs - sx;
                const ch    = (seqs[row]?.seq[col] ?? '-').toUpperCase();
                const isGap = ch === '-' || ch === '.' || ch === ' ';

                if (isGap) {
                    if (cs >= 9 && !isDim) {
                        mc.globalAlpha = rowAlpha;
                        mc.strokeStyle = gapClr;
                        mc.lineWidth   = cs >= 18 ? 1.5 : 1;
                        mc.lineCap     = 'round';
                        mc.beginPath();
                        mc.moveTo(cx + cs * 0.24, cy + cs / 2);
                        mc.lineTo(cx + cs * 0.76, cy + cs / 2);
                        mc.stroke();
                    }
                } else if (scheme === 'mono') {
                    if (cs >= 12) {
                        mc.globalAlpha = rowAlpha;
                        mc.fillStyle   = residueBg(ch, isAA) || (dark ? '#94a3b8' : '#64748b');
                        mc.fillText(ch, cx + cs / 2, cy + cs / 2 + 0.5);
                    }
                } else {
                    // Compute fill color + per-cell alpha
                    let fillClr   = '';
                    let cellAlpha = rowAlpha;
                    let textClr   = 'rgba(255,255,255,0.95)';

                    if (scheme === 'residue') {
                        fillClr = residueBg(ch, isAA);
                    } else if (scheme === 'conservation') {
                        const score = conservationRef.current[col]?.score ?? 0;
                        fillClr   = dark ? '#818cf8' : '#6366f1';
                        cellAlpha = rowAlpha * (0.10 + score * 0.90);
                        textClr   = score > 0.45
                            ? 'rgba(255,255,255,0.95)'
                            : (dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.30)');
                    } else { // identity
                        const refCh = (refStr[col] ?? '-').toUpperCase();
                        if (row === refIdx) {
                            fillClr = residueBg(ch, isAA);
                        } else if (refCh !== '-' && refCh !== '.') {
                            fillClr   = ch === refCh ? '#059669' : '#e11d48';
                            cellAlpha = rowAlpha * 0.75;
                        } else {
                            // Gap in reference → dim residue color
                            fillClr   = residueBg(ch, isAA);
                            cellAlpha = rowAlpha * 0.20;
                        }
                    }

                    if (fillClr) {
                        mc.globalAlpha = cellAlpha;
                        mc.fillStyle   = fillClr;
                        mc.fillRect(cx, cy, cs, cs);

                        if (h && h.row === row && h.col === col) {
                            mc.fillStyle = 'rgba(0,0,0,0.22)';
                            mc.fillRect(cx, cy, cs, cs);
                        }
                        if (cs >= 16) {
                            mc.globalAlpha = rowAlpha;
                            mc.fillStyle   = textClr;
                            mc.fillText(ch, cx + cs / 2, cy + cs / 2 + 0.5);
                        }
                        mc.globalAlpha = rowAlpha;
                    } else if (cs >= 16 && scheme === 'identity') {
                        // refCh gap: show dim letter
                        mc.globalAlpha = rowAlpha * 0.28;
                        mc.fillStyle   = residueBg(ch, isAA) || (dark ? '#94a3b8' : '#64748b');
                        mc.fillText(ch, cx + cs / 2, cy + cs / 2 + 0.5);
                        mc.globalAlpha = rowAlpha;
                    }
                }
            }
            mc.globalAlpha = 1;

            // Dim overlay for dragged row
            if (lblDragRef.current === row) {
                mc.fillStyle = dark ? 'rgba(0,0,0,0.48)' : 'rgba(255,255,255,0.5)';
                mc.fillRect(0, cy, mainW, cs);
            }
        }

        // Subtle column group lines every 10 cols
        if (cs >= 14) {
            mc.strokeStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
            mc.lineWidth = 1;
            for (let col = startCol; col < endCol; col++) {
                if ((col + 1) % 10 !== 0) continue;
                const cx = (col + 1) * cs - sx;
                mc.beginPath();
                mc.moveTo(cx, 0);
                mc.lineTo(cx, mainH);
                mc.stroke();
            }
        }

        // Crosshair
        if (h && !selectionRef.current) {
            const hcx = h.col * cs - sx;
            const hcy = h.row * cs - sy;
            mc.fillStyle = crossClr;
            if (h.col >= startCol && h.col < endCol) mc.fillRect(hcx, 0, cs, mainH);
            if (h.row >= startRow && h.row < endRow) mc.fillRect(0, hcy, mainW, cs);
        }

        // Selection rectangle
        const sel = selectionRef.current;
        if (sel) {
            const selX = sel.c1 * cs - sx;
            const selY = sel.r1 * cs - sy;
            const selW = (sel.c2 - sel.c1 + 1) * cs;
            const selH = (sel.r2 - sel.r1 + 1) * cs;
            mc.fillStyle = dark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.13)';
            mc.fillRect(selX, selY, selW, selH);
            mc.strokeStyle = dark ? 'rgba(165,180,252,0.95)' : 'rgba(79,70,229,0.9)';
            mc.lineWidth = 1.5;
            mc.setLineDash([]);
            mc.strokeRect(selX + 0.75, selY + 0.75, selW - 1.5, selH - 1.5);
        }

        // Row drag drop indicator
        const dRow = dropLineRef.current;
        if (dRow !== null && lblDragRef.current !== null) {
            const lineY = dRow * cs - sy;
            if (lineY >= -2 && lineY <= mainH + 2) {
                mc.strokeStyle = dark ? 'rgba(165,180,252,0.75)' : 'rgba(79,70,229,0.6)';
                mc.lineWidth   = 1.5;
                mc.setLineDash([5, 4]);
                mc.beginPath();
                mc.moveTo(0, lineY);
                mc.lineTo(mainW, lineY);
                mc.stroke();
                mc.setLineDash([]);
            }
        }

        mc.restore();

        // ── Label canvas ──────────────────────────────────────────────────────
        const lc = lblC.getContext('2d')!;
        lc.clearRect(0, 0, lblC.width, lblC.height);
        lc.save();
        lc.scale(dpr, dpr);

        lc.fillStyle = bgClr;
        lc.fillRect(0, 0, lblW, lblH);

        const lblFs = Math.min(11.5, Math.max(8.5, cs * 0.62));

        for (let row = startRow; row < endRow; row++) {
            const cy     = row * cs - sy;
            const isDim  = hasSrch && !match.has(row);
            const isMatch = hasSrch && match.has(row);

            if (row % 2 === 1) {
                lc.fillStyle = stripeClr;
                lc.fillRect(0, cy, lblW, cs);
            }

            if (h?.row === row) {
                lc.fillStyle = dark ? 'rgba(129,140,248,0.1)' : 'rgba(99,102,241,0.07)';
                lc.fillRect(0, cy, lblW, cs);
            }

            if (isMatch) {
                lc.fillStyle = dark ? 'rgba(129,140,248,0.07)' : 'rgba(99,102,241,0.05)';
                lc.fillRect(0, cy, lblW, cs);
            }

            if (sel && row >= sel.r1 && row <= sel.r2) {
                lc.fillStyle = dark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.1)';
                lc.fillRect(0, cy, lblW, cs);
            }

            lc.globalAlpha = isDim ? 0.25 : 1;

            // Row number
            lc.font = `400 8.5px system-ui, sans-serif`;
            lc.textAlign = 'right';
            lc.fillStyle = lblNumClr;
            lc.fillText(String(row + 1), PAD_L + ROW_NUM_W - 2, cy + cs / 2);

            // Separator line between row number and chip
            lc.strokeStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
            lc.lineWidth = 1;
            lc.beginPath();
            lc.moveTo(PAD_L + ROW_NUM_W + 2, cy + cs * 0.18);
            lc.lineTo(PAD_L + ROW_NUM_W + 2, cy + cs * 0.82);
            lc.stroke();

            // Sequence color chip
            const chipX   = PAD_L + ROW_NUM_W + 6;
            const chipH   = Math.max(cs * 0.48, 5);
            const chipY   = cy + (cs - chipH) / 2;
            const isRef   = scheme === 'identity' && row === refIdx;
            const canRound = typeof (lc as any).roundRect === 'function';
            lc.fillStyle  = isRef ? '#f59e0b' : seqColor(row);
            if (cs >= 14 && canRound) {
                lc.beginPath();
                (lc as any).roundRect(chipX, chipY, CHIP_W, chipH, 2);
                lc.fill();
            } else {
                lc.fillRect(chipX, chipY, CHIP_W, chipH);
            }

            // Name
            lc.font = `500 ${lblFs}px system-ui, -apple-system, sans-serif`;
            lc.textAlign = 'left';
            lc.fillStyle = isRef
                ? (dark ? '#fbbf24' : '#d97706')
                : h?.row === row ? lblActClr : (isMatch ? (dark ? '#a5b4fc' : '#4f46e5') : lblTextClr);
            const maxW = lblW - chipX - CHIP_W - 10;
            let name = seqs[row].name;
            while (lc.measureText(name).width > maxW && name.length > 3) {
                name = name.slice(0, -4) + '…';
            }
            lc.fillText(name, chipX + CHIP_W + 7, cy + cs / 2);

            lc.globalAlpha = 1;

            // Drag handle — 6-dot grip, shown on hover in left pad area
            if (cs >= 10 && h?.row === row) {
                lc.fillStyle = dark ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.45)';
                const hx = 2, hy = cy + cs / 2;
                for (let r = -1; r <= 1; r++) {
                    lc.fillRect(hx,     hy + r * 3 - 0.75, 1.5, 1.5);
                    lc.fillRect(hx + 3, hy + r * 3 - 0.75, 1.5, 1.5);
                }
            }

            // Dim overlay for the row being dragged
            if (lblDragRef.current === row) {
                lc.fillStyle = dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.52)';
                lc.fillRect(0, cy, lblW, cs);
            }
        }

        // Drop indicator line
        const dRowLbl = dropLineRef.current;
        if (dRowLbl !== null && lblDragRef.current !== null) {
            const lineY = dRowLbl * cs - sy;
            if (lineY >= -2 && lineY <= lblH + 2) {
                lc.strokeStyle = dark ? '#a5b4fc' : '#4f46e5';
                lc.lineWidth   = 2;
                lc.setLineDash([]);
                lc.beginPath();
                lc.moveTo(0, lineY);
                lc.lineTo(lblW, lineY);
                lc.stroke();
                // Arrow tip at left edge
                lc.fillStyle = dark ? '#a5b4fc' : '#4f46e5';
                lc.beginPath();
                lc.moveTo(0, lineY - 4);
                lc.lineTo(0, lineY + 4);
                lc.lineTo(6, lineY);
                lc.closePath();
                lc.fill();
            }
        }

        // Right border
        lc.strokeStyle = borderClr;
        lc.lineWidth = 1;
        lc.beginPath();
        lc.moveTo(lblW - 0.5, 0);
        lc.lineTo(lblW - 0.5, lblH);
        lc.stroke();

        lc.restore();

        // ── Axis canvas ────────────────────────────────────────────────────────
        const ac = axC.getContext('2d')!;
        ac.clearRect(0, 0, axC.width, axC.height);
        ac.save();
        ac.scale(dpr, dpr);

        ac.fillStyle = bgClr;
        ac.fillRect(0, 0, axW, AXIS_H);

        const tickInt = cs < 11 ? 50 : cs < 14 ? 20 : cs < 20 ? 10 : cs < 28 ? 5 : 1;
        ac.font = `500 9px system-ui, sans-serif`;
        ac.textAlign = 'center';
        ac.textBaseline = 'top';

        if (h && h.col >= startCol && h.col < endCol && !sel) {
            ac.fillStyle = dark ? 'rgba(129,140,248,0.1)' : 'rgba(99,102,241,0.09)';
            ac.fillRect(h.col * cs - sx, 0, cs, AXIS_H);
        }
        if (sel) {
            const selAX = Math.max(0, sel.c1 * cs - sx);
            const selAW = Math.min(axW, (sel.c2 + 1) * cs - sx) - selAX;
            if (selAW > 0) {
                ac.fillStyle = dark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.12)';
                ac.fillRect(selAX, 0, selAW, AXIS_H);
            }
        }

        for (let col = startCol; col < endCol; col++) {
            const pos1  = col + 1;
            const cx    = col * cs - sx + cs / 2;
            const isHov = h?.col === col;

            // Minor tick every col
            if (cs >= 14) {
                ac.strokeStyle = dark ? '#111827' : '#f1f5f9';
                ac.lineWidth = 1;
                ac.beginPath();
                ac.moveTo(cx, AXIS_H - 4);
                ac.lineTo(cx, AXIS_H);
                ac.stroke();
            }

            // Major tick at interval
            if (pos1 % tickInt === 0 || col === 0) {
                ac.strokeStyle = isHov ? (dark ? '#818cf8' : '#6366f1') : tickClr;
                ac.lineWidth = isHov ? 1.5 : 1;
                ac.beginPath();
                ac.moveTo(cx, AXIS_H - 10);
                ac.lineTo(cx, AXIS_H);
                ac.stroke();
                ac.fillStyle = isHov ? axActClr : axNumClr;
                ac.fillText(String(pos1), cx, 4);
            }
        }

        // Bottom border
        ac.strokeStyle = borderClr;
        ac.lineWidth = 1;
        ac.beginPath();
        ac.moveTo(0, AXIS_H - 0.5);
        ac.lineTo(axW, AXIS_H - 0.5);
        ac.stroke();

        ac.restore();

        // ── Logo canvas (NT only) ──────────────────────────────────────────────
        const lgC = logoRef.current;
        if (lgC && showLogoRef.current && !isAA && logoDataRef.current.length) {
            const ld  = logoDataRef.current;
            const lgc = lgC.getContext('2d')!;
            const lgW = lgC.clientWidth;
            const lgH = lgC.clientHeight;

            lgc.clearRect(0, 0, lgC.width, lgC.height);
            lgc.save();
            lgc.scale(dpr, dpr);

            lgc.fillStyle = bgClr;
            lgc.fillRect(0, 0, lgW, lgH);

            const LG_PAD_T = 5;
            const LG_PAD_B = 5;
            const maxBarH  = lgH - LG_PAD_T - LG_PAD_B;

            // 1-bit dashed guideline at 50% of max IC
            const midY = LG_PAD_T + maxBarH * 0.5;
            lgc.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
            lgc.lineWidth = 1;
            lgc.setLineDash([3, 4]);
            lgc.beginPath();
            lgc.moveTo(0, midY);
            lgc.lineTo(lgW, midY);
            lgc.stroke();
            lgc.setLineDash([]);

            // Baseline font for measureText — must match drawing font
            const baseFontSize = 100;
            lgc.font = `700 ${baseFontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`;

            for (let col = startCol; col < endCol; col++) {
                const entry = ld[col];
                if (!entry || entry.IC < 0.02) continue;
                const { freqs, IC } = entry;
                const cx = col * cs - sx;
                const bx = cx + (cs >= 6 ? 0.5 : 0);
                const bw = Math.max(1, cs >= 6 ? cs - 1 : cs);

                // Sort ascending: least frequent on top, most frequent at bottom
                const letters = Object.entries(freqs)
                    .filter(([, f]) => f > 0)
                    .sort(([, a], [, b]) => a - b);

                let yBottom = lgH - LG_PAD_B;

                for (const [letter, freq] of [...letters].reverse()) {
                    const barH = (IC / 2) * freq * maxBarH;
                    if (barH < 0.4) { yBottom -= barH; continue; }
                    const barY = yBottom - barH;
                    const color = NT_BG[letter] || (dark ? '#94a3b8' : '#64748b');

                    // Colored bar — always drawn, adapts to any zoom
                    lgc.globalAlpha = 0.88;
                    lgc.fillStyle   = color;
                    lgc.fillRect(bx, barY, bw, barH);
                    lgc.globalAlpha = 1;

                    // Letter overlay — only when column + bar are large enough
                    if (cs >= 8 && barH >= 5) {
                        // Font size bounded by both bar height and column width
                        const letterSize = Math.min(barH * 0.85, cs * 0.74, 40);
                        if (letterSize >= 5) {
                            lgc.font = `700 ${letterSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`;
                            lgc.textAlign    = 'center';
                            lgc.textBaseline = 'middle';
                            lgc.fillStyle    = 'rgba(255,255,255,0.93)';
                            lgc.fillText(letter, cx + cs / 2, barY + barH / 2 + 0.5);
                        }
                    }

                    yBottom -= barH;
                }
            }

            // Column hover highlight
            if (h && h.col >= startCol && h.col < endCol) {
                lgc.fillStyle = crossClr;
                lgc.fillRect(h.col * cs - sx, 0, cs, lgH);
            }

            // "2 bits" scale watermark
            lgc.font = `500 8.5px system-ui, sans-serif`;
            lgc.textAlign    = 'right';
            lgc.textBaseline = 'top';
            lgc.fillStyle    = dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)';
            lgc.fillText('2 bits', lgW - 4, 2);

            // Bottom border
            lgc.strokeStyle = borderClr;
            lgc.lineWidth = 1;
            lgc.setLineDash([]);
            lgc.beginPath();
            lgc.moveTo(0, lgH - 0.5);
            lgc.lineTo(lgW, lgH - 0.5);
            lgc.stroke();

            lgc.restore();
        }

        // ── Consensus row canvas ───────────────────────────────────────────────
        const crC = consensusRowRef.current;
        if (crC && showConsensRef.current && conservationRef.current.length) {
            const cons = conservationRef.current;
            const crc  = crC.getContext('2d')!;
            const crW  = crC.clientWidth;
            const crH  = crC.clientHeight;

            crc.clearRect(0, 0, crC.width, crC.height);
            crc.save();
            crc.scale(dpr, dpr);

            // Distinct background — clearly not a sequence row
            crc.fillStyle = dark ? '#06101f' : '#eef2ff';
            crc.fillRect(0, 0, crW, crH);

            const csFontSize = Math.round(cs * 0.60);
            crc.font = `700 ${csFontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`;
            crc.textAlign    = 'center';
            crc.textBaseline = 'middle';

            const barMaxH = crH - 2; // 1px breathing room at bottom

            for (let col = startCol; col < endCol; col++) {
                const entry = cons[col];
                if (!entry) continue;
                const cx    = col * cs - sx;
                const color = residueBg(entry.char, isAA);

                if (!color || entry.char === '-') {
                    // Gap column: faint dash
                    if (cs >= 9) {
                        crc.globalAlpha = 0.18;
                        crc.strokeStyle = dark ? '#334155' : '#c7d2fe';
                        crc.lineWidth   = cs >= 18 ? 1.5 : 1;
                        crc.lineCap     = 'round';
                        crc.beginPath();
                        crc.moveTo(cx + cs * 0.24, crH * 0.52);
                        crc.lineTo(cx + cs * 0.76, crH * 0.52);
                        crc.stroke();
                        crc.globalAlpha = 1;
                    }
                    continue;
                }

                const barH = Math.max(2, Math.round(entry.score * barMaxH));
                const barY = crH - 1 - barH;

                // Bar from bottom — height ∝ conservation score, solid residue color
                crc.globalAlpha = 1;
                crc.fillStyle   = color;
                const bx = cx + (cs >= 12 ? 0.5 : 0);
                const bw = cs >= 12 ? cs - 1 : cs;
                const br = cs >= 10 ? 2.5 : 0;
                if (br > 0 && typeof (crc as any).roundRect === 'function') {
                    crc.beginPath();
                    (crc as any).roundRect(bx, barY, bw, barH, [br, br, 0, 0]);
                    crc.fill();
                } else {
                    crc.fillRect(bx, barY, bw, barH);
                }
                crc.globalAlpha = 1;

                // Letter: centered, white when bar covers midpoint, colored when above
                if (cs >= 14) {
                    const textY = crH / 2 + 0.5;
                    const inBar = barY < crH / 2;
                    crc.fillStyle   = inBar ? 'rgba(255,255,255,0.97)' : color;
                    crc.globalAlpha = inBar ? 1 : 0.72;
                    crc.fillText(entry.char, cx + cs / 2, textY);
                    crc.globalAlpha = 1;
                }
            }

            // Column hover highlight
            if (h && h.col >= startCol && h.col < endCol) {
                crc.fillStyle = crossClr;
                crc.fillRect(h.col * cs - sx, 0, cs, crH);
            }

            // Top separator — thick colored line, clearly marks start of annotation track
            crc.strokeStyle = dark ? 'rgba(99,102,241,0.65)' : 'rgba(99,102,241,0.4)';
            crc.lineWidth   = 2.5;
            crc.beginPath();
            crc.moveTo(0, 1.25);
            crc.lineTo(crW, 1.25);
            crc.stroke();

            crc.restore();
        }

        // ── Overview bar (horizontal) ──────────────────────────────────────────
        const ovC = overviewRef.current;
        if (ovC && showOverviewRef.current && seqs.length && numCols > 0) {
            const ovc   = ovC.getContext('2d')!;
            const ovWpx = ovC.width;
            const ovHpx = ovC.height;

            // Pixel data — compress all rows × all cols into ovWpx × ovHpx
            const img  = ovc.createImageData(ovWpx, ovHpx);
            const data = img.data;
            const [bgR, bgG, bgB] = dark ? [15, 23, 42]  : [248, 250, 252];
            const [gpR, gpG, gpB] = dark ? [38, 52, 72]  : [210, 220, 232];

            for (let py = 0; py < ovHpx; py++) {
                const row    = Math.min(numRows - 1, Math.floor(py / ovHpx * numRows));
                const seqStr = seqs[row]?.seq ?? '';
                for (let px = 0; px < ovWpx; px++) {
                    const col = Math.min(numCols - 1, Math.floor(px / ovWpx * numCols));
                    const ch  = (seqStr[col] ?? '-').toUpperCase();
                    const i   = (py * ovWpx + px) * 4;
                    if (ch === '-' || ch === '.' || ch === ' ') {
                        data[i] = gpR; data[i+1] = gpG; data[i+2] = gpB; data[i+3] = 255;
                    } else {
                        const hex = isAA ? AA_BG[ch] : NT_BG[ch];
                        if (hex) {
                            const [r, g, b] = hexRgb(hex);
                            data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = 255;
                        } else {
                            data[i] = bgR; data[i+1] = bgG; data[i+2] = bgB; data[i+3] = 255;
                        }
                    }
                }
            }
            ovc.putImageData(img, 0, 0);

            // Viewport indicator
            const tW  = numCols * cs;
            const vpX = Math.round((sx / (tW || 1)) * ovWpx);
            const vpW = Math.max(2, Math.min(ovWpx - vpX, Math.round((mainW / (tW || 1)) * ovWpx)));

            // Dim columns outside viewport (left and right)
            ovc.fillStyle = dark ? 'rgba(0,0,0,0.58)' : 'rgba(0,0,0,0.32)';
            ovc.fillRect(0,         0, vpX,            ovHpx);
            ovc.fillRect(vpX + vpW, 0, ovWpx - vpX - vpW, ovHpx);

            // Viewport border — bright vertical edges only for clarity
            ovc.strokeStyle = dark ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.95)';
            ovc.lineWidth   = 1.5;
            ovc.strokeRect(vpX + 0.75, 0.75, vpW - 1.5, ovHpx - 1.5);

            // Selection box
            if (sel) {
                const selOvX = Math.round((sel.c1 / numCols) * ovWpx);
                const selOvW = Math.max(1, Math.round(((sel.c2 - sel.c1 + 1) / numCols) * ovWpx));
                const selOvY = Math.round((sel.r1 / numRows) * ovHpx);
                const selOvH = Math.max(1, Math.round(((sel.r2 - sel.r1 + 1) / numRows) * ovHpx));
                ovc.strokeStyle = dark ? 'rgba(165,180,252,0.95)' : 'rgba(79,70,229,0.9)';
                ovc.lineWidth   = 1;
                ovc.strokeRect(selOvX + 0.5, selOvY + 0.5, selOvW - 1, selOvH - 1);
            }

            // Top border
            ovc.strokeStyle = borderClr;
            ovc.lineWidth   = 1;
            ovc.beginPath();
            ovc.moveTo(0, 0.5);
            ovc.lineTo(ovWpx, 0.5);
            ovc.stroke();
        }
    }, [seqs, numRows, numCols, isAminoAcid]);
    drawAllRef.current = drawAll;

    // ── Canvas sizing ─────────────────────────────────────────────────────────
    useEffect(() => {
        const dpr      = window.devicePixelRatio || 1;
        const logoOff  = !isAminoAcid && showLogo ? LOGO_H : 0;
        const consOff  = showConsensus ? cellSize : 0;
        const ovOff    = showOverview ? OVERVIEW_H : 0;
        const mainW    = Math.max(1, gridSize.w - labelWidth);
        const mainH    = Math.max(1, gridSize.h - AXIS_H - logoOff - consOff - ovOff);
        cellSizeRef.current = cellSize;

        const setC = (c: HTMLCanvasElement | null, w: number, h: number) => {
            if (!c) return;
            c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
            c.style.width = `${w}px`;     c.style.height = `${h}px`;
        };
        setC(mainRef.current, mainW, mainH);
        setC(lblRef.current, labelWidth, mainH);
        setC(axRef.current, mainW, AXIS_H);
        if (!isAminoAcid) setC(logoRef.current, mainW, LOGO_H);
        setC(consensusRowRef.current, mainW, cellSize);
        setC(overviewRef.current, mainW, OVERVIEW_H);

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(drawAll);
    }, [gridSize, labelWidth, cellSize, showLogo, showConsensus, showOverview, isAminoAcid, drawAll]);

    // ── Redraw on hover/search ────────────────────────────────────────────────
    useEffect(() => {
        cellSizeRef.current = cellSize;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(drawAll);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hover, searchQuery, drawAll]);

    // ── Redraw on color scheme / reference / selection / theme changes ────────
    useEffect(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(drawAll);
    }, [colorScheme, refSeqIdx, selection, isDark, manualOrder, drawAll]);

    // ── Scroll ────────────────────────────────────────────────────────────────
    const onScroll = useCallback(() => {
        const el = sentinelRef.current;
        if (!el) return;
        scrollRef.current = { x: el.scrollLeft, y: el.scrollTop };
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(drawAll);
    }, [drawAll]);

    // ── Mouse ─────────────────────────────────────────────────────────────────
    const onSentinelMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        const el = sentinelRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cs   = cellSizeRef.current;
        const col  = Math.floor((e.clientX - rect.left + scrollRef.current.x) / cs);
        const row  = Math.floor((e.clientY - rect.top  + scrollRef.current.y) / cs);
        if (col >= 0 && col < numCols && row >= 0 && row < numRows) {
            selAnchorRef.current    = { row, col };
            isDraggingSelRef.current = false;
            e.preventDefault();
        }
    }, [numCols, numRows]);

    const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (lblDragRef.current !== null) return; // label row drag in progress
        const el = sentinelRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cs   = cellSizeRef.current;
        const col  = Math.floor((e.clientX - rect.left + scrollRef.current.x) / cs);
        const row  = Math.floor((e.clientY - rect.top  + scrollRef.current.y) / cs);

        // Drag → update selection
        if (selAnchorRef.current && e.buttons === 1) {
            isDraggingSelRef.current = true;
            const anchor = selAnchorRef.current;
            const clampedCol = Math.max(0, Math.min(numCols - 1, col));
            const clampedRow = Math.max(0, Math.min(numRows - 1, row));
            const next = {
                r1: Math.min(anchor.row, clampedRow), r2: Math.max(anchor.row, clampedRow),
                c1: Math.min(anchor.col, clampedCol), c2: Math.max(anchor.col, clampedCol),
            };
            selectionRef.current = next;
            setSelection(next);
            hoverRef.current = null;
            setHover(null);
            return;
        }

        // Hover
        if (col >= 0 && col < numCols && row >= 0 && row < numRows) {
            const next: HoverCell = { row, col, cx: e.clientX, cy: e.clientY };
            hoverRef.current = next;
            setHover(next);
        } else {
            hoverRef.current = null;
            setHover(null);
        }
    }, [numCols, numRows]);

    const onMouseLeave = useCallback(() => {
        if (!isDraggingSelRef.current) { hoverRef.current = null; setHover(null); }
    }, []);

    // ── Label drag (row reorder) ──────────────────────────────────────────────
    const onLblMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (e.button !== 0) return;
        const lbl = lblRef.current;
        if (!lbl) return;
        const rect = lbl.getBoundingClientRect();
        const cs   = cellSizeRef.current;
        const row  = Math.floor((e.clientY - rect.top + scrollRef.current.y) / cs);
        if (row >= 0 && row < numRows) {
            lblDragRef.current  = row;
            dropLineRef.current = row;
            lbl.style.cursor = 'grabbing';
            e.preventDefault();
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(drawAll);
        }
    }, [numRows, drawAll]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (lblDragRef.current === null) return;
            const lbl = lblRef.current;
            if (!lbl) return;
            const rect = lbl.getBoundingClientRect();
            const cs   = cellSizeRef.current;
            const next = Math.max(0, Math.min(numRows, Math.round(
                (e.clientY - rect.top + scrollRef.current.y) / cs
            )));
            if (next !== dropLineRef.current) {
                dropLineRef.current = next;
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(drawAll);
            }
        };
        window.addEventListener('mousemove', onMove);
        return () => window.removeEventListener('mousemove', onMove);
    }, [numRows, drawAll]);

    // ── Copy selection as FASTA ───────────────────────────────────────────────
    const copySelectionAsFasta = useCallback(() => {
        const sel = selectionRef.current;
        if (!sel) return;
        const lines: string[] = [];
        for (let r = sel.r1; r <= sel.r2; r++) {
            const s = seqs[r];
            if (s) { lines.push(`>${s.name}`); lines.push(s.seq.slice(sel.c1, sel.c2 + 1)); }
        }
        navigator.clipboard.writeText(lines.join('\n')).then(() => {
            setCopiedFeedback(true);
            setTimeout(() => setCopiedFeedback(false), 1800);
        });
    }, [seqs]);

    // ── Export view as PNG ────────────────────────────────────────────────────
    const exportViewAsPng = useCallback(() => {
        const lblC = lblRef.current;
        const axC  = axRef.current;
        const mnC  = mainRef.current;
        if (!lblC || !axC || !mnC) return;

        const dark  = isDarkRef.current;
        const bgClr = dark ? '#0f172a' : '#ffffff';
        const dpr   = window.devicePixelRatio || 1;

        const mainW = mnC.clientWidth;
        const mainH = mnC.clientHeight;
        const lblW  = lblC.clientWidth;

        const consOff = showConsensRef.current && consensusRowRef.current ? cellSizeRef.current : 0;
        const ovOff   = showOverviewRef.current && overviewRef.current  ? OVERVIEW_H : 0;

        const exportW = lblW + mainW;
        const exportH = AXIS_H + mainH + consOff + ovOff;

        const off = document.createElement('canvas');
        off.width  = Math.round(exportW * dpr);
        off.height = Math.round(exportH * dpr);
        const ctx  = off.getContext('2d')!;
        ctx.scale(dpr, dpr);

        ctx.fillStyle = bgClr;
        ctx.fillRect(0, 0, exportW, exportH);

        // Axis (top-right)
        ctx.drawImage(axC, lblW, 0, mainW, AXIS_H);

        let y = AXIS_H;

        // Label + main sequence canvases
        ctx.drawImage(lblC, 0, y, lblW, mainH);
        ctx.drawImage(mnC,  lblW, y, mainW, mainH);
        y += mainH;

        // Consensus row
        if (consOff > 0 && consensusRowRef.current) {
            const cs = cellSizeRef.current;
            ctx.fillStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)';
            ctx.fillRect(0, y, lblW, cs);
            ctx.font = '600 8px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = dark ? '#334155' : '#cbd5e1';
            ctx.fillText('Consensus', lblW / 2, y + cs / 2);
            ctx.drawImage(consensusRowRef.current, lblW, y, mainW, cs);
            y += cs;
        }

        // Overview bar
        if (ovOff > 0 && overviewRef.current) {
            ctx.fillStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)';
            ctx.fillRect(0, y, lblW, OVERVIEW_H);
            ctx.font = '700 8px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = dark ? '#334155' : '#cbd5e1';
            ctx.fillText('MAP', lblW / 2, y + OVERVIEW_H / 2);
            ctx.drawImage(overviewRef.current, lblW, y, mainW, OVERVIEW_H);
        }

        const link = document.createElement('a');
        link.download = 'alignment-view.png';
        link.href = off.toDataURL('image/png');
        link.click();
    }, []);

    // ── Export selection as PNG ───────────────────────────────────────────────
    const exportSelectionAsPng = useCallback(() => {
        const sel = selectionRef.current;
        if (!sel) return;

        const dark   = isDarkRef.current;
        const cs     = cellSizeRef.current;
        const isAA   = isAminoAcid;
        const bgClr  = dark ? '#0f172a' : '#ffffff';
        const scale  = window.devicePixelRatio || 1;

        const selRows = sel.r2 - sel.r1 + 1;
        const selCols = sel.c2 - sel.c1 + 1;

        // Compute label width for the selected rows
        const maxLen = seqs.slice(sel.r1, sel.r2 + 1).reduce((m, s) => Math.max(m, s.name.length), 0);
        const lblW   = Math.min(Math.max(PAD_L + ROW_NUM_W + 6 + CHIP_W + 8 + maxLen * 7, MIN_LBL), MAX_LBL);
        const mainW  = selCols * cs;
        const mainH  = selRows * cs;
        const exportW = lblW + mainW;
        const exportH = AXIS_H + mainH;

        const off = document.createElement('canvas');
        off.width  = exportW * scale;
        off.height = exportH * scale;
        const ctx  = off.getContext('2d')!;
        ctx.scale(scale, scale);

        // Theme tokens
        const stripeClr = dark ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.014)';
        const gapClr    = dark ? '#2a3a50' : '#dde4ed';
        const borderClr = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        const lblTextClr = dark ? '#94a3b8' : '#64748b';
        const lblNumClr  = dark ? '#334155' : '#cbd5e1';
        const axNumClr   = dark ? '#475569' : '#94a3b8';
        const tickClr    = dark ? '#1a2537' : '#e2e8f0';

        const scheme = colorSchemeRef.current;
        const refIdx = refSeqIdxRef.current;
        const refStr = seqs[refIdx]?.seq ?? '';
        const cons   = conservationRef.current;

        ctx.fillStyle = bgClr;
        ctx.fillRect(0, 0, exportW, exportH);

        // ── Axis ──────────────────────────────────────────────────────────────
        const tickInt = cs < 11 ? 50 : cs < 14 ? 20 : cs < 20 ? 10 : cs < 28 ? 5 : 1;
        ctx.font = `500 9px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        for (let c = 0; c < selCols; c++) {
            const col  = sel.c1 + c;
            const pos1 = col + 1;
            const cx   = lblW + c * cs + cs / 2;

            if (cs >= 14) {
                ctx.strokeStyle = dark ? '#111827' : '#f1f5f9';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(cx, AXIS_H - 4); ctx.lineTo(cx, AXIS_H); ctx.stroke();
            }
            if (pos1 % tickInt === 0 || c === 0) {
                ctx.strokeStyle = tickClr;
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(cx, AXIS_H - 10); ctx.lineTo(cx, AXIS_H); ctx.stroke();
                ctx.fillStyle = axNumClr;
                ctx.fillText(String(pos1), cx, 4);
            }
        }
        ctx.strokeStyle = borderClr;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, AXIS_H - 0.5); ctx.lineTo(exportW, AXIS_H - 0.5); ctx.stroke();

        // ── Sequence cells ────────────────────────────────────────────────────
        const fontSize = Math.round(cs * 0.60);
        ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let r = 0; r < selRows; r++) {
            const row = sel.r1 + r;
            const cy  = AXIS_H + r * cs;

            if (r % 2 === 1) { ctx.fillStyle = stripeClr; ctx.fillRect(lblW, cy, mainW, cs); }
            if (scheme === 'identity' && row === refIdx) {
                ctx.fillStyle = dark ? 'rgba(251,191,36,0.08)' : 'rgba(245,158,11,0.07)';
                ctx.fillRect(lblW, cy, mainW, cs);
            }

            for (let c = 0; c < selCols; c++) {
                const col   = sel.c1 + c;
                const cellX = lblW + c * cs;
                const ch    = (seqs[row]?.seq[col] ?? '-').toUpperCase();
                const isGap = ch === '-' || ch === '.' || ch === ' ';

                if (isGap) {
                    if (cs >= 9) {
                        ctx.globalAlpha = 1;
                        ctx.strokeStyle = gapClr;
                        ctx.lineWidth = cs >= 18 ? 1.5 : 1;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.moveTo(cellX + cs * 0.24, cy + cs / 2);
                        ctx.lineTo(cellX + cs * 0.76, cy + cs / 2);
                        ctx.stroke();
                    }
                } else if (scheme === 'mono') {
                    if (cs >= 12) {
                        ctx.globalAlpha = 1;
                        ctx.fillStyle = residueBg(ch, isAA) || (dark ? '#94a3b8' : '#64748b');
                        ctx.fillText(ch, cellX + cs / 2, cy + cs / 2 + 0.5);
                    }
                } else {
                    let fillClr = '', cellAlpha = 1, textClr = 'rgba(255,255,255,0.95)';

                    if (scheme === 'residue') {
                        fillClr = residueBg(ch, isAA);
                    } else if (scheme === 'conservation') {
                        const score = cons[col]?.score ?? 0;
                        fillClr   = dark ? '#818cf8' : '#6366f1';
                        cellAlpha = 0.10 + score * 0.90;
                        textClr   = score > 0.45 ? 'rgba(255,255,255,0.95)' : (dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.30)');
                    } else { // identity
                        const refCh = (refStr[col] ?? '-').toUpperCase();
                        if (row === refIdx) { fillClr = residueBg(ch, isAA); }
                        else if (refCh !== '-' && refCh !== '.') {
                            fillClr = ch === refCh ? '#059669' : '#e11d48';
                            cellAlpha = 0.75;
                        } else { fillClr = residueBg(ch, isAA); cellAlpha = 0.20; }
                    }

                    if (fillClr) {
                        ctx.globalAlpha = cellAlpha;
                        ctx.fillStyle = fillClr;
                        ctx.fillRect(cellX, cy, cs, cs);
                        if (cs >= 16) { ctx.globalAlpha = 1; ctx.fillStyle = textClr; ctx.fillText(ch, cellX + cs / 2, cy + cs / 2 + 0.5); }
                        ctx.globalAlpha = 1;
                    } else if (cs >= 16 && scheme === 'identity') {
                        ctx.globalAlpha = 0.28;
                        ctx.fillStyle = residueBg(ch, isAA) || (dark ? '#94a3b8' : '#64748b');
                        ctx.fillText(ch, cellX + cs / 2, cy + cs / 2 + 0.5);
                        ctx.globalAlpha = 1;
                    }
                }
            }
        }

        // ── Labels ────────────────────────────────────────────────────────────
        const lblFs = Math.min(11.5, Math.max(8.5, cs * 0.62));

        for (let r = 0; r < selRows; r++) {
            const row = sel.r1 + r;
            const cy  = AXIS_H + r * cs;
            const isRef = scheme === 'identity' && row === refIdx;

            if (r % 2 === 1) { ctx.fillStyle = stripeClr; ctx.fillRect(0, cy, lblW, cs); }

            ctx.globalAlpha = 1;
            ctx.font = `400 8.5px system-ui, sans-serif`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = lblNumClr;
            ctx.fillText(String(row + 1), PAD_L + ROW_NUM_W - 2, cy + cs / 2);

            const chipX = PAD_L + ROW_NUM_W + 6;
            const chipH = Math.max(cs * 0.48, 5);
            const chipY = cy + (cs - chipH) / 2;
            ctx.fillStyle = isRef ? '#f59e0b' : seqColor(row);
            ctx.fillRect(chipX, chipY, CHIP_W, chipH);

            ctx.font = `500 ${lblFs}px system-ui, -apple-system, sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isRef ? (dark ? '#fbbf24' : '#d97706') : lblTextClr;
            const maxW = lblW - chipX - CHIP_W - 10;
            let name = seqs[row].name;
            while (ctx.measureText(name).width > maxW && name.length > 3) { name = name.slice(0, -4) + '…'; }
            ctx.fillText(name, chipX + CHIP_W + 7, cy + cs / 2);
        }

        // Label right border
        ctx.strokeStyle = borderClr;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(lblW - 0.5, 0); ctx.lineTo(lblW - 0.5, exportH); ctx.stroke();

        const link = document.createElement('a');
        link.download = `alignment-sel_seq${sel.r1 + 1}-${sel.r2 + 1}_col${sel.c1 + 1}-${sel.c2 + 1}.png`;
        link.href = off.toDataURL('image/png');
        link.click();
    }, [seqs, isAminoAcid]);

    // ── Jump to position ──────────────────────────────────────────────────────
    const jumpToPos = useCallback((raw: string) => {
        const pos = parseInt(raw, 10);
        if (!isFinite(pos)) return;
        const col    = Math.max(0, Math.min(numCols - 1, pos - 1));
        const el     = sentinelRef.current;
        if (!el) return;
        const cs     = cellSizeRef.current;
        const target = col * cs - el.clientWidth / 2 + cs / 2;
        el.scrollLeft = Math.max(0, Math.min(numCols * cs - el.clientWidth, target));
    }, [numCols]);

    // ── Overview interaction ──────────────────────────────────────────────────
    const onOverviewPointer = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        const el = sentinelRef.current;
        if (!el) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;
        const cs   = cellSizeRef.current;
        const tW   = numCols * cs;
        el.scrollLeft = Math.max(0, Math.min(tW - el.clientWidth, relX * tW - el.clientWidth / 2));
    }, [numCols]);

    const onOverviewDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        overviewDragRef.current = true;
        onOverviewPointer(e);
    }, [onOverviewPointer]);

    useEffect(() => {
        const up = () => {
            // ── Row reorder drag ──────────────────────────────────────────────
            if (lblDragRef.current !== null) {
                const dragRow = lblDragRef.current;
                const dropRow = dropLineRef.current;
                lblDragRef.current  = null;
                dropLineRef.current = null;
                if (lblRef.current) lblRef.current.style.cursor = 'grab';

                if (dropRow !== null && dropRow !== dragRow && dropRow !== dragRow + 1) {
                    const currentOrder = seqsRef.current.map(s => baseSeqsRef.current.indexOf(s));
                    const newOrder = [...currentOrder];
                    const [removed] = newOrder.splice(dragRow, 1);
                    newOrder.splice(dropRow > dragRow ? dropRow - 1 : dropRow, 0, removed);
                    setManualOrder(newOrder);
                    setSortKey('manual');
                }
                // redraw to clear drag state (use ref to get latest drawAll)
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(() => drawAllRef.current());
                return;
            }

            overviewDragRef.current = false;
            if (selAnchorRef.current) {
                if (!isDraggingSelRef.current) {
                    // plain click → clear selection
                    selectionRef.current = null;
                    setSelection(null);
                }
                selAnchorRef.current     = null;
                isDraggingSelRef.current = false;
            }
        };
        window.addEventListener('mouseup', up);
        return () => window.removeEventListener('mouseup', up);
    }, []);

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoomIdx(i => Math.min(CELL_STEPS.length - 1, i + 1)); }
                if (e.key === '-')                   { e.preventDefault(); setZoomIdx(i => Math.max(0, i - 1)); }
                if (e.key === 'f') {
                    e.preventDefault();
                    setShowGotoPos(false); setGotoPosValue('');
                    setShowSearch(v => {
                        if (!v) setTimeout(() => searchInputRef.current?.focus(), 50);
                        else setSearchQuery('');
                        return !v;
                    });
                }
                if (e.key === 'g') {
                    e.preventDefault();
                    setShowSearch(false); setSearchQuery('');
                    setShowGotoPos(v => {
                        if (!v) setTimeout(() => gotoPosInputRef.current?.focus(), 50);
                        else setGotoPosValue('');
                        return !v;
                    });
                }
                if (e.key === 'c' && selectionRef.current) {
                    e.preventDefault();
                    copySelectionAsFasta();
                }
                if (e.key === 'a') {
                    e.preventDefault();
                    const all = { r1: 0, r2: numRows - 1, c1: 0, c2: numCols - 1 };
                    selectionRef.current = all;
                    setSelection(all);
                }
            }
            if (e.key === 'Escape') {
                if (showSearch)  { setShowSearch(false);  setSearchQuery(''); }
                if (showGotoPos) { setShowGotoPos(false); setGotoPosValue(''); }
                if (selectionRef.current) { selectionRef.current = null; setSelection(null); }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [showSearch, showGotoPos, copySelectionAsFasta, numRows, numCols]);

    // ── Derived ───────────────────────────────────────────────────────────────
    const hRes   = hover ? (seqs[hover.row]?.seq[hover.col]?.toUpperCase() ?? '-') : null;
    const hBg    = hRes ? residueBg(hRes, isAminoAcid) : '';
    const hProp  = hRes ? residueProp(hRes, isAminoAcid) : '';
    const legend = isAminoAcid ? AA_LEGEND : NT_LEGEND;
    const totalW = numCols * cellSize;
    const totalH = numRows * cellSize;

    // ── Adaptive height ───────────────────────────────────────────────────────
    const canvasAreaH = Math.min(Math.max(numRows * cellSize, numRows > 0 ? 60 : 0), MAX_CANVAS_H);
    const idealHeight = TOOLBAR_H
        + (showSearch ? SEARCH_H : 0)
        + (showGotoPos ? GOTO_H : 0)
        + (showSort ? SORT_H : 0)
        + (showColorScheme ? COLORSCHEME_H : 0)
        + (showExport ? EXPORT_H : 0)
        + (showLegend ? LEGEND_H : 0)
        + AXIS_H
        + (!isAminoAcid && showLogo ? LOGO_H : 0)
        + canvasAreaH
        + (showConsensus ? cellSize : 0)
        + (showOverview ? OVERVIEW_H : 0)
        + STATUSBAR_H;

    // Conservation score at hovered column
    const hCons = hover ? conservation[hover.col] : null;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className={styles.wrapper} style={{ height: height ?? idealHeight }}>

            {/* ── Toolbar ───────────────────────────────────────────────────── */}
            <div className={styles.toolbar}>
                {/* Metric stats */}
                <div className={styles.metrics}>
                    <div className={styles.metric}>
                        <span className={styles.metricVal}>{numRows}</span>
                        <span className={styles.metricLbl}>sequences</span>
                    </div>
                    <span className={styles.metricSep} />
                    <div className={styles.metric}>
                        <span className={styles.metricVal}>{numCols}</span>
                        <span className={styles.metricLbl}>sites</span>
                    </div>
                    <span className={styles.metricSep} />
                    <div className={styles.metric}>
                        <span className={styles.metricVal}>
                            {numCols > 0 ? ((gapFreeCount / numCols) * 100).toFixed(1) : 0}%
                        </span>
                        <span className={styles.metricLbl}>gap-free</span>
                    </div>
                    <span className={`${styles.typePill} ${isAminoAcid ? styles.typeAA : styles.typeNT}`}>
                        {isAminoAcid ? 'Amino acids' : 'Nucleotides'}
                    </span>
                </div>

                {/* Controls */}
                <div className={styles.controls}>
                    <button
                        className={`${styles.iconBtn} ${showSearch ? styles.iconBtnOn : ''}`}
                        onClick={() => {
                            setShowGotoPos(false); setGotoPosValue('');
                            setShowSearch(v => { if (!v) setTimeout(() => searchInputRef.current?.focus(), 50); else setSearchQuery(''); return !v; });
                        }}
                        title="Search sequences (Ctrl+F)">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <circle cx="5.5" cy="5.5" r="3.8" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M8.5 8.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                    </button>
                    <button
                        className={`${styles.iconBtn} ${showGotoPos ? styles.iconBtnOn : ''}`}
                        onClick={() => {
                            setShowSearch(false); setSearchQuery('');
                            setShowGotoPos(v => { if (!v) setTimeout(() => gotoPosInputRef.current?.focus(), 50); else setGotoPosValue(''); return !v; });
                        }}
                        title="Jump to position (Ctrl+G)">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M2 6.5h9M8 3.5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                    <button
                        className={`${styles.iconBtn} ${showSort ? styles.iconBtnOn : (sortKey !== 'original' ? styles.iconBtnActive : '')}`}
                        onClick={() => setShowSort(v => !v)}
                        title="Sort sequences">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M2 3.5h9M2 6.5h6M2 9.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            <path d="M10.5 7v4.5M8.5 9.5l2 2 2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                    <button
                        className={`${styles.iconBtn} ${showColorScheme ? styles.iconBtnOn : (colorScheme !== 'residue' ? styles.iconBtnActive : '')}`}
                        onClick={() => setShowColorScheme(v => !v)}
                        title="Color scheme">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <circle cx="4"  cy="4"  r="2.2" fill="currentColor" opacity=".9"/>
                            <circle cx="9"  cy="4"  r="2.2" fill="currentColor" opacity=".55"/>
                            <circle cx="4"  cy="9"  r="2.2" fill="currentColor" opacity=".35"/>
                            <circle cx="9"  cy="9"  r="2.2" fill="currentColor" opacity=".18"/>
                        </svg>
                    </button>
                    <button
                        className={`${styles.iconBtn} ${showLegend ? styles.iconBtnOn : ''}`}
                        onClick={() => setShowLegend(v => !v)}
                        title="Toggle color legend">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <rect x="1" y="1" width="4" height="4" rx="1.2" fill="currentColor"/>
                            <rect x="8" y="1" width="4" height="4" rx="1.2" fill="currentColor" opacity=".6"/>
                            <rect x="1" y="8" width="4" height="4" rx="1.2" fill="currentColor" opacity=".4"/>
                            <rect x="8" y="8" width="4" height="4" rx="1.2" fill="currentColor" opacity=".2"/>
                        </svg>
                    </button>
                    <button
                        className={`${styles.iconBtn} ${showConsensus ? styles.iconBtnOn : ''}`}
                        onClick={() => setShowConsensus(v => !v)}
                        title="Toggle consensus row">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <rect x="1" y="1"   width="11" height="2" rx="0.5" fill="currentColor" opacity=".25"/>
                            <rect x="1" y="4.5" width="11" height="2" rx="0.5" fill="currentColor" opacity=".25"/>
                            <rect x="1" y="8"   width="11" height="2" rx="0.5" fill="currentColor" opacity=".25"/>
                            <rect x="1" y="10.5" width="11" height="2" rx="0.5" fill="currentColor"/>
                        </svg>
                    </button>
                    <button
                        className={`${styles.iconBtn} ${showOverview ? styles.iconBtnOn : ''}`}
                        onClick={() => setShowOverview((v: boolean) => !v)}
                        title="Toggle overview">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <rect x="1" y="4" width="11" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" opacity=".45"/>
                            <rect x="2" y="5" width="3" height="3" rx="0.4" fill="currentColor" opacity=".3"/>
                            <rect x="6" y="5" width="2" height="3" rx="0.4" fill="currentColor" opacity=".3"/>
                            <rect x="9" y="5" width="3" height="3" rx="0.4" fill="currentColor" opacity=".3"/>
                            <rect x="4" y="4" width="3" height="5" rx="0.4" stroke="currentColor" strokeWidth="1" fill="none"/>
                        </svg>
                    </button>
                    {!isAminoAcid && (
                        <button
                            className={`${styles.iconBtn} ${showLogo ? styles.iconBtnOn : ''}`}
                            onClick={() => setShowLogo(v => !v)}
                            title="Toggle sequence logo">
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                                <text x="0"   y="13" fontSize="9"   fontWeight="900" fontFamily="monospace" fill="currentColor" opacity="1">A</text>
                                <text x="6"   y="13" fontSize="6.5" fontWeight="900" fontFamily="monospace" fill="currentColor" opacity=".7">C</text>
                                <text x="9.5" y="13" fontSize="4"   fontWeight="900" fontFamily="monospace" fill="currentColor" opacity=".45">G</text>
                            </svg>
                        </button>
                    )}
                    <button
                        className={`${styles.iconBtn} ${showExport ? styles.iconBtnOn : ''}`}
                        onClick={() => setShowExport(v => !v)}
                        title="Export PNG">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <rect x="1" y="3.5" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                            <circle cx="6.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
                            <path d="M4.5 3.5l.7-1.5h2.6l.7 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                    <div className={styles.zoomWrap}>
                        <button className={styles.zoomBtn} disabled={zoomIdx === 0}
                                onClick={() => setZoomIdx(i => Math.max(0, i - 1))} title="Zoom out (Ctrl+−)">
                            <svg width="11" height="11" viewBox="0 0 11 11"><path d="M2.5 5.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
                        </button>
                        <input type="range" className={styles.zoomSlider}
                               min={0} max={CELL_STEPS.length - 1} value={zoomIdx}
                               onChange={e => setZoomIdx(Number(e.target.value))}
                        />
                        <button className={styles.zoomBtn} disabled={zoomIdx === CELL_STEPS.length - 1}
                                onClick={() => setZoomIdx(i => Math.min(CELL_STEPS.length - 1, i + 1))} title="Zoom in (Ctrl+=)">
                            <svg width="11" height="11" viewBox="0 0 11 11"><path d="M5.5 2.5v6M2.5 5.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
                        </button>
                        <span className={styles.zoomLabel}>{cellSize}px</span>
                    </div>
                </div>
            </div>

            {/* ── Search panel ──────────────────────────────────────────────── */}
            {showSearch && (
                <div className={styles.searchBar}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className={styles.searchIcon}>
                        <circle cx="5.5" cy="5.5" r="3.8" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M8.5 8.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <input
                        ref={searchInputRef}
                        type="text"
                        className={styles.searchInput}
                        placeholder="Filter sequences by name…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        spellCheck={false}
                    />
                    {searchQuery && (
                        <span className={`${styles.searchCount} ${matchRows.size === 0 ? styles.searchCountNone : ''}`}>
                            {matchRows.size === 0 ? 'No match' : `${matchRows.size} match${matchRows.size > 1 ? 'es' : ''}`}
                        </span>
                    )}
                    <button className={styles.searchClose}
                            onClick={() => { setShowSearch(false); setSearchQuery(''); }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                        </svg>
                    </button>
                </div>
            )}

            {/* ── Go to position panel ──────────────────────────────────────── */}
            {showGotoPos && (
                <div className={styles.searchBar}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className={styles.searchIcon}>
                        <path d="M2 6.5h9M8 3.5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className={styles.gotoPosLabel}>Go to position</span>
                    <input
                        ref={gotoPosInputRef}
                        type="number"
                        min={1}
                        max={numCols}
                        className={styles.gotoPosInput}
                        placeholder={`1 – ${numCols}`}
                        value={gotoPosValue}
                        onChange={e => setGotoPosValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') { jumpToPos(gotoPosValue); gotoPosInputRef.current?.blur(); }
                            if (e.key === 'Escape') { setShowGotoPos(false); setGotoPosValue(''); }
                        }}
                    />
                    <button
                        className={styles.gotoPosBtn}
                        disabled={!gotoPosValue}
                        onClick={() => jumpToPos(gotoPosValue)}
                    >
                        Jump
                    </button>
                    <button className={styles.searchClose}
                            onClick={() => { setShowGotoPos(false); setGotoPosValue(''); }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                        </svg>
                    </button>
                </div>
            )}

            {/* ── Sort panel ────────────────────────────────────────────────── */}
            {showSort && (
                <div className={styles.sortBar}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className={styles.searchIcon}>
                        <path d="M2 3.5h9M2 6.5h6M2 9.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <path d="M10.5 7v4.5M8.5 9.5l2 2 2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div className={styles.sortChips}>
                        {([
                            ['original', 'Original'],
                            ['name',     'Name'],
                            ['length',   'Length'],
                            ['gaps',     'Gap %'],
                            ['identity', 'Identity'],
                            ...(sortKey === 'manual' ? [['manual', 'Custom']] : []),
                        ] as [SortKey, string][]).map(([key, label]) => (
                            <button
                                key={key}
                                className={`${styles.sortChip} ${sortKey === key ? styles.sortChipActive : ''}`}
                                onClick={() => {
                                    if (key === 'original' || key === 'manual') { setSortKey('original'); setSortDir('asc'); }
                                    else if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                                    else { setSortKey(key); setSortDir('asc'); }
                                }}
                            >
                                {label}
                                {sortKey === key && key !== 'original' && key !== 'manual' && (
                                    <span className={styles.sortDirIcon}>
                                        {sortDir === 'asc' ? '↑' : '↓'}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                    {sortKey === 'identity' && baseSeqs.length > 0 && (
                        <>
                            <span className={styles.refLabel}>vs</span>
                            <select
                                className={styles.refSelect}
                                value={sortRefSeqName || baseSeqs[0]?.name || ''}
                                onChange={e => setSortRefSeqName(e.target.value)}
                            >
                                {baseSeqs.map((s, i) => (
                                    <option key={s.name} value={s.name}>
                                        {i + 1}. {s.name.length > 28 ? s.name.slice(0, 26) + '…' : s.name}
                                    </option>
                                ))}
                            </select>
                        </>
                    )}
                    <button className={styles.searchClose} onClick={() => setShowSort(false)}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                        </svg>
                    </button>
                </div>
            )}

            {/* ── Color scheme panel ────────────────────────────────────────── */}
            {showColorScheme && (
                <div className={styles.sortBar}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className={styles.searchIcon}>
                        <circle cx="4" cy="4" r="2.2" fill="currentColor" opacity=".9"/>
                        <circle cx="9" cy="4" r="2.2" fill="currentColor" opacity=".55"/>
                        <circle cx="4" cy="9" r="2.2" fill="currentColor" opacity=".35"/>
                        <circle cx="9" cy="9" r="2.2" fill="currentColor" opacity=".18"/>
                    </svg>
                    <div className={styles.sortChips}>
                        {([
                            ['residue',      'By residue'],
                            ['conservation', 'By conservation'],
                            ['identity',     'By identity'],
                            ['mono',         'Monochrome'],
                        ] as [ColorScheme, string][]).map(([key, label]) => (
                            <button
                                key={key}
                                className={`${styles.sortChip} ${colorScheme === key ? styles.sortChipActive : ''}`}
                                onClick={() => setColorScheme(key)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    {colorScheme === 'identity' && seqs.length > 0 && (
                        <>
                            <span className={styles.refLabel}>vs</span>
                            <select
                                className={styles.refSelect}
                                value={refSeqName || seqs[0]?.name || ''}
                                onChange={e => setRefSeqName(e.target.value)}
                            >
                                {seqs.map((s, i) => (
                                    <option key={s.name} value={s.name}>
                                        {i + 1}. {s.name.length > 28 ? s.name.slice(0, 26) + '…' : s.name}
                                    </option>
                                ))}
                            </select>
                        </>
                    )}
                    <button className={styles.searchClose} onClick={() => setShowColorScheme(false)}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                        </svg>
                    </button>
                </div>
            )}

            {/* ── Export panel ──────────────────────────────────────────────── */}
            {showExport && (
                <div className={styles.sortBar}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className={styles.searchIcon}>
                        <rect x="1" y="3.5" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                        <circle cx="6.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
                        <path d="M4.5 3.5l.7-1.5h2.6l.7 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <button className={styles.exportBtn} onClick={exportViewAsPng} title="Export the current viewport as PNG">
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                            <path d="M5.5 1v6.5M3 5.5l2.5 2.5L8 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M1 9.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        Export view
                    </button>
                    <button
                        className={styles.exportBtn}
                        onClick={exportSelectionAsPng}
                        disabled={!selection}
                        title={selection ? `Export selection (${selection.r2 - selection.r1 + 1} × ${selection.c2 - selection.c1 + 1}) as PNG` : 'No selection — drag to select a region first'}>
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                            <rect x="1" y="1" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5"/>
                            <path d="M3.5 5.5l1.5 1.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {selection
                            ? `Export selection (${selection.r2 - selection.r1 + 1}×${selection.c2 - selection.c1 + 1})`
                            : 'Export selection'}
                    </button>
                    <button className={styles.searchClose} onClick={() => setShowExport(false)}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                        </svg>
                    </button>
                </div>
            )}

            {/* ── Legend ────────────────────────────────────────────────────── */}
            {showLegend && (
                <div className={styles.legend}>
                    <span className={styles.legendTitle}>{isAminoAcid ? 'Amino acids' : 'Nucleotides'}</span>
                    <span className={styles.legendDivider} />
                    {legend.map(item => (
                        <span key={item.label} className={styles.legendItem}>
                            <span className={styles.legendDot} style={{ background: item.color }} />
                            {item.label}
                        </span>
                    ))}
                    <span className={styles.legendItem}>
                        <span className={styles.legendDash} />
                        Gap
                    </span>
                </div>
            )}

            {/* ── Canvas grid ───────────────────────────────────────────────── */}
            <div className={styles.grid} ref={gridRef}>
                <div className={styles.labelCol} style={{ width: labelWidth }}>
                    <div className={styles.corner} style={{ height: AXIS_H }} />
                    {!isAminoAcid && showLogo && (
                        <div className={styles.consLabel} style={{ height: LOGO_H }}>
                            LOGO
                        </div>
                    )}
                    <canvas ref={lblRef} className={styles.canvas} style={{ cursor: 'grab' }} onMouseDown={onLblMouseDown} />
                    {showConsensus && (
                        <div className={styles.consensusLabel} style={{ height: cellSize }}>
                            <span className={styles.consensusBadge}>Consensus</span>
                        </div>
                    )}
                    {showOverview && (
                        <div className={styles.overviewLabel} style={{ height: OVERVIEW_H }}>
                            MAP
                        </div>
                    )}
                </div>
                <div className={styles.rightCol}>
                    <canvas ref={axRef} className={styles.canvas} />
                    {!isAminoAcid && showLogo && (
                        <canvas ref={logoRef} className={styles.canvas} />
                    )}
                    <div className={styles.scrollArea}>
                        <div ref={sentinelRef} className={styles.sentinel}
                             onScroll={onScroll}
                             onMouseDown={onSentinelMouseDown}
                             onMouseMove={onMouseMove}
                             onMouseLeave={onMouseLeave}>
                            <div style={{ width: totalW, height: totalH }} />
                        </div>
                        <canvas ref={mainRef} className={styles.mainCanvas} />
                    </div>
                    {showConsensus && (
                        <canvas ref={consensusRowRef} className={styles.canvas} />
                    )}
                    {showOverview && (
                        <canvas
                            ref={overviewRef}
                            className={styles.overviewCanvas}
                            onMouseDown={onOverviewDown}
                            onMouseMove={e => { if (overviewDragRef.current) onOverviewPointer(e); }}
                        />
                    )}
                </div>
            </div>

            {/* ── Status bar ────────────────────────────────────────────────── */}
            <div className={styles.statusBar}>
                {selection ? (
                    <div className={styles.statusContent}>
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0, color: 'var(--clr-text-muted, #94a3b8)' }}>
                            <rect x="1" y="1" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5"/>
                        </svg>
                        <span className={styles.statusSelInfo}>
                            {selection.r2 - selection.r1 + 1} seq × {selection.c2 - selection.c1 + 1} pos
                        </span>
                        <span className={styles.statusSep} />
                        <span className={styles.statusPos}>col {selection.c1 + 1}–{selection.c2 + 1}</span>
                        <button
                            className={`${styles.selCopyBtn} ${copiedFeedback ? styles.selCopyBtnDone : ''}`}
                            onClick={copySelectionAsFasta}
                            title="Copy as FASTA (Ctrl+C)">
                            {copiedFeedback ? (
                                <>
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5L8.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    Copied!
                                </>
                            ) : (
                                <>
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="3.5" y="1" width="5.5" height="6.5" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M1 3.5v5.5h5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                                    Copy FASTA
                                </>
                            )}
                        </button>
                        <button className={styles.selClearBtn} onClick={() => { selectionRef.current = null; setSelection(null); }} title="Clear selection (Esc)">
                            <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 1.5l6 6M7.5 1.5l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                    </div>
                ) : hover && hRes ? (
                    <div className={styles.statusContent}>
                        <span className={styles.statusSeq}>{seqs[hover.row]?.name}</span>
                        <span className={styles.statusSep} />
                        <span className={styles.statusPos}>pos {hover.col + 1}</span>
                        {hCons && (
                            <>
                                <span className={styles.statusSep} />
                                <span className={styles.statusCons}
                                      style={{ '--cons-pct': hCons.score } as React.CSSProperties}>
                                    {Math.round(hCons.score * 100)}% cons
                                </span>
                            </>
                        )}
                        <span className={styles.statusSep} />
                        <span className={styles.statusRes}
                              style={{ background: hBg || 'rgba(100,116,139,0.18)', color: hBg ? '#fff' : '#64748b' }}>
                            {hRes}
                        </span>
                        {hProp && <span className={styles.statusProp}>{hProp}</span>}
                    </div>
                ) : (
                    <span className={styles.statusHint}>
                        Drag to select · <kbd className={styles.kbd}>Ctrl+A</kbd> select all · <kbd className={styles.kbd}>Ctrl+F</kbd> search · <kbd className={styles.kbd}>Ctrl+G</kbd> go to · <kbd className={styles.kbd}>Ctrl+scroll</kbd> zoom
                    </span>
                )}
                <span className={styles.statusRight}>
                    {!selection && hover && <span className={styles.statusCoord}>row {hover.row + 1} · col {hover.col + 1}</span>}
                </span>
            </div>

        </div>
    );
}
