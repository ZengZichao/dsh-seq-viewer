import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const clientSource = fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const patch = fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8')

const ADDRESS = 'dsh-resource://file/session/s1/alignment.fasta'
const plain = (value) => JSON.parse(JSON.stringify(value))

function loadClient(options = {}) {
  const disposers = []
  const captured = { definition: undefined, definitions: [], registrations: [], dictionaries: undefined }
  const storage = options.storage ?? new Map()
  let loaded

  class FakeStyle {
    constructor() { this.dataset = {}; this.textContent = '' }
    remove() { this.removed = true }
  }

  const context = {
    window: {
      __ModuleLoader__: { load: (definition) => { loaded = definition } },
      addEventListener() {},
      removeEventListener() {},
    },
    document: {
      baseURI: 'http://127.0.0.1:4321/',
      createElement: () => new FakeStyle(),
      head: { append() {} },
      documentElement: {
        getAttribute: () => null,
        className: '',
      },
      body: undefined,
    },
    Blob,
    URL: {
      createObjectURL: () => 'blob:http://127.0.0.1:4321/test',
      revokeObjectURL() {},
    },
    DecompressionStream: globalThis.DecompressionStream,
    TextDecoder,
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    console,
  }
  vm.createContext(context)
  vm.runInContext(clientSource, context)
  assert.ok(loaded, 'client bundle registers a module')

  const React = {
    createElement: (...args) => ({ args }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: () => ({ current: null }),
    useMemo: (factory) => factory(),
    useEffect: () => {},
    useCallback: (fn) => fn,
  }
  const ReactDOM = {
    createPortal: (node) => node,
  }
  const module = loaded.factory((request) => {
    if (request === 'react') return React
    if (request === 'react-dom') return ReactDOM
    throw new Error('unexpected require: ' + request)
  })

  const opened = []
  const called = []
  const ctx = {
    locale: {
      bind: () => (key) => key,
      register: (namespace, dictionaries) => {
        captured.dictionaries = { namespace, dictionaries }
        return () => {}
      },
    },
    effect: (fn) => {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    sidebarRight: {
      openResource: (address, opts) => {
        opened.push({ address, opts })
      },
    },
    sidebarRightTabs: {
      register: (definition) => {
        captured.definition = definition
        const record = { definition, disposed: false }
        captured.definitions.push(record)
        return () => {
          record.disposed = true
        }
      },
      candidates: () => options.candidates ?? [
        { id: 'dsh-seq-viewer', kind: 'sequence-alignment', title: () => 'alignment.fasta' },
        { id: '@deepseek-ai/dsh-client-ui-sidebar-documentpreview', kind: 'text', title: () => 'alignment.fasta' },
      ],
    },
    slots: {
      inject: (_name, fn) => fn(),
      register: (spec, component) => {
        captured.registrations.push({ spec, component })
        return () => {}
      },
    },
    remote: {
      workspaceFiles: {
        readBytes: options.readBytes ?? (async () => ({
          ok: true,
          value: { data: new TextEncoder().encode('>a\nACGT\n>b\nAC-T\n'), bytes: 15, version: 'v1' },
        })),
        stat: options.stat ?? (async () => ({ ok: true, value: { absolutePath: 'C:/ws/alignment.fasta', version: 'v1' } })),
      },
      session: {
        canOpenWorkspacePath: options.canOpenWorkspacePath ?? (async () => ({ ok: true, value: false })),
        workspacePathApplications: options.workspacePathApplications ?? (async () => ({ ok: true, value: [] })),
        openWorkspacePath: options.openWorkspacePath ?? (async (request) => {
          called.push(request)
          return { ok: true }
        }),
      },
    },
  }

  module.apply(ctx)
  const body = captured.registrations.find((entry) => entry.spec.name === 'sidebar.right.pane.tab')
  const menu = captured.registrations.find((entry) => entry.spec.name === 'sidebar.right.tab.menu.item')
  const formats = captured.registrations.find((entry) => entry.spec.name === 'sidebar.right.tab.files.actions')
  return { module, captured, disposers, context, storage, opened, called, body, menu, formats }
}

test('manifest declares a web client half, a bundle patch, and a bounded DSH range', () => {
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.main, 'src/index.js')
  assert.equal(manifest.exports['./client'], './lib/client.js')
  assert.equal(manifest.dsh.engines.dsh, '>=0.2.1-rc.2 <0.3.0')
  assert.match(patch, /id: dsh-seq-viewer/)
})

test('the generated client embeds a single-file ReSeqt viewer', () => {
  assert.ok(clientSource.length > 200_000, 'viewer HTML is embedded')
  assert.match(clientSource, /dsh-seq-viewer:load/)
  assert.match(clientSource, /dsh-seq-viewer:loaded/)
  assert.doesNotMatch(clientSource, /__VIEWER_HTML__/)
  assert.match(clientSource, /sequence-alignment/)
})

test('registers an extension-band tab type for every advertised suffix', () => {
  const { captured, module } = loadClient()
  assert.deepEqual(Array.from(module.inject), [
    'slots',
    'locale',
    'sidebarRightTabs',
    'sidebarRight',
    'remote',
    'remote.workspaceFiles',
    'remote.session',
    'resources',
  ])
  assert.equal(captured.definition.id, 'dsh-seq-viewer')
  assert.equal(captured.definition.kind, 'sequence-alignment')
  assert.equal(captured.definition.priority, 'extension')
  assert.equal(captured.definition.keepMounted, true)
  for (const pattern of [
    '*.fasta', '*.fa', '*.faa', '*.fas', '*.aln', '*.msa', '*.a2m',
    '*.phy', '*.phylip', '*.clw', '*.sto', '*.stockholm',
    '*.fasta.gz', '*.aln.gz', '*.phy.gz',
  ]) {
    assert.ok(captured.definition.patterns.includes(pattern), 'claims ' + pattern)
  }
  assert.deepEqual(Array.from(captured.definition.patterns), Array.from(module.__test.DEFAULT_ALIGNMENT_PATTERNS))
  for (const group of module.__test.PRESET_GROUPS) {
    for (const pattern of group.patterns) {
      assert.ok(captured.definition.patterns.includes(pattern), 'default includes ' + pattern)
    }
  }
  assert.equal(captured.dictionaries.namespace, 'dsh-seq-viewer')
  assert.ok(captured.dictionaries.dictionaries.zh.errorUnsupported)
  assert.ok(captured.dictionaries.dictionaries.en.openAsText)

  const formats = captured.registrations.find((entry) => entry.spec.name === 'sidebar.right.tab.files.actions')
  assert.ok(formats, 'registers a workspace-files formats action')
  assert.equal(formats.spec.id, 'dsh-seq-viewer-formats')
  assert.notEqual(formats.spec.id, 'dsh-phylo-viewer-formats')
  assert.equal(typeof formats.component, 'function')
  const face = formats.spec.inject()
  assert.equal(typeof face.getFormats, 'function')
  assert.equal(typeof face.setFormats, 'function')
})

test('locale dictionaries contain only strings (DSH t() has no function values)', () => {
  const { captured } = loadClient()
  for (const language of ['zh', 'en']) {
    const dictionary = captured.dictionaries.dictionaries[language]
    for (const [key, value] of Object.entries(dictionary)) {
      assert.equal(typeof value, 'string', `${language}.${key} must be a string`)
    }
    assert.match(dictionary.summaryTemplate, /\{sequences\}/)
    assert.match(dictionary.summaryTemplate, /\{columns\}/)
  }
  const { module } = loadClient()
  const translate = (key) => ({ summaryTemplate: '{sequences} seq × {columns} cols', formatPhylip: 'PHYLIP' })[key] ?? key
  assert.equal(module.__test.summaryLabel(translate, 8, 60), '8 seq × 60 cols')
  assert.equal(module.__test.formatLabel(translate, 'phylip'), 'PHYLIP')
  assert.equal(module.__test.formatLabel(translate, 'fasta'), 'formatFasta')
})

test('opens only Session file addresses with alignment suffixes', () => {
  const { captured, module } = loadClient()
  const definition = captured.definition
  assert.equal(definition.canOpen('dsh-resource://file/session/s1/alignment.fasta'), true)
  assert.equal(definition.canOpen('dsh-resource://file/session/s1/a%20b.aln'), true)
  assert.equal(definition.canOpen('dsh-resource://file/session/s1/alignment.PHY'), true)
  assert.equal(definition.canOpen('dsh-resource://file/session/s1/alignment.fasta.gz'), true)
  assert.equal(definition.canOpen('dsh-resource://file/session/s1/alignment.txt'), false)
  assert.equal(definition.canOpen('dsh-resource://file/absolute/alignment.fasta'), false)
  assert.equal(definition.canOpen('dsh-resource://image/session/s1/alignment.fasta'), false)
  assert.equal(definition.canOpen('not-an-address'), false)
  assert.equal(definition.title('dsh-resource://file/session/s1/a%20b.aln'), 'a b.aln')
  assert.equal(definition.title('dsh-resource://file/session/s1/'), 'typeTitle')
  assert.equal(module.__test.matchesAnyPattern(module.__test.DEFAULT_ALIGNMENT_PATTERNS, 'dsh-resource://file/session/s1/x.sto'), true)
  assert.equal(module.__test.matchesAnyPattern(module.__test.DEFAULT_ALIGNMENT_PATTERNS, 'dsh-resource://file/session/s1/x.docx'), false)
  assert.equal(module.__test.patternMatches('*.fa*', 'x.fasta'), true)
  assert.equal(module.__test.patternMatches('*.FASTA', 'x.fasta'), true)
  assert.equal(module.__test.patternMatches('*.fa', 'x.fasta'), false)
})

test('format config defaults to every preset and is persisted only after saving', () => {
  const { captured, module, storage } = loadClient()
  assert.deepEqual(Array.from(captured.definition.patterns), Array.from(module.__test.DEFAULT_ALIGNMENT_PATTERNS))
  assert.equal(storage.has(module.__test.FORMATS_KEY), false)
  assert.equal(module.__test.FORMATS_KEY, 'dsh-seq-viewer:formats:v1')
  assert.ok(module.__test.DEFAULT_ALIGNMENT_PATTERNS.includes('*.fasta.gz'))
  assert.ok(module.__test.PRESET_GROUPS.every((group) => group.patterns.length > 0))
})

test('saving formats re-registers with presets plus custom globs and persists', () => {
  const { captured, formats, module, storage } = loadClient()
  const face = formats.spec.inject()
  face.setFormats({ selected: ['*.fasta', '*.phy'], custom: ['*.seq', '*.phy'] })
  assert.deepEqual(Array.from(captured.definition.patterns), ['*.fasta', '*.phy', '*.seq'])
  assert.equal(captured.definitions[0].disposed, true)
  assert.ok(captured.definitions.length >= 2)
  assert.equal(captured.definition.canOpen('dsh-resource://file/session/s1/x.seq'), true)
  assert.equal(captured.definition.canOpen('dsh-resource://file/session/s1/x.aln'), false)
  assert.deepEqual(JSON.parse(storage.get(module.__test.FORMATS_KEY)), {
    selected: ['*.fasta', '*.phy'],
    custom: ['*.seq'],
  })
  assert.deepEqual(plain(face.getFormats()), { selected: ['*.fasta', '*.phy'], custom: ['*.seq'] })
})

test('saved formats are honored on the next page load', () => {
  const key = 'dsh-seq-viewer:formats:v1'
  const storage = new Map([[key, JSON.stringify({ selected: ['*.fasta'], custom: ['*.seq'] })]])
  const { captured } = loadClient({ storage })
  assert.deepEqual(Array.from(captured.definition.patterns), ['*.fasta', '*.seq'])
})

test('clearing all formats disables claiming', () => {
  const { captured, formats } = loadClient()
  formats.spec.inject().setFormats({ selected: [], custom: [] })
  assert.deepEqual(Array.from(captured.definition.patterns), [])
  assert.equal(captured.definition.canOpen('dsh-resource://file/session/s1/x.fasta'), false)
})

test('normalizes saved config, splitting presets and custom globs', () => {
  const { module } = loadClient()
  const normalized = module.__test.normalizeFormatConfig({
    selected: ['*.fasta', '*.fasta', 'custom.seq', 42],
    custom: ['custom.seq', '*.phy'],
  })
  assert.deepEqual(Array.from(normalized.selected), ['*.fasta', '*.phy'])
  assert.deepEqual(Array.from(normalized.custom), ['custom.seq'])
})

test('custom pattern parsing trims comments, dedupes, and rejects paths', () => {
  const { module } = loadClient()
  const parsed = module.__test.parseCustomText(' *.seq \n# comment\n\n*.seq\n*.alignment.txt\n/abs/*.fasta\nsub\\*.fasta\n')
  assert.deepEqual(Array.from(parsed.patterns), ['*.seq', '*.alignment.txt'])
  assert.deepEqual(Array.from(parsed.invalid), ['/abs/*.fasta', 'sub\\*.fasta'])
})

test('format settings button is structurally and visually distinct from phylo', () => {
  const { captured, formats } = loadClient()
  const dict = captured.dictionaries.dictionaries.zh
  assert.equal(formats.spec.id, 'dsh-seq-viewer-formats')
  assert.equal(dict.formatsLabel, '序列')
  assert.match(dict.formatsButton, /序列/)
  assert.notEqual(dict.formatsButton, '树文件格式')
  assert.match(clientSource, /dsh-seq-formats-btn/)
  assert.doesNotMatch(clientSource, /dsh-phylo-formats-btn/)
  assert.match(clientSource, /data-dsh-seq-viewer-formats/)
})

test('slot body injects a reader that unwraps RemoteResult values', async () => {
  const { body } = loadClient()
  assert.equal(body.spec.name, 'sidebar.right.pane.tab')
  assert.equal(body.spec.key, 'dsh-seq-viewer')
  assert.equal(typeof body.spec.inject, 'function')
  assert.equal(typeof body.component, 'function')
  const { readAlignment } = body.spec.inject()
  const value = await readAlignment('s1', 'alignment.fasta', new AbortController().signal)
  assert.equal(value.bytes, 15)
  assert.equal(new TextDecoder().decode(value.data), '>a\nACGT\n>b\nAC-T\n')
})

test('slot body reader surfaces RemoteResult errors', async () => {
  const error = Object.assign(new Error('missing'), { code: 'workspace-file/not-found' })
  const { body } = loadClient({ readBytes: async () => ({ ok: false, error }) })
  const { readAlignment } = body.spec.inject()
  await assert.rejects(() => readAlignment('s1', 'missing.fasta', new AbortController().signal), (caught) => caught.code === 'workspace-file/not-found')
})

test('slot body reader tolerates a direct value from a carrier', async () => {
  const value = { data: new TextEncoder().encode('>a\nA\n'), bytes: 6 }
  const { body } = loadClient({ readBytes: async () => value })
  const { readAlignment } = body.spec.inject()
  assert.equal(await readAlignment('s1', 'alignment.fasta', new AbortController().signal), value)
})

test('open as text replaces the current tab with the built-in text kind', () => {
  const { body, opened } = loadClient()
  const { openAsText } = body.spec.inject()
  openAsText(ADDRESS, 'tab-1')
  assert.deepEqual(plain(opened), [{ address: ADDRESS, opts: { kind: 'text', replaceTab: 'tab-1' } }])
})

test('normalizes aligned FASTA and keeps duplicate names distinct', () => {
  const { module } = loadClient()
  const result = module.__test.normalizeAlignment(
    '>seq1 first\nACGT-ACGT\n>seq2\nACGT-AC-T\n>seq1 duplicate\nACGT-ACGA\n',
    'demo.fasta',
  )
  assert.equal(result.format, 'fasta')
  assert.equal(result.sequences, 3)
  assert.equal(result.columns, 9)
  assert.equal(result.isAminoAcid, false)
  assert.match(result.fasta, />seq1\nACGT-ACGT/)
  assert.match(result.fasta, />seq1#2\nACGT-ACGA/)
})

test('detects amino-acid alignments from content and from the .faa suffix', () => {
  const { module } = loadClient()
  const peptide = '>p1\nMKTLLLTLVV\n>p2\nMKTLLLTLVV\n>p3\nMKTLLLTFVV\n'
  assert.equal(module.__test.normalizeAlignment(peptide, 'pep.fasta').isAminoAcid, true)
  assert.equal(module.__test.normalizeAlignment('>a\nACGT\n>b\nACGT\n', 'genes.faa').isAminoAcid, true)
  assert.equal(module.__test.normalizeAlignment('>a\nACGT\n>b\nAC-T\n', 'genes.fasta').isAminoAcid, false)
})

test('parses CLUSTAL W blocks and skips consensus rulers', () => {
  const { module } = loadClient()
  const text = [
    'CLUSTAL W (1.83) multiple sequence alignment',
    '',
    'alpha   ACGTACGT      60',
    'beta    ACGTAC-T      55',
    '        **** **',
    '',
    'alpha   TTGACCAA      80',
    'beta    TTGACCAA      75',
    '        ********',
    '',
  ].join('\n')
  assert.equal(module.__test.detectFormat(text), 'clustal')
  const result = module.__test.normalizeAlignment(text, 'demo.aln')
  assert.equal(result.sequences, 2)
  assert.equal(result.columns, 16)
  assert.equal(result.format, 'clustal')
  assert.match(result.fasta, />alpha\nACGTACGTTTGACCAA/)
  assert.match(result.fasta, />beta\nACGTAC-TTTGACCAA/)
})

test('parses interleaved PHYLIP with names in the first block', () => {
  const { module } = loadClient()
  const text = [
    '3 10',
    'Alpha     ACGTAC',
    'Beta      ACGTAC',
    'Gamma     ACGTAC',
    '',
    'GTAA',
    'GT-A',
    'GTAA',
  ].join('\n')
  assert.equal(module.__test.detectFormat(text), 'phylip')
  const result = module.__test.normalizeAlignment(text, 'demo.phy')
  assert.equal(result.sequences, 3)
  assert.equal(result.columns, 10)
  assert.match(result.fasta, />Alpha\nACGTACGTAA/)
  assert.match(result.fasta, />Beta\nACGTACGT-A/)
})

test('parses one-line sequential PHYLIP', () => {
  const { module } = loadClient()
  const text = [
    '2 8',
    'Taxon_A   ACGTACGT',
    'Taxon_B   ACGTACGA',
  ].join('\n')
  const result = module.__test.normalizeAlignment(text, 'demo.phy')
  assert.equal(result.sequences, 2)
  assert.equal(result.columns, 8)
  assert.match(result.fasta, />Taxon_A\nACGTACGT/)
  assert.match(result.fasta, />Taxon_B\nACGTACGA/)
})

test('parses Stockholm alignments and annotation lines', () => {
  const { module } = loadClient()
  const text = [
    '# STOCKHOLM 1.0',
    '#=GF ID demo',
    'alpha ACGTACGT',
    'beta  ACGTAC-T',
    '#=GC RF xxxxxxxx',
    '//',
  ].join('\n')
  assert.equal(module.__test.detectFormat(text), 'stockholm')
  const result = module.__test.normalizeAlignment(text, 'demo.sto')
  assert.equal(result.sequences, 2)
  assert.equal(result.columns, 8)
  assert.match(result.fasta, />alpha\nACGTACGT/)
  assert.match(result.fasta, />beta\nACGTAC-T/)
})

test('rejects unknown and empty inputs with coded errors', () => {
  const { module } = loadClient()
  assert.throws(
    () => module.__test.normalizeAlignment('just some prose\nwithout sequences\n', 'notes.fasta'),
    (error) => error.code === 'alignment/unsupported',
  )
  assert.throws(
    () => module.__test.normalizeAlignment('>empty\n\n>also\n\n', 'empty.fasta'),
    (error) => error.code === 'alignment/empty',
  )
  assert.equal(module.__test.errorKey({ code: 'alignment/unsupported' }), 'errorUnsupported')
  assert.equal(module.__test.errorKey({ code: 'alignment/empty' }), 'errorNoSequences')
})

test('decodes gzip alignments, detects magic without the suffix, and rejects bad gzip', async () => {
  const { module } = loadClient()
  const text = '>a\nACGT\n>b\nAC-T\n'
  const gz = gzipSync(Buffer.from(text))
  assert.equal(await module.__test.decodeAlignmentBytes(gz, 'alignment.fasta.gz'), text)
  assert.equal(await module.__test.decodeAlignmentBytes(gz, 'alignment.fasta'), text)
  await assert.rejects(
    () => module.__test.decodeAlignmentBytes(new Uint8Array([1, 2, 3]), 'broken.fasta.gz'),
    (error) => error.code === 'gzip-invalid',
  )
  await assert.rejects(
    () => module.__test.decodeAlignmentBytes(new TextEncoder().encode('plain'), 'plain.fasta.gz'),
    (error) => error.code === 'gzip-invalid',
  )
})

test('context menu lists other tab types and the Host desktop applications', async () => {
  const apps = [{ id: 'vscode', name: 'VS Code', default: true, icon: null }]
  const { menu, opened, called } = loadClient({
    canOpenWorkspacePath: async () => ({ ok: true, value: true }),
    workspacePathApplications: async () => ({ ok: true, value: apps }),
  })
  assert.equal(menu.spec.id, 'dsh-seq-viewer')
  const face = menu.spec.inject()
  const openers = face.listOpeners(ADDRESS)
  assert.deepEqual(Array.from(openers, (entry) => entry.kind), ['sequence-alignment', 'text'])
  face.openWith(ADDRESS, 'text', 'tab-1')
  assert.deepEqual(plain(opened), [{ address: ADDRESS, opts: { kind: 'text', replaceTab: 'tab-1' } }])

  const result = await face.appsFor('s1', 'alignment.fasta')
  assert.equal(result.desktop, true)
  assert.equal(result.absolutePath, 'C:/ws/alignment.fasta')
  assert.deepEqual(plain(result.apps), apps)

  assert.equal(await face.openExternal('C:/ws/alignment.fasta', 'vscode', 'open'), true)
  assert.equal(await face.openExternal('C:/ws/alignment.fasta', undefined, 'reveal'), true)
  assert.deepEqual(plain(called), [
    { path: 'C:/ws/alignment.fasta', application: 'vscode' },
    { path: 'C:/ws/alignment.fasta', action: 'reveal' },
  ])
})

test('context menu hides desktop applications when the Host has no desktop capability', async () => {
  const { menu } = loadClient()
  const result = await menu.spec.inject().appsFor('s1', 'alignment.fasta')
  assert.equal(result.desktop, false)
  assert.deepEqual(plain(result.apps), [])
  assert.equal(result.absolutePath, 'C:/ws/alignment.fasta')
})

test('bundled example files normalize to the expected shape', () => {
  const { module } = loadClient()
  const read = (name) => fs.readFileSync(path.join(root, 'examples', name), 'utf8')

  const nt = module.__test.normalizeAlignment(read('demo_alignment.fasta'), 'demo_alignment.fasta')
  assert.equal(nt.format, 'fasta')
  assert.equal(nt.sequences, 8)
  assert.equal(nt.columns, 60)
  assert.equal(nt.isAminoAcid, false)

  const aa = module.__test.normalizeAlignment(read('demo_alignment_aa.fasta'), 'demo_alignment_aa.fasta')
  assert.equal(aa.sequences, 6)
  assert.equal(aa.columns, 60)
  assert.equal(aa.isAminoAcid, true)

  const aln = module.__test.normalizeAlignment(read('demo_alignment.aln'), 'demo_alignment.aln')
  assert.equal(aln.format, 'clustal')
  assert.equal(aln.sequences, 4)
  assert.equal(aln.columns, 32)

  const phy = module.__test.normalizeAlignment(read('demo_alignment.phy'), 'demo_alignment.phy')
  assert.equal(phy.format, 'phylip')
  assert.equal(phy.sequences, 4)
  assert.equal(phy.columns, 32)

  const sto = module.__test.normalizeAlignment(read('demo_alignment.sto'), 'demo_alignment.sto')
  assert.equal(sto.format, 'stockholm')
  assert.equal(sto.sequences, 4)
  assert.equal(sto.columns, 32)
})
