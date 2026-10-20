# dsh-seq-viewer · Sequence alignment sidebar

[简体中文](README.md) | [English](README.en.md)

Version **0.1.0**

A DeepSeek Harness (DSH) web and desktop plugin that opens sequence alignments in the right sidebar. In DSH's built-in **Workspace Files** tree, click a FASTA, CLUSTAL, PHYLIP, Stockholm, or similar alignment file and it opens in a **Sequence alignment** tab in the right sidebar. Files are read locally and are never uploaded.

The viewer is adapted from [ReSeqt 1.0.1](https://reseqt.vaaloo.fr) by vaaloo (Valentin Gorgodian), MIT. It keeps the upstream canvas rendering, residue / conservation / identity / monochrome color schemes, conservation histogram, consensus row, sequence logo, search, sorting, reference sequence, go-to-position, zoom, selection copy, overview map, and PNG export.

---

## Features

- **Open from Workspace Files**: alignment files in DSH's Workspace Files tree are opened through the resource router. The plugin registers a `sequence-alignment` tab type at the `extension` priority, above the built-in text preview.
- **Part of the right sidebar**: the viewer renders in a right-sidebar tab alongside Files and Terminal. Tabs can be switched, closed, and split; `keepMounted` preserves the alignment and view state.
- **Configurable formats**: the green **Seq** button in the Workspace Files header opens a format panel. Common globs are all checked by default, and custom globs can be added; changes apply immediately.
- **Multiple alignment formats**: FASTA (including A2M/A3M) is shown directly; CLUSTAL W / MUSCLE, PHYLIP (interleaved or sequential), and Stockholm are converted to FASTA in the browser. Matching `.gz` files are supported.
- **Nucleotide / protein detection**: inferred from the proportion of protein-specific residues; `.faa`, `.aa`, `.prot`, and `.pep` suffixes are treated as protein. The color scheme can be changed at any time in the viewer.
- **Session-authorized reads only**: the browser reads bytes through `remote.workspaceFiles.readBytes(sessionId, path, {}, signal)` (32 MB default cap). The plugin adds no server route and uploads nothing.
- **File change prompt**: the tab observes the file's `version` through `resources`; when the file changes on disk it shows “File changed — reload” instead of silently reparsing.
- **Dark theme sync**: the current DSH theme (`color-scheme` or page background) is read from the host and sent to the viewer on load and on theme changes.
- **Narrow sidebar support**: below 760 px the toolbar tightens and hides duplicate metrics (the tab bar still shows the summary); the legend scrolls horizontally.
- **Right-click Open With**: a sequence tab's context menu lists other internal tab types (the built-in text preview and other plugins) and desktop applications discovered by DSH. External opening uses `remote.session.workspacePathApplications/openWorkspacePath`, with “Show file location” as a fallback.
- **Fallback on failure**: an unrecognized format, empty file, or oversized file shows a localized error card with **Open as text** and **Retry**.

## Default formats

| Format | Default globs |
|---|---|
| FASTA (including A2M/A3M) | `*.fasta` `*.fa` `*.fna` `*.faa` `*.fas` `*.fsa` `*.mfa` `*.afa` |
| General alignments | `*.aln` `*.msa` `*.a2m` `*.a3m` |
| PHYLIP | `*.phy` `*.phylip` `*.ph` |
| CLUSTAL | `*.clustal` `*.clw` |
| Stockholm | `*.sto` `*.stockholm` `*.st` |
| gzip compressed | the `.gz` form of every glob above (e.g. `*.fasta.gz`, `*.phy.gz`) |

The format is detected from the file content; extensions are only used to decide whether the plugin claims a file. `.txt` is intentionally not claimed so generic text files continue to use DSH's built-in preview.

## Format settings

Click the green **Seq** button (DNA helix icon) in the Workspace Files header.

- **Common globs**: six groups — FASTA/sequences, general alignments, PHYLIP, CLUSTAL, Stockholm, and gzip — with 40 globs, **all checked by default**.
- **Select all / Select none / Reset**: one-click adjustment. With everything cleared the plugin claims no files.
- **Custom globs**: one per line, `*` wildcards supported (e.g. `*.seq`, `*.alignment.txt`); lines starting with `#` are comments; `/` and `\` are rejected.
- **Applies immediately**: saving re-registers the sidebar tab type; files opened afterwards use the new rules. Already-open tabs are unaffected.
- The configuration is stored in browser `localStorage` under `dsh-seq-viewer:formats:v1`, per browser / DSH profile.

## Examples

The `examples/` directory contains six ready-to-open files:

| File | Purpose |
|---|---|
| [`examples/demo_alignment.fasta`](examples/demo_alignment.fasta) | 8 nucleotide sequences × 60 columns, with variable sites and gaps |
| [`examples/demo_alignment_aa.fasta`](examples/demo_alignment_aa.fasta) | 6 protein sequences × 60 columns, for the protein palette |
| [`examples/demo_alignment.aln`](examples/demo_alignment.aln) | CLUSTAL W block format |
| [`examples/demo_alignment.phy`](examples/demo_alignment.phy) | Interleaved PHYLIP |
| [`examples/demo_alignment.sto`](examples/demo_alignment.sto) | Stockholm 1.0 |
| [`examples/demo_alignment.fasta.gz`](examples/demo_alignment.fasta.gz) | gzip-compressed FASTA |

Copy them into any DSH workspace, or open your own alignment files.

## Installation

### Desktop (DSH NEXT)

- In DSH's **Plugins** page, install from a local folder: `/absolute/path/to/dsh-seq-viewer`; or
- Quit DSH NEXT and use the desktop application's bundled plugin installer (`resources/app.asar/lib/plugin-cli.js`) with the `desktop` profile.

Restart DSH NEXT after installation. The public `dsh` CLI does not operate on the reserved `desktop` profile.

### Other profiles (e.g. `dsh web`)

```sh
dsh plugin --profile <profile> add file:/absolute/path/to/dsh-seq-viewer
```

Restart the profile and refresh the page.

Uninstall:

```sh
dsh plugin --profile <profile> remove dsh-seq-viewer
```

## Usage

1. Open the right sidebar in a session → **Workspace Files**.
2. Click `demo_alignment.fasta`, `demo_alignment.aln`, or another alignment file.
3. A tab with the same name opens in the right sidebar and renders the alignment. Drag the sidebar edge to widen it.
4. The toolbar provides search (Ctrl+F), go to position (Ctrl+G), sorting, color schemes, legend, consensus row, overview map, sequence logo, PNG export, and 7 zoom levels (Ctrl+scroll).
5. The `↻` button re-reads the file. When the file changes on disk, a “File changed — reload” prompt appears.
6. Right-click a sequence tab → **Open with**: choose another internal tab type (the built-in text preview, other plugins), or a desktop application discovered by DSH. “Show file location” is available as a fallback.

## Implementation

```
Workspace Files row
  └─ tab.actions.openResource('dsh-resource://file/session/<id>/<path>')
       └─ ctx.sidebarRightTabs routing: configured globs, extension priority
            └─ sidebar.right.pane.tab body (lib/client.js)
                 ├─ parse address → sessionId + path
                 ├─ remote.workspaceFiles.readBytes(...) (RemoteResult unwrapping)
                 ├─ gzip inflate + UTF-8 decode, format detection, FASTA normalization, AA/NT detection
                 ├─ useResource(address) watches version → file change prompt
                 └─ Blob iframe (single-file viewer-app build)
                      └─ ready → postMessage({ type: 'dsh-seq-viewer:load', payload: { fasta, isAminoAcid, theme } })

Format settings (sidebar.right.tab.files.actions)
  └─ presets / custom globs → localStorage → re-register the sidebarRightTabs type

Sequence tab context menu (sidebar.right.tab.menu.item)
  ├─ sidebarRightTabs.candidates(address) → other internal tab types
  └─ remote.session.workspacePathApplications/openWorkspacePath → desktop app / default app / reveal
```

## Coexistence with dsh-phylo-viewer

Both plugins claim files from Workspace Files by extension, and both put a settings button in the files header:

| Plugin | Button | Configuration key |
|---|---|---|
| `dsh-seq-viewer` | green **Seq** + DNA icon | `dsh-seq-viewer:formats:v1` |
| `dsh-phylo-viewer` | neutral tree/format icon (icon only) | `dsh-phylo-viewer:formats:v2` |

The buttons use different DOM ids, CSS prefixes, icons, titles, and storage keys, so they can be displayed together and opened independently. Do not tick the same extension in both plugins: an extension cannot distinguish an alignment `.phy` from a tree `.phy`, and the first matching plugin will claim the file.

## Privacy

- Alignment files are read through DSH's session authorization and parsed locally in the browser; nothing is uploaded.
- The plugin adds no server routes and contains no telemetry or analytics.
- Only format preferences are stored in browser `localStorage`; clearing site data restores the defaults.

## Development

Node.js 20 or newer is required.

```sh
cd viewer-app && npm install
cd .. && npm run build:viewer    # build viewer-app and embed it into lib/client.js
npm test                         # 27 tests: address parsing, format conversion, gzip, settings, tab registration, context menu
```

`lib/client.js` is generated; do not edit it by hand. Edit `scripts/client.template.js` or `viewer-app/` and rebuild.

## License and attribution

- Plugin glue: MIT, see [LICENSE](LICENSE).
- Viewer adapted from [ReSeqt 1.0.1](https://github.com/vaaloo/reseqt), MIT. See [LICENSE.reseqt](LICENSE.reseqt) and [NOTICE](NOTICE) for the adaptation notes.
- The embedded viewer includes React 19 (MIT, Copyright Meta Platforms, Inc. and affiliates). See [LICENSE.react](LICENSE.react).
