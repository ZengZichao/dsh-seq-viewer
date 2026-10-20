import { useMemo } from "react";
import { ReSeqt } from "./reseqt/ReSeqt";
import { parseFasta } from "./reseqt/fasta";

export type LoadPayload = { fasta: string; label?: string; isAminoAcid?: boolean };

export function alignmentStats(fasta: string): { sequences: number; columns: number } {
  const seqs = parseFasta(fasta);
  const columns = seqs.reduce((max, entry) => Math.max(max, entry.seq.length), 0);
  return { sequences: seqs.length, columns };
}

export function App({ payload }: { payload: LoadPayload }) {
  const fasta = payload.fasta;
  const seqs = useMemo(() => parseFasta(fasta), [fasta]);
  const columns = useMemo(
    () => seqs.reduce((max, entry) => Math.max(max, entry.seq.length), 0),
    [seqs],
  );

  return (
    <div className="dsh-seq-app">
      <ReSeqt fasta={fasta} isAminoAcid={payload.isAminoAcid === true} />
      <span className="dsh-seq-sr" aria-live="polite">
        {seqs.length} sequences, {columns} columns
      </span>
    </div>
  );
}
