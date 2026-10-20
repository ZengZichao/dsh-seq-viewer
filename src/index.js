/**
 * dsh-seq-viewer — host half.
 *
 * The viewer is fully self-contained in the browser bundle (ReSeqt in a Blob
 * iframe), so the host has no route or filesystem work to do. This entry
 * exists so the Loader enables the package and its `dsh.client` half is
 * composed into the page.
 */

export const name = 'dsh-seq-viewer'

export function apply(ctx) {
  ctx.logger?.info?.('[dsh-seq-viewer] client-side alignment viewer ready')
}
