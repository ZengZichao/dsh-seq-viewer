export type Seq = { name: string; seq: string };

export function parseFasta(text: string): Seq[] {
    const out: Seq[] = [];
    for (const block of text.trim().split(/^>/m).filter(Boolean)) {
        const nl = block.indexOf('\n');
        if (nl < 0) continue;
        const name = block.slice(0, nl).trim();
        const seq  = block.slice(nl + 1).replace(/\s+/g, '');
        if (name && seq) out.push({ name, seq });
    }
    return out;
}
