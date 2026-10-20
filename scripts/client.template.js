/**
 * dsh-seq-viewer — browser half.
 *
 * Registers a right-sidebar tab type for sequence alignment files. The DSH
 * `workspace.files` tree opens such a file through the ordinary resource
 * router; this type wins for alignment extensions, converts FASTA / CLUSTAL /
 * PHYLIP / Stockholm text to FASTA, and hands it to the embedded ReSeqt
 * viewer over a small postMessage protocol.
 *
 * Plain, no-build JavaScript: the dsh client-modules protocol loads this file
 * as-is.
 */

window.__ModuleLoader__.load({
  id: 'dsh-seq-viewer',
  factory: (require) => {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    const NS = 'dsh-seq-viewer'
    const TYPE_ID = 'dsh-seq-viewer'
    const KIND = 'sequence-alignment'
    const PROTOCOL = 'dsh-seq-viewer'
    const VIEWER_HTML = __VIEWER_HTML__
    const MAX_BYTES = 64 * 1024 * 1024
    const MAX_INFLATED_BYTES = 256 * 1024 * 1024

    // `.txt` is intentionally left out so the plugin never claims generic
    // text; the built-in document preview keeps handling those files.
    const PRESET_GROUPS = [
      {
        id: 'fasta',
        label: 'groupFasta',
        patterns: ['*.fasta', '*.fa', '*.fna', '*.faa', '*.fas', '*.fsa', '*.mfa', '*.afa'],
      },
      {
        id: 'alignment',
        label: 'groupAlignment',
        patterns: ['*.aln', '*.msa', '*.a2m', '*.a3m'],
      },
      {
        id: 'phylip',
        label: 'groupPhylip',
        patterns: ['*.phy', '*.phylip', '*.ph'],
      },
      {
        id: 'clustal',
        label: 'groupClustal',
        patterns: ['*.clustal', '*.clw'],
      },
      {
        id: 'stockholm',
        label: 'groupStockholm',
        patterns: ['*.sto', '*.stockholm', '*.st'],
      },
    ]
    const BASE_ALIGNMENT_PATTERNS = PRESET_GROUPS.flatMap((group) => group.patterns)
    PRESET_GROUPS.push({
      id: 'gzip',
      label: 'groupGzip',
      patterns: BASE_ALIGNMENT_PATTERNS.map((pattern) => pattern + '.gz'),
    })
    const DEFAULT_ALIGNMENT_PATTERNS = PRESET_GROUPS.flatMap((group) => group.patterns)
    const PRESET_PATTERN_SET = new Set(DEFAULT_ALIGNMENT_PATTERNS)
    const FORMATS_KEY = 'dsh-seq-viewer:formats:v1'

    const FILE_PREFIX = 'dsh-resource://file/'

    const CSS = `
      .dsh-seq-root {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--dsw-alias-bg-layer-1, #ffffff);
        color: var(--dsw-alias-label-primary, #1b1b1f);
        font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .dsh-seq-bar {
        flex: none;
        display: flex;
        align-items: center;
        gap: 8px;
        height: 32px;
        padding: 0 8px 0 10px;
        border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.22));
        background: var(--dsw-alias-bg-layer-1, #ffffff);
        user-select: none;
      }
      .dsh-seq-name {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 500;
      }
      .dsh-seq-meta {
        flex: none;
        color: var(--dsw-alias-label-tertiary, rgba(90, 90, 100, 0.8));
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .dsh-seq-meta-format {
        flex: none;
        height: 18px;
        padding: 0 6px;
        border-radius: 5px;
        background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.12));
        color: var(--dsw-alias-label-tertiary, rgba(90, 90, 100, 0.85));
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.02em;
        line-height: 18px;
      }
      .dsh-seq-dot {
        flex: none;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--dsw-alias-label-tertiary, #a0a0a8);
      }
      .dsh-seq-dot[data-state="ready"] { background: #2f9e63; }
      .dsh-seq-dot[data-state="error"] { background: #d64545; }
      .dsh-seq-dot[data-state="reading"] { background: #d99a2b; }
      .dsh-seq-reload {
        flex: none;
        width: 24px;
        height: 24px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 15px;
        line-height: 1;
      }
      .dsh-seq-reload:hover,
      .dsh-seq-reload:focus-visible {
        background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.14));
        outline: none;
      }
      .dsh-seq-stale {
        flex: none;
        height: 22px;
        padding: 0 7px;
        border: 1px solid rgba(217, 154, 43, 0.55);
        border-radius: 6px;
        background: rgba(217, 154, 43, 0.12);
        color: var(--dsw-alias-label-primary, #6b4a00);
        font: inherit;
        font-size: 11px;
        cursor: pointer;
        white-space: nowrap;
      }
      .dsh-seq-stale:hover { background: rgba(217, 154, 43, 0.2); }
      .dsh-seq-menu {
        display: flex;
        flex-direction: column;
        gap: 2px;
        width: 100%;
        min-width: 190px;
        max-height: 320px;
        overflow-y: auto;
        padding: 3px 0;
      }
      .dsh-seq-menu-title {
        padding: 3px 8px 2px;
        font-size: 10.5px;
        font-weight: 600;
        color: var(--dsw-alias-label-tertiary, rgba(90, 90, 100, 0.8));
      }
      .dsh-seq-menu-item {
        display: flex;
        align-items: center;
        gap: 7px;
        width: 100%;
        min-height: 28px;
        padding: 0 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .dsh-seq-menu-item:hover,
      .dsh-seq-menu-item:focus-visible {
        background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.14));
        outline: none;
      }
      .dsh-seq-menu-item:disabled { opacity: 0.5; cursor: default; }
      .dsh-seq-menu-item img { flex: none; width: 16px; height: 16px; }
      .dsh-seq-menu-sep {
        height: 1px;
        margin: 4px 6px;
        background: var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.22));
      }
      .dsh-seq-menu-note {
        padding: 3px 8px;
        font-size: 10.5px;
        line-height: 1.4;
        color: var(--dsw-alias-label-tertiary, rgba(90, 90, 100, 0.8));
      }
      .dsh-seq-menu-error { color: #c43d3d; }
      .dsh-seq-formats-btn {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 24px;
        padding: 0 8px;
        border: 1px solid rgba(5, 150, 105, 0.3);
        border-radius: 6px;
        background: rgba(5, 150, 105, 0.09);
        color: var(--dsw-alias-label-primary, #047857);
        font: inherit;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }
      .dsh-seq-formats-btn:hover,
      .dsh-seq-formats-btn:focus-visible {
        background: rgba(5, 150, 105, 0.17);
        outline: none;
      }
      .dsh-seq-formats-label { line-height: 1; }
      .dsh-seq-format-mask {
        position: fixed;
        inset: 0;
        z-index: 1200;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(0, 0, 0, 0.32);
      }
      .dsh-seq-format-modal {
        display: flex;
        flex-direction: column;
        width: min(580px, 100%);
        max-height: 82vh;
        box-sizing: border-box;
        border-radius: 12px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.26));
        background: var(--dsw-alias-bg-overlay, #ffffff);
        color: var(--dsw-alias-label-primary, #1b1b1f);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
        font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .dsh-seq-format-head {
        flex: none;
        padding: 14px 16px 8px;
      }
      .dsh-seq-format-title {
        margin: 0 0 4px;
        font-size: 14px;
        font-weight: 600;
      }
      .dsh-seq-format-hint {
        margin: 0;
        font-size: 11.5px;
        color: var(--dsw-alias-label-tertiary, rgba(90, 90, 100, 0.82));
      }
      .dsh-seq-format-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 4px 16px 8px;
      }
      .dsh-seq-format-tools {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 4px 0 10px;
      }
      .dsh-seq-format-tool {
        height: 24px;
        padding: 0 8px;
        border-radius: 6px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.26));
        background: var(--dsw-alias-bg-layer-2, #f4f4f6);
        color: inherit;
        font: inherit;
        font-size: 11px;
        cursor: pointer;
      }
      .dsh-seq-format-tool:hover { background: var(--dsw-alias-bg-layer-3, #ececef); }
      .dsh-seq-format-group { margin: 0 0 8px; }
      .dsh-seq-format-group-title {
        margin: 0 0 4px;
        font-size: 11px;
        font-weight: 600;
        color: var(--dsw-alias-label-secondary, #4a4a52);
      }
      .dsh-seq-format-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 2px 8px;
      }
      .dsh-seq-format-check {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 24px;
        padding: 0 4px;
        border-radius: 5px;
        cursor: pointer;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 11px;
      }
      .dsh-seq-format-check:hover { background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.12)); }
      .dsh-seq-format-check input { flex: none; margin: 0; }
      .dsh-seq-format-custom {
        width: 100%;
        box-sizing: border-box;
        min-height: 84px;
        margin-top: 4px;
        padding: 8px;
        border-radius: 7px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.3));
        background: var(--dsw-alias-bg-layer-1, #ffffff);
        color: inherit;
        font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        resize: vertical;
      }
      .dsh-seq-format-custom:focus { outline: 1px solid #059669; border-color: transparent; }
      .dsh-seq-format-status {
        margin: 8px 0 0;
        font-size: 11px;
        color: var(--dsw-alias-label-tertiary, rgba(90, 90, 100, 0.82));
      }
      .dsh-seq-format-error { color: #c43d3d; }
      .dsh-seq-format-foot {
        flex: none;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 10px 16px 14px;
        border-top: 1px solid var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.16));
      }
      .dsh-seq-format-primary {
        border-color: transparent;
        background: #059669;
        color: #ffffff;
      }
      .dsh-seq-format-primary:hover { background: #047857; }
      .dsh-seq-stage {
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
      }
      .dsh-seq-frame {
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
        background: #ffffff;
      }
      .dsh-seq-overlay {
        position: absolute;
        inset: 0;
        z-index: 3;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #ffffff) 82%, transparent);
        backdrop-filter: blur(2px);
      }
      .dsh-seq-card {
        width: min(380px, 100%);
        box-sizing: border-box;
        padding: 16px 18px;
        border-radius: 12px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.26));
        background: var(--dsw-alias-bg-overlay, #ffffff);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
        text-align: left;
      }
      .dsh-seq-card-title {
        margin: 0 0 6px;
        font-size: 13px;
        font-weight: 600;
      }
      .dsh-seq-card-file {
        margin: 0 0 8px;
        font-size: 11.5px;
        color: var(--dsw-alias-label-tertiary, rgba(90, 90, 100, 0.82));
        overflow-wrap: anywhere;
      }
      .dsh-seq-card-msg {
        margin: 0 0 12px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--dsw-alias-label-secondary, #4a4a52);
        overflow-wrap: anywhere;
      }
      .dsh-seq-card-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .dsh-seq-retry {
        height: 28px;
        padding: 0 12px;
        border-radius: 7px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(128, 128, 128, 0.3));
        background: var(--dsw-alias-bg-layer-2, #f4f4f6);
        color: inherit;
        font: inherit;
        cursor: pointer;
      }
      .dsh-seq-retry:hover { background: var(--dsw-alias-bg-layer-3, #ececef); }
      @media (max-width: 560px) {
        .dsh-seq-meta-format { display: none; }
      }
    `

    const zh = {
      typeTitle: '序列比对',
      reading: '正在读取文件',
      ready: '已加载',
      failed: '读取失败',
      errorTitle: '无法打开序列比对',
      errorGeneric: '读取文件失败。',
      errorNotFound: '文件不存在，或已在此工作区中被移动。',
      errorTooLarge: '文件超过 32 MB，侧边栏无法一次读取。',
      errorNotText: '该文件不是可读取的 UTF-8 文本。',
      errorNotRegular: '该路径不是普通文件。',
      errorOutside: '此文件不在可读取的工作区范围内。',
      errorEmpty: '文件为空，没有可显示的序列。',
      errorDecode: '文件不是有效的 UTF-8 文本，无法解析序列比对。',
      errorAddress: '这个标签页没有携带可读取的文件地址。',
      errorUnsupported: '无法识别这个文件的比对格式。目前支持 FASTA、CLUSTAL、PHYLIP 与 Stockholm。',
      errorNoSequences: '文件中没有找到可显示的序列记录。',
      viewerError: '序列查看器无法显示这个文件',
      retry: '重试',
      reload: '重新读取文件',
      openAsText: '用文本预览打开',
      openWith: '打开方式',
      internalOpeners: '内置 / 插件',
      externalOpeners: '本机应用',
      noApps: '未找到此文件类型的本机关联程序',
      openDefault: '用系统默认程序打开',
      reveal: '显示文件位置',
      openFailed: '打开失败',
      fileChanged: '文件已变化',
      fileChangedReload: '文件已变化，重新加载',
      gzipUnsupported: '当前环境不支持 gzip 解压。',
      gzipInvalid: 'gzip 文件损坏或不是有效的 gzip 数据。',
      gzipTooLarge: '解压后的内容超过 256 MB，无法在侧边栏中打开。',
      defaultAppSuffix: '（默认）',
      summaryTemplate: '{sequences} 序列 × {columns} 列',
      formatFasta: 'FASTA',
      formatClustal: 'CLUSTAL',
      formatPhylip: 'PHYLIP',
      formatStockholm: 'Stockholm',
      formatsButton: '序列比对文件格式设置',
      formatsLabel: '序列',
      formatsTitle: '序列比对格式',
      formatsHint: '勾选常用格式，或在下方自行填写 glob（每行一个）。默认全部勾选。',
      formatsCustom: '自定义 glob',
      formatsCustomPlaceholder: '*.seq\n*.alignment',
      formatsSelectAll: '全选',
      formatsSelectNone: '全不选',
      formatsReset: '恢复默认',
      formatsCancel: '取消',
      formatsSave: '保存',
      formatsActive: '{count} 个格式已启用',
      formatsDisabled: '未启用任何格式，本插件暂不认领文件。',
      formatsInvalid: '自定义 glob 不能包含路径分隔符（/ 或 \\）。',
      formatsNote: '保存后立即生效；已打开的标签不受影响。请勿在 dsh-phylo-viewer 中勾选相同的扩展名。',
      groupFasta: 'FASTA / 序列',
      groupAlignment: '通用比对',
      groupPhylip: 'PHYLIP',
      groupClustal: 'CLUSTAL',
      groupStockholm: 'Stockholm',
      groupGzip: 'gzip 压缩',
    }

    const en = {
      typeTitle: 'Sequence alignment',
      reading: 'Reading file',
      ready: 'Loaded',
      failed: 'Read failed',
      errorTitle: 'Cannot open sequence alignment',
      errorGeneric: 'The file could not be read.',
      errorNotFound: 'The file is missing or has been moved in this workspace.',
      errorTooLarge: 'The file exceeds the 32 MB single-read limit.',
      errorNotText: 'The file is not readable UTF-8 text.',
      errorNotRegular: 'The path is not a regular file.',
      errorOutside: 'The file is outside the readable workspace scope.',
      errorEmpty: 'The file is empty; there are no sequences to display.',
      errorDecode: 'The file is not valid UTF-8 text and cannot be parsed as an alignment.',
      errorAddress: 'This tab does not carry a readable file address.',
      errorUnsupported: 'Unrecognized alignment format. FASTA, CLUSTAL, PHYLIP and Stockholm are supported.',
      errorNoSequences: 'No sequence records were found in this file.',
      viewerError: 'The sequence viewer could not display this file',
      retry: 'Retry',
      reload: 'Read the file again',
      openAsText: 'Open as text',
      openWith: 'Open with',
      internalOpeners: 'Built-in / plugins',
      externalOpeners: 'Applications',
      noApps: 'No associated application for this file type',
      openDefault: 'Open with the default application',
      reveal: 'Show file location',
      openFailed: 'Could not open the file',
      fileChanged: 'File changed',
      fileChangedReload: 'File changed — reload',
      gzipUnsupported: 'This environment does not support gzip decompression.',
      gzipInvalid: 'The gzip file is damaged or is not valid gzip data.',
      gzipTooLarge: 'The decompressed content exceeds 256 MB and cannot open in the sidebar.',
      defaultAppSuffix: ' (default)',
      summaryTemplate: '{sequences} seq × {columns} cols',
      formatFasta: 'FASTA',
      formatClustal: 'CLUSTAL',
      formatPhylip: 'PHYLIP',
      formatStockholm: 'Stockholm',
      formatsButton: 'Alignment file format settings',
      formatsLabel: 'Seq',
      formatsTitle: 'Alignment file formats',
      formatsHint: 'Tick common formats or add your own globs below, one per line. All presets are enabled by default.',
      formatsCustom: 'Custom globs',
      formatsCustomPlaceholder: '*.seq\n*.alignment',
      formatsSelectAll: 'Select all',
      formatsSelectNone: 'Select none',
      formatsReset: 'Reset',
      formatsCancel: 'Cancel',
      formatsSave: 'Save',
      formatsActive: '{count} formats enabled',
      formatsDisabled: 'No formats enabled; this plugin will not claim any files.',
      formatsInvalid: 'Custom globs cannot contain path separators (/ or \\).',
      formatsNote: 'Applied immediately; open tabs are unaffected. Do not tick the same extensions in dsh-phylo-viewer.',
      groupFasta: 'FASTA / sequences',
      groupAlignment: 'General alignments',
      groupPhylip: 'PHYLIP',
      groupClustal: 'CLUSTAL',
      groupStockholm: 'Stockholm',
      groupGzip: 'gzip compressed',
    }

    const FORMAT_KEYS = {
      fasta: 'formatFasta',
      clustal: 'formatClustal',
      phylip: 'formatPhylip',
      stockholm: 'formatStockholm',
    }

    function formatLabel(t, format) {
      const key = FORMAT_KEYS[format]
      return key === undefined ? String(format).toUpperCase() : t(key)
    }

    function summaryLabel(t, sequences, columns) {
      return t('summaryTemplate')
        .replace('{sequences}', String(sequences))
        .replace('{columns}', String(columns))
    }

    /**
     * Read a `dsh-resource://file/session/<id>/<path>` address.
     *
     * @param {string} address
     * @returns {{scope: 'session', sessionId: string, path: string} | undefined}
     */
    function parseFileAddress(address) {
      if (typeof address !== 'string' || !address.startsWith(FILE_PREFIX)) return undefined
      try {
        const end = address.search(/[?#]/)
        const [scope, ...rest] = address.slice(FILE_PREFIX.length, end === -1 ? undefined : end).split('/')
        if (scope !== 'session') return undefined
        const [id, ...segments] = rest
        if (id === undefined || id === '' || segments.length === 0) return undefined
        return {
          scope,
          sessionId: decodeURIComponent(id),
          path: segments.map(decodeURIComponent).join('/'),
        }
      } catch {
        return undefined
      }
    }

    function basenameOf(address) {
      if (typeof address !== 'string') return ''
      const clean = address.split(/[?#]/, 1)[0]
      const name = clean.slice(clean.lastIndexOf('/') + 1)
      if (name === '') return ''
      try {
        return decodeURIComponent(name)
      } catch {
        return name
      }
    }

    function patternMatches(pattern, name) {
      const escaped = String(pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
      try {
        return new RegExp('^' + escaped + '$', 'i').test(name)
      } catch {
        return false
      }
    }

    function matchesAnyPattern(patterns, address) {
      if (parseFileAddress(address) === undefined) return false
      const name = basenameOf(address).toLowerCase()
      return patterns.some((pattern) => patternMatches(pattern, name))
    }

    function normalizeFormatConfig(value) {
      const selected = []
      const custom = []
      const add = (pattern) => {
        if (PRESET_PATTERN_SET.has(pattern)) {
          if (!selected.includes(pattern)) selected.push(pattern)
        } else if (!custom.includes(pattern)) {
          custom.push(pattern)
        }
      }
      for (const pattern of Array.isArray(value && value.selected) ? value.selected : []) {
        if (typeof pattern !== 'string') continue
        const trimmed = pattern.trim()
        if (trimmed !== '') add(trimmed)
      }
      for (const pattern of Array.isArray(value && value.custom) ? value.custom : []) {
        if (typeof pattern !== 'string') continue
        const trimmed = pattern.trim()
        if (trimmed !== '') add(trimmed)
      }
      return { selected, custom }
    }

    function loadFormatConfig() {
      const fallback = { selected: DEFAULT_ALIGNMENT_PATTERNS.slice(), custom: [] }
      try {
        if (typeof localStorage === 'undefined') return fallback
        const raw = localStorage.getItem(FORMATS_KEY)
        if (raw === null) return fallback
        const parsed = JSON.parse(raw)
        if (parsed !== null && typeof parsed === 'object') return normalizeFormatConfig(parsed)
      } catch {
        // Storage or JSON failures fall back to the full preset list.
      }
      return fallback
    }

    function saveFormatConfig(config) {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(FORMATS_KEY, JSON.stringify(config))
      } catch {
        // Storage failures must not break the current registration.
      }
    }

    function activePatterns(config) {
      return [...config.selected, ...config.custom]
    }

    function parseCustomText(text) {
      const patterns = []
      const invalid = []
      for (const line of String(text).split(/\r?\n/)) {
        const value = line.trim()
        if (value === '' || value.startsWith('#')) continue
        if (value.includes('/') || value.includes('\\')) {
          invalid.push(value)
          continue
        }
        if (!patterns.includes(value)) patterns.push(value)
      }
      return { patterns, invalid }
    }

    function formatBytes(count) {
      if (!Number.isFinite(count) || count <= 0) return ''
      if (count < 1024) return `${count} B`
      if (count < 1024 * 1024) return `${(count / 1024).toFixed(1)} KB`
      return `${(count / (1024 * 1024)).toFixed(1)} MB`
    }

    function codedError(code, message) {
      const error = new Error(message)
      error.code = code
      return error
    }

    function toBytes(data) {
      if (data instanceof ArrayBuffer) return new Uint8Array(data)
      if (data instanceof Uint8Array) return data
      return new Uint8Array(data)
    }

    /** Decode and (when needed) gunzip an alignment file. */
    async function decodeAlignmentBytes(data, name) {
      let bytes = toBytes(data)
      if (bytes.byteLength > MAX_BYTES) {
        throw codedError('workspace-file/too-large', 'file is too large for the sidebar')
      }
      const gzip = (bytes.byteLength >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) || /\.gz$/i.test(String(name))
      if (gzip) {
        if (typeof DecompressionStream !== 'function') {
          throw codedError('gzip-unsupported', 'DecompressionStream is unavailable')
        }
        if (bytes.byteLength < 10) {
          throw codedError('gzip-invalid', 'gzip stream is too short')
        }
        const declared = new DataView(bytes.buffer, bytes.byteOffset + bytes.byteLength - 4, 4).getUint32(0, true)
        if (declared > MAX_INFLATED_BYTES) {
          throw codedError('gzip-too-large', 'inflated content is too large')
        }
        let inflated
        try {
          const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader()
          const chunks = []
          let total = 0
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            total += value.byteLength
            if (total > MAX_INFLATED_BYTES) {
              void reader.cancel().catch(() => {})
              throw codedError('gzip-too-large', 'inflated content is too large')
            }
            chunks.push(value)
          }
          inflated = new Uint8Array(total)
          let offset = 0
          for (const chunk of chunks) {
            inflated.set(chunk, offset)
            offset += chunk.byteLength
          }
        } catch (error) {
          if (error && typeof error === 'object' && String(error.code || '').startsWith('gzip-')) throw error
          throw codedError('gzip-invalid', error instanceof Error ? error.message : 'invalid gzip data')
        }
        bytes = inflated
      }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
    }

    // ── Alignment text parsing ──────────────────────────────────────────────

    function residueOnly(value) {
      return String(value).replace(/[^A-Za-z*?.\-~]/g, '')
    }

    function parseFastaText(text) {
      const entries = []
      for (const block of text.trim().split(/^>/m).filter(Boolean)) {
        const nl = block.indexOf('\n')
        if (nl < 0) continue
        const header = block.slice(0, nl).trim()
        const name = header.split(/\s+/)[0] || ''
        const seq = residueOnly(block.slice(nl + 1).replace(/\s+/g, ''))
        if (name !== '' && seq !== '') entries.push({ name, seq })
      }
      return entries
    }

    /**
     * CLUSTAL W / MUSCLE block format. Consensus ruler lines contain only
     * `*:.` and are skipped because they have no sequence token.
     */
    function parseClustalText(text) {
      const lines = text.split(/\r?\n/)
      let index = 0
      while (index < lines.length && lines[index].trim() === '') index++
      if (index >= lines.length || !/^(CLUSTAL|MUSCLE)\b/i.test(lines[index].trim())) return []
      index++
      const order = []
      const map = new Map()
      for (; index < lines.length; index++) {
        const line = lines[index]
        if (line.trim() === '') continue
        const parts = line.trim().split(/\s+/)
        if (parts.length < 2) continue
        const name = parts[0]
        if (/^\d+$/.test(name)) continue
        const seq = residueOnly(parts.slice(1).join(''))
        if (seq === '' || /^[*:.]+$/.test(seq)) continue
        if (!map.has(name)) {
          map.set(name, '')
          order.push(name)
        }
        map.set(name, map.get(name) + seq)
      }
      return order.map((name) => ({ name, seq: map.get(name) }))
    }

    function splitPhylipLine(line) {
      const text = line.replace(/\s+$/, '')
      if (text.trim() === '') return undefined
      const spaced = text.match(/^\s*(\S+)\s+(\S.*)$/)
      if (spaced !== undefined) {
        const name = spaced[1]
        const seq = residueOnly(spaced[2])
        if (name !== '' && !/^\d+$/.test(name) && seq !== '') return { name, seq }
      }
      if (!/^\s/.test(text) && text.length > 10) {
        const name = text.slice(0, 10).trim()
        const seq = residueOnly(text.slice(10))
        if (name !== '' && !/^\d+$/.test(name) && seq !== '') return { name, seq }
      }
      return undefined
    }

    /**
     * PHYLIP sequential or interleaved. Handles the common spaced-name form and
     * strict 10-character fixed-width names.
     */
    function parsePhylipText(text) {
      const raw = text.split(/\r?\n/)
      let index = 0
      while (index < raw.length && raw[index].trim() === '') index++
      if (index >= raw.length) return []
      const header = raw[index].trim().split(/\s+/)
      const count = Number(header[0])
      const width = Number(header[1])
      if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(width) || width <= 0) {
        throw codedError('alignment/invalid', 'PHYLIP header must contain sequence and column counts')
      }
      index++
      const data = []
      for (; index < raw.length; index++) {
        if (raw[index].trim() !== '') data.push(raw[index])
      }

      const first = []
      let blockOk = data.length >= count
      for (let row = 0; row < count && blockOk; row++) {
        const parsed = splitPhylipLine(data[row])
        if (parsed === undefined) blockOk = false
        else first.push(parsed)
      }

      if (blockOk) {
        const rest = data.slice(count)
        const unfinished = first.some((entry) => entry.seq.length < width)
        if (rest.length > 0 && unfinished) {
          let row = 0
          for (const line of rest) {
            const named = /^\s*\S+\s+\S+/.test(line) ? splitPhylipLine(line) : undefined
            const chunk = named !== undefined ? named.seq : residueOnly(line)
            if (chunk === '') continue
            first[row % count].seq += chunk
            row++
          }
        }
        return first
      }

      const entries = []
      let cursor = 0
      while (entries.length < count && cursor < data.length) {
        const parsed = splitPhylipLine(data[cursor])
        if (parsed === undefined) {
          throw codedError('alignment/invalid', 'could not parse a PHYLIP sequence row')
        }
        cursor++
        let seq = parsed.seq
        while (seq.length < width && cursor < data.length) {
          const line = data[cursor]
          if (/^\s*\S+\s+\S+/.test(line)) break
          seq += residueOnly(line)
          cursor++
        }
        entries.push({ name: parsed.name, seq })
      }
      return entries
    }

    function parseStockholmText(text) {
      const order = []
      const map = new Map()
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('//')) continue
        const match = line.match(/^(\S+)\s+([A-Za-z*?.\-~]+)\s*$/)
        if (match === null) continue
        const name = match[1]
        if (!map.has(name)) {
          map.set(name, '')
          order.push(name)
        }
        map.set(name, map.get(name) + match[2])
      }
      return order.map((name) => ({ name, seq: map.get(name) }))
    }

    function detectFormat(text) {
      const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
      let index = 0
      while (index < lines.length && lines[index].trim() === '') index++
      const first = (lines[index] ?? '').trim()
      if (/^(CLUSTAL|MUSCLE)\b/i.test(first)) return 'clustal'
      if (/^#\s*STOCKHOLM/i.test(first)) return 'stockholm'
      if (/^\d+\s+\d+$/.test(first)) {
        const next = (lines[index + 1] ?? '').trim()
        if (next !== '' && /[A-Za-z]/.test(next)) return 'phylip'
      }
      if (first.startsWith('>')) return 'fasta'
      if (lines.some((line) => line.startsWith('>'))) return 'fasta'
      return 'unknown'
    }

    function uniqueNames(entries) {
      const seen = new Map()
      return entries.map((entry, index) => {
        const base = entry.name.trim() === '' ? `seq${index + 1}` : entry.name.trim()
        const count = (seen.get(base) ?? 0) + 1
        seen.set(base, count)
        return { name: count === 1 ? base : `${base}#${count}`, seq: entry.seq }
      })
    }

    function detectAminoAcid(entries, name) {
      if (/\.(faa|aa|prot|pep)(\.gz)?$/i.test(String(name))) return true
      let total = 0
      let amino = 0
      for (const entry of entries) {
        for (const raw of entry.seq) {
          const char = raw.toUpperCase()
          if (char === '-' || char === '.' || char === '~' || char === '?') continue
          total++
          if ('EFILPQZJOX*'.includes(char)) amino++
          if (total >= 500000) break
        }
        if (total >= 500000) break
      }
      return total > 0 && amino / total > 0.02
    }

    /**
     * Normalize alignment text to FASTA for ReSeqt.
     *
     * @param {string} text
     * @param {string} name file name, used for the amino-acid hint
     * @returns {{fasta: string, sequences: number, columns: number, isAminoAcid: boolean, format: string}}
     */
    function normalizeAlignment(text, name) {
      const format = detectFormat(text)
      let entries
      if (format === 'fasta') entries = parseFastaText(text)
      else if (format === 'clustal') entries = parseClustalText(text)
      else if (format === 'phylip') entries = parsePhylipText(text)
      else if (format === 'stockholm') entries = parseStockholmText(text)
      else throw codedError('alignment/unsupported', 'unrecognized alignment format')

      const usable = entries.filter((entry) => residueOnly(entry.seq) !== '')
      if (usable.length === 0) throw codedError('alignment/empty', 'no sequence records found')
      const unique = uniqueNames(usable)
      const columns = unique.reduce((max, entry) => Math.max(max, entry.seq.length), 0)
      const fasta = unique.map((entry) => `>${entry.name.replace(/[\r\n]/g, ' ')}\n${entry.seq}`).join('\n')
      return {
        fasta,
        sequences: unique.length,
        columns,
        isAminoAcid: detectAminoAcid(unique, name),
        format,
      }
    }

    function errorKey(error) {
      const code = error && typeof error === 'object' ? error.code : undefined
      if (code === 'workspace-file/not-found' || code === 'gateway/lookup-not-found') return 'errorNotFound'
      if (code === 'workspace-file/too-large') return 'errorTooLarge'
      if (code === 'workspace-file/not-text') return 'errorNotText'
      if (code === 'workspace-file/not-regular-file') return 'errorNotRegular'
      if (code === 'workspace-file/outside-workspace' || code === 'workspace-file/unknown-workspace') return 'errorOutside'
      if (code === 'gzip-unsupported') return 'gzipUnsupported'
      if (code === 'gzip-invalid') return 'gzipInvalid'
      if (code === 'gzip-too-large') return 'gzipTooLarge'
      if (code === 'alignment/unsupported') return 'errorUnsupported'
      if (code === 'alignment/empty') return 'errorNoSequences'
      return ''
    }

    function errorMessage(error, t) {
      const key = errorKey(error)
      if (key !== '') return t(key)
      if (error && error.name === 'TypeError' && /decode/i.test(String(error.message))) return t('errorDecode')
      const message = error && error.message ? String(error.message) : ''
      return message && message.length <= 240 ? message : t('errorGeneric')
    }

    // ── Theme bridge ────────────────────────────────────────────────────────

    function parseRgb(value) {
      const match = String(value).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/i)
      if (match === null) return undefined
      const alpha = match[4] === undefined ? 1 : Number(match[4])
      if (!(alpha > 0)) return undefined
      return [Number(match[1]), Number(match[2]), Number(match[3])]
    }

    function detectHostTheme() {
      try {
        const root = document.documentElement
        const hint = `${root.getAttribute('data-theme') || ''} ${root.getAttribute('data-color-scheme') || ''} ${root.className || ''}`.toLowerCase()
        if (/\bdark\b/.test(hint)) return 'dark'
        if (/\blight\b/.test(hint)) return 'light'
        const scheme = getComputedStyle(root).colorScheme || ''
        if (scheme.includes('dark') && !scheme.includes('light')) return 'dark'
        if (scheme.includes('light') && !scheme.includes('dark')) return 'light'
        const rgb = parseRgb(document.body ? getComputedStyle(document.body).backgroundColor : '')
        if (rgb !== undefined) {
          const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
          return luminance < 0.45 ? 'dark' : 'light'
        }
        if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
      } catch {
        // fall through to light
      }
      return 'light'
    }

    /**
     * The sidebar tab body: read the file once per address/reload, normalize it
     * to FASTA, then hand it to the embedded viewer once that viewer is ready.
     */
    function AlignmentBody({ useTabInfo, useResource, t, readAlignment, openAsText }) {
      const { tab } = useTabInfo()
      const address = tab.contentId
      const parsed = React.useMemo(() => parseFileAddress(address), [address])
      const label = React.useMemo(() => basenameOf(address) || t('typeTitle'), [address, t])
      const meta = useResource(address)
      const version = meta && meta.value !== undefined ? meta.value.version : undefined
      const frameRef = React.useRef(null)
      const [attempt, setAttempt] = React.useState(0)
      const [frameReady, setFrameReady] = React.useState(false)
      const [payload, setPayload] = React.useState({ phase: 'reading' })
      const [viewerStatus, setViewerStatus] = React.useState({ phase: 'waiting' })
      const [viewerSrc, setViewerSrc] = React.useState(null)
      const [stale, setStale] = React.useState(false)
      const sentTokenRef = React.useRef(null)
      const loadedVersionRef = React.useRef(null)

      React.useEffect(() => {
        loadedVersionRef.current = null
        setStale(false)
      }, [address])

      React.useEffect(() => {
        if (version === undefined) return
        if (loadedVersionRef.current === null) {
          loadedVersionRef.current = version
          return
        }
        if (version !== loadedVersionRef.current) setStale(true)
      }, [version])

      React.useEffect(() => {
        const objectUrl = URL.createObjectURL(new Blob([VIEWER_HTML], { type: 'text/html' }))
        setViewerSrc(objectUrl)
        return () => URL.revokeObjectURL(objectUrl)
      }, [])

      React.useEffect(() => {
        setFrameReady(false)
        setViewerStatus({ phase: 'waiting' })
      }, [address, viewerSrc])

      React.useEffect(() => {
        setPayload({ phase: 'reading' })
        setViewerStatus({ phase: 'waiting' })
        if (parsed === undefined) {
          setPayload({ phase: 'error', message: t('errorAddress') })
          return undefined
        }

        const controller = new AbortController()
        const abort = () => controller.abort()
        const signal = tab.signal
        if (signal && typeof signal.addEventListener === 'function') {
          if (signal.aborted) abort()
          else signal.addEventListener('abort', abort)
        }

        const token = `${address}#${attempt}`
        ;(async () => {
          try {
            const result = await readAlignment(parsed.sessionId, parsed.path, controller.signal)
            if (controller.signal.aborted) return
            const text = await decodeAlignmentBytes(result && result.data, parsed.path)
            if (controller.signal.aborted) return
            if (result && result.version !== undefined) loadedVersionRef.current = result.version
            setStale(false)
            if (text.trim() === '') {
              setPayload({ phase: 'error', message: t('errorEmpty') })
              return
            }
            const normalized = normalizeAlignment(text, parsed.path)
            setPayload({
              phase: 'ready',
              ...normalized,
              label,
              bytes: result && Number.isFinite(result.bytes) ? result.bytes : undefined,
              token,
            })
          } catch (error) {
            if (controller.signal.aborted) return
            const decodeFailure = error instanceof TypeError || (error && error.name === 'TypeError')
            setPayload({
              phase: 'error',
              message: decodeFailure ? t('errorDecode') : errorMessage(error, t),
              code: error && typeof error === 'object' ? error.code : undefined,
            })
          }
        })()

        return () => {
          controller.abort()
          if (signal && typeof signal.removeEventListener === 'function') {
            signal.removeEventListener('abort', abort)
          }
        }
      }, [address, attempt, parsed, readAlignment, t, tab.signal])

      React.useEffect(() => {
        const onMessage = (event) => {
          const frame = frameRef.current
          if (frame === null || event.source !== frame.contentWindow) return
          const data = event.data
          if (data === null || typeof data !== 'object') return
          if (data.type === PROTOCOL + ':ready') {
            setFrameReady(true)
          } else if (data.type === PROTOCOL + ':loaded') {
            setViewerStatus({ phase: 'loaded' })
          } else if (data.type === PROTOCOL + ':error') {
            setViewerStatus({
              phase: 'error',
              message: typeof data.message === 'string' && data.message !== '' ? data.message : t('viewerError'),
            })
          }
        }
        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
      }, [t])

      React.useEffect(() => {
        if (!frameReady || payload.phase !== 'ready') return
        const frame = frameRef.current
        if (frame === null || frame.contentWindow === null) return
        if (sentTokenRef.current === payload.token) return
        sentTokenRef.current = payload.token
        try {
          frame.contentWindow.postMessage({
            type: PROTOCOL + ':load',
            payload: {
              fasta: payload.fasta,
              label: payload.label,
              isAminoAcid: payload.isAminoAcid,
              theme: detectHostTheme(),
            },
          }, '*')
        } catch {
          // The iframe went away between effects; the next ready message retries.
        }
      }, [frameReady, payload])

      React.useEffect(() => {
        if (!frameReady) return undefined
        const sendTheme = () => {
          const frame = frameRef.current
          if (frame === null || frame.contentWindow === null) return
          try {
            frame.contentWindow.postMessage({ type: PROTOCOL + ':theme', theme: detectHostTheme() }, '*')
          } catch {
            // ignore a torn-down frame
          }
        }
        sendTheme()
        const observer = typeof MutationObserver === 'function'
          ? new MutationObserver(sendTheme)
          : null
        if (observer !== null) {
          observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'style'],
          })
        }
        const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
        if (media !== null && typeof media.addEventListener === 'function') media.addEventListener('change', sendTheme)
        return () => {
          if (observer !== null) observer.disconnect()
          if (media !== null && typeof media.removeEventListener === 'function') media.removeEventListener('change', sendTheme)
        }
      }, [frameReady])

      const reload = React.useCallback(() => {
        sentTokenRef.current = null
        setAttempt((value) => value + 1)
      }, [])

      const dotState = payload.phase === 'reading' || stale
        ? 'reading'
        : viewerStatus.phase === 'error' || payload.phase === 'error'
          ? 'error'
          : viewerStatus.phase === 'loaded'
            ? 'ready'
            : 'reading'
      const statusText = stale
        ? t('fileChanged')
        : payload.phase === 'reading'
          ? t('reading')
          : viewerStatus.phase === 'error' || payload.phase === 'error'
            ? t('failed')
            : viewerStatus.phase === 'loaded'
              ? t('ready')
              : t('reading')

      const overlayMessage = payload.phase === 'error'
        ? payload.message
        : viewerStatus.phase === 'error'
          ? viewerStatus.message
          : ''

      return h(
        'div',
        { className: 'dsh-seq-root' },
        h(
          'div',
          { className: 'dsh-seq-bar' },
          h('span', { className: 'dsh-seq-dot', 'data-state': dotState, title: statusText }),
          h('span', { className: 'dsh-seq-name', title: parsed ? parsed.path : address }, label),
          stale
            ? h('button', {
                type: 'button',
                className: 'dsh-seq-stale',
                title: t('fileChanged'),
                onClick: reload,
              }, t('fileChangedReload'))
            : null,
          payload.phase === 'ready'
            ? h('span', { className: 'dsh-seq-meta' }, summaryLabel(t, payload.sequences, payload.columns))
            : null,
          payload.phase === 'ready'
            ? h('span', { className: 'dsh-seq-meta-format' }, formatLabel(t, payload.format))
            : null,
          payload.phase === 'ready' && payload.bytes !== undefined
            ? h('span', { className: 'dsh-seq-meta' }, formatBytes(payload.bytes))
            : null,
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-seq-reload',
              title: t('reload'),
              'aria-label': t('reload'),
              onClick: reload,
            },
            '↻',
          ),
        ),
        h(
          'div',
          { className: 'dsh-seq-stage' },
          viewerSrc !== null
            ? h('iframe', {
                ref: frameRef,
                className: 'dsh-seq-frame',
                src: viewerSrc,
                title: label,
                allow: 'clipboard-write',
                onLoad: () => setFrameReady(true),
              })
            : null,
          overlayMessage !== ''
            ? h(
                'div',
                { className: 'dsh-seq-overlay', role: 'alert' },
                h(
                  'div',
                  { className: 'dsh-seq-card' },
                  h(
                    'div',
                    { className: 'dsh-seq-card-title' },
                    payload.phase === 'error' ? t('errorTitle') : t('viewerError'),
                  ),
                  h('div', { className: 'dsh-seq-card-file' }, label),
                  h('div', { className: 'dsh-seq-card-msg' }, overlayMessage),
                  h(
                    'div',
                    { className: 'dsh-seq-card-actions' },
                    h('button', {
                      type: 'button',
                      className: 'dsh-seq-retry',
                      onClick: () => {
                        try {
                          openAsText(address, tab.id)
                        } catch (error) {
                          console.error('[dsh-seq-viewer] open as text failed', error)
                        }
                      },
                    }, t('openAsText')),
                    h('button', { type: 'button', className: 'dsh-seq-retry', onClick: reload }, t('retry')),
                  ),
                ),
              )
            : null,
        ),
      )
    }

    function safeTitle(definition, address) {
      try {
        const title = typeof definition.title === 'function' ? definition.title(address) : undefined
        return title || definition.kind
      } catch {
        return definition.kind
      }
    }

    /**
     * The workspace-files header button + modal. Deliberately uses a green DNA
     * icon and a visible "序列" label so it cannot be mistaken for the tree
     * viewer's format button injected into the same slot.
     */
    function FormatsButton({ t, getFormats, setFormats }) {
      const [open, setOpen] = React.useState(false)
      const [selected, setSelected] = React.useState([])
      const [customText, setCustomText] = React.useState('')
      const [error, setError] = React.useState('')

      const openModal = () => {
        const config = getFormats()
        setSelected(config.selected.slice())
        setCustomText(config.custom.join('\n'))
        setError('')
        setOpen(true)
      }

      React.useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [open])

      const parsedCustom = parseCustomText(customText)
      const activeCount = new Set([...selected, ...parsedCustom.patterns]).size
      const toggle = (pattern) => setSelected((value) => (
        value.includes(pattern) ? value.filter((entry) => entry !== pattern) : [...value, pattern]
      ))
      const save = () => {
        if (parsedCustom.invalid.length > 0) {
          setError(t('formatsInvalid'))
          return
        }
        const presetFromCustom = parsedCustom.patterns.filter((pattern) => PRESET_PATTERN_SET.has(pattern))
        const selectedPatterns = DEFAULT_ALIGNMENT_PATTERNS.filter((pattern) => (
          selected.includes(pattern) || presetFromCustom.includes(pattern)
        ))
        const custom = parsedCustom.patterns.filter((pattern) => !PRESET_PATTERN_SET.has(pattern))
        setFormats({ selected: selectedPatterns, custom })
        setOpen(false)
      }

      const icon = h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M7 3c0 4 10 4 10 8s-10 4-10 8' }),
        h('path', { d: 'M17 3c0 4-10 4-10 8s10 4 10 8' }),
        h('path', { d: 'M8 6h8M8 10h8M8 14h8M8 18h8' }),
      )

      const modal = open
        ? ReactDOM.createPortal(
            h(
              'div',
              {
                className: 'dsh-seq-format-mask',
                onMouseDown: (event) => {
                  if (event.target === event.currentTarget) setOpen(false)
                },
              },
              h(
                'div',
                {
                  className: 'dsh-seq-format-modal',
                  role: 'dialog',
                  'aria-modal': 'true',
                  'aria-label': t('formatsTitle'),
                },
                h(
                  'div',
                  { className: 'dsh-seq-format-head' },
                  h('div', { className: 'dsh-seq-format-title' }, t('formatsTitle')),
                  h('p', { className: 'dsh-seq-format-hint' }, t('formatsHint')),
                ),
                h(
                  'div',
                  { className: 'dsh-seq-format-body' },
                  h(
                    'div',
                    { className: 'dsh-seq-format-tools' },
                    h('button', {
                      type: 'button',
                      className: 'dsh-seq-format-tool',
                      onClick: () => setSelected(DEFAULT_ALIGNMENT_PATTERNS.slice()),
                    }, t('formatsSelectAll')),
                    h('button', {
                      type: 'button',
                      className: 'dsh-seq-format-tool',
                      onClick: () => setSelected([]),
                    }, t('formatsSelectNone')),
                    h('button', {
                      type: 'button',
                      className: 'dsh-seq-format-tool',
                      onClick: () => {
                        setSelected(DEFAULT_ALIGNMENT_PATTERNS.slice())
                        setCustomText('')
                        setError('')
                      },
                    }, t('formatsReset')),
                  ),
                  ...PRESET_GROUPS.map((group) => h(
                    'section',
                    { key: group.id, className: 'dsh-seq-format-group' },
                    h('div', { className: 'dsh-seq-format-group-title' }, t(group.label)),
                    h(
                      'div',
                      { className: 'dsh-seq-format-grid' },
                      group.patterns.map((pattern) => h(
                        'label',
                        { key: pattern, className: 'dsh-seq-format-check' },
                        h('input', {
                          type: 'checkbox',
                          checked: selected.includes(pattern),
                          onChange: () => toggle(pattern),
                        }),
                        h('span', null, pattern),
                      )),
                    ),
                  )),
                  h(
                    'div',
                    { className: 'dsh-seq-format-group' },
                    h('div', { className: 'dsh-seq-format-group-title' }, t('formatsCustom')),
                    h('textarea', {
                      className: 'dsh-seq-format-custom',
                      value: customText,
                      placeholder: t('formatsCustomPlaceholder'),
                      spellCheck: false,
                      onChange: (event) => setCustomText(event.target.value),
                    }),
                  ),
                  h(
                    'div',
                    { className: 'dsh-seq-format-status' + (error !== '' ? ' dsh-seq-format-error' : '') },
                    error !== ''
                      ? error
                      : activeCount > 0
                        ? t('formatsActive').replace('{count}', String(activeCount))
                        : t('formatsDisabled'),
                  ),
                  h('div', { className: 'dsh-seq-format-status' }, t('formatsNote')),
                ),
                h(
                  'div',
                  { className: 'dsh-seq-format-foot' },
                  h('button', {
                    type: 'button',
                    className: 'dsh-seq-format-tool',
                    onClick: () => setOpen(false),
                  }, t('formatsCancel')),
                  h('button', {
                    type: 'button',
                    className: 'dsh-seq-format-tool dsh-seq-format-primary',
                    onClick: save,
                  }, t('formatsSave')),
                ),
              ),
            ),
            document.body,
          )
        : null

      return h(
        React.Fragment,
        null,
        h('button', {
          type: 'button',
          className: 'dsh-seq-formats-btn',
          title: t('formatsButton'),
          'aria-label': t('formatsButton'),
          'data-dsh-seq-viewer-formats': 'true',
          onClick: openModal,
        }, icon, h('span', { className: 'dsh-seq-formats-label' }, t('formatsLabel'))),
        modal,
      )
    }

    /** Context-menu contribution: other tab types, then Host desktop apps. */
    function AlignmentMenuItem({ tab, dismiss, t, listOpeners, appsFor, openWith, openExternal }) {
      const parsed = React.useMemo(() => parseFileAddress(tab.contentId), [tab.contentId])
      const mine = tab.kind === KIND && parsed !== undefined
      const [apps, setApps] = React.useState({ list: [], absolutePath: undefined, desktop: false, failed: false })
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')

      React.useEffect(() => {
        if (!mine) return undefined
        let active = true
        setApps({ list: [], absolutePath: undefined, desktop: false, failed: false })
        Promise.resolve(appsFor(parsed.sessionId, parsed.path))
          .then((result) => {
            if (!active) return
            setApps({
              list: Array.isArray(result && result.apps) ? result.apps : [],
              absolutePath: result && result.absolutePath,
              desktop: Boolean(result && result.desktop),
              failed: Boolean(result && result.failed),
            })
          })
          .catch(() => {
            if (active) setApps((value) => ({ ...value, failed: true }))
          })
        return () => {
          active = false
        }
      }, [appsFor, mine, parsed])

      if (!mine) return null

      const openers = listOpeners(tab.contentId).filter((entry) => entry.id !== TYPE_ID)
      const run = async (action) => {
        setBusy(true)
        setError('')
        try {
          const ok = await action()
          if (ok) dismiss()
          else setError(t('openFailed'))
        } catch {
          setError(t('openFailed'))
        } finally {
          setBusy(false)
        }
      }

      const rows = []
      if (openers.length > 0) {
        rows.push(h('div', { className: 'dsh-seq-menu-title', key: 'internal-title' }, t('internalOpeners')))
        for (const entry of openers) {
          rows.push(h('button', {
            key: 'kind:' + entry.kind,
            type: 'button',
            className: 'dsh-seq-menu-item',
            onClick: () => {
              dismiss()
              openWith(tab.contentId, entry.kind, tab.id)
            },
          }, entry.kind === 'text' ? t('openAsText') : entry.title))
        }
      }

      if (apps.desktop) {
        rows.push(h('div', { className: 'dsh-seq-menu-sep', key: 'separator' }))
        rows.push(h('div', { className: 'dsh-seq-menu-title', key: 'external-title' }, t('externalOpeners')))
        if (apps.failed || apps.list.length === 0) {
          rows.push(h('div', { className: 'dsh-seq-menu-note', key: 'none' }, t('noApps')))
          if (apps.absolutePath !== undefined) {
            rows.push(h('button', {
              key: 'default',
              type: 'button',
              className: 'dsh-seq-menu-item',
              disabled: busy,
              onClick: () => void run(() => openExternal(apps.absolutePath, undefined, 'open')),
            }, t('openDefault')))
          }
        } else {
          for (const app of apps.list) {
            rows.push(h('button', {
              key: 'app:' + app.id,
              type: 'button',
              className: 'dsh-seq-menu-item',
              disabled: busy,
              onClick: () => void run(() => openExternal(apps.absolutePath, app.id, 'open')),
            }, app.icon ? h('img', { src: app.icon, alt: '' }) : null, String(app.name || app.id) + (app.default ? t('defaultAppSuffix') : '')))
          }
        }
        if (apps.absolutePath !== undefined) {
          rows.push(h('button', {
            key: 'reveal',
            type: 'button',
            className: 'dsh-seq-menu-item',
            disabled: busy,
            onClick: () => void run(() => openExternal(apps.absolutePath, undefined, 'reveal')),
          }, t('reveal')))
        }
      }

      if (error !== '') {
        rows.push(h('div', { className: 'dsh-seq-menu-note dsh-seq-menu-error', key: 'error' }, error))
      }
      return h('div', { className: 'dsh-seq-menu' }, rows)
    }

    const inject = [
      'slots',
      'locale',
      'sidebarRightTabs',
      'sidebarRight',
      'remote',
      'remote.workspaceFiles',
      'remote.session',
      'resources',
    ]

    function apply(ctx) {
      const t = ctx.locale.bind(NS)

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-seq-viewer: dictionaries')

      const style = document.createElement('style')
      style.dataset.dshSeqViewer = ''
      style.textContent = CSS
      document.head.append(style)
      ctx.effect(() => () => style.remove(), 'dsh-seq-viewer: styles')

      let formatConfig = loadFormatConfig()
      let patterns = activePatterns(formatConfig)
      let disposeType = null
      const definitionFor = (currentPatterns) => ({
        id: TYPE_ID,
        kind: KIND,
        patterns: currentPatterns,
        priority: 'extension',
        canOpen: (address) => matchesAnyPattern(currentPatterns, address),
        title: (address) => basenameOf(address) || t('typeTitle'),
        keepMounted: true,
      })
      const mountType = () => {
        if (disposeType !== null) {
          try {
            disposeType()
          } catch {
            // the previous registration is already gone
          }
        }
        disposeType = ctx.sidebarRightTabs.register(definitionFor(patterns))
      }
      mountType()
      ctx.effect(() => () => {
        if (disposeType !== null) {
          try {
            disposeType()
          } catch {
            // already disposed
          }
          disposeType = null
        }
      }, 'dsh-seq-viewer: alignment tab type')

      const getFormats = () => ({
        selected: formatConfig.selected.slice(),
        custom: formatConfig.custom.slice(),
      })
      const setFormats = (next) => {
        formatConfig = normalizeFormatConfig(next)
        patterns = activePatterns(formatConfig)
        saveFormatConfig(formatConfig)
        mountType()
      }

      const readAlignment = async (sessionId, path, signal) => {
        const result = await ctx.remote.workspaceFiles.readBytes(sessionId, path, {}, signal)
        if (result !== null && typeof result === 'object' && 'ok' in result) {
          if (!result.ok) throw result.error
          return result.value
        }
        return result
      }

      const openWith = (address, kind, tabId) => {
        ctx.sidebarRight.openResource(address, { kind, replaceTab: tabId })
      }

      const openAsText = (address, tabId) => {
        openWith(address, 'text', tabId)
      }

      const listOpeners = (address) => {
        try {
          return ctx.sidebarRightTabs.candidates(address).map((candidate) => ({
            id: candidate.id,
            kind: candidate.kind,
            title: safeTitle(candidate, address),
          }))
        } catch {
          return []
        }
      }

      const openExternal = async (absolutePath, appId, action) => {
        if (typeof absolutePath !== 'string' || absolutePath === '') return false
        const request = action === 'reveal'
          ? { path: absolutePath, action: 'reveal' }
          : appId === undefined
            ? { path: absolutePath }
            : { path: absolutePath, application: appId }
        try {
          const result = await ctx.remote.session.openWorkspacePath(request)
          return result !== null && typeof result === 'object' && result.ok === true
        } catch {
          return false
        }
      }

      const appsCache = new Map()
      const loadApps = async (sessionId, path) => {
        let absolutePath
        try {
          const stat = await ctx.remote.workspaceFiles.stat(sessionId, path)
          if (stat !== null && typeof stat === 'object' && stat.ok === true) absolutePath = stat.value.absolutePath
        } catch {
          // fall through with no absolute path
        }
        if (typeof absolutePath !== 'string' || absolutePath === '') {
          return { desktop: false, apps: [], absolutePath: undefined, failed: true }
        }
        let desktop = false
        try {
          const available = await ctx.remote.session.canOpenWorkspacePath()
          desktop = available !== null && typeof available === 'object' && available.ok === true && available.value === true
        } catch {
          desktop = false
        }
        if (!desktop) return { desktop: false, apps: [], absolutePath }
        try {
          const result = await ctx.remote.session.workspacePathApplications({ path: absolutePath })
          return {
            desktop: true,
            apps: result !== null && typeof result === 'object' && result.ok === true ? result.value : [],
            absolutePath,
            failed: !(result !== null && typeof result === 'object' && result.ok === true),
          }
        } catch {
          return { desktop: true, apps: [], absolutePath, failed: true }
        }
      }
      const appsFor = (sessionId, path) => {
        const key = sessionId + '\u0000' + path
        if (!appsCache.has(key)) {
          const promise = loadApps(sessionId, path)
          appsCache.set(key, promise)
          void promise.then((result) => {
            if (!result || result.desktop !== true) appsCache.delete(key)
          }, () => appsCache.delete(key))
        }
        return appsCache.get(key)
      }

      ctx.effect(
        () => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TYPE_ID,
          locale: NS,
          inject: () => ({ readAlignment, openAsText }),
        }, AlignmentBody)),
        'dsh-seq-viewer: alignment tab body',
      )

      ctx.effect(
        () => ctx.slots.inject('sidebar.right.tab.menu.item', () => ctx.slots.register({
          name: 'sidebar.right.tab.menu.item',
          id: TYPE_ID,
          locale: NS,
          inject: () => ({ listOpeners, appsFor, openWith, openExternal }),
        }, AlignmentMenuItem)),
        'dsh-seq-viewer: alignment tab menu',
      )

      ctx.effect(
        () => ctx.slots.inject('sidebar.right.tab.files.actions', () => ctx.slots.register({
          name: 'sidebar.right.tab.files.actions',
          id: TYPE_ID + '-formats',
          locale: NS,
          inject: () => ({ getFormats, setFormats }),
        }, FormatsButton)),
        'dsh-seq-viewer: format settings button',
      )
    }

    return {
      apply,
      inject,
      name: TYPE_ID,
      __test: {
        parseFileAddress,
        basenameOf,
        patternMatches,
        matchesAnyPattern,
        decodeAlignmentBytes,
        normalizeAlignment,
        detectFormat,
        parseFastaText,
        parseClustalText,
        parsePhylipText,
        parseStockholmText,
        detectAminoAcid,
        detectHostTheme,
        errorKey,
        safeTitle,
        formatLabel,
        summaryLabel,
        DEFAULT_ALIGNMENT_PATTERNS,
        PRESET_GROUPS,
        FORMATS_KEY,
        normalizeFormatConfig,
        parseCustomText,
        activePatterns,
      },
    }
  },
})
