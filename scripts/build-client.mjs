import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const templatePath = path.join(root, 'scripts/client.template.js')
const viewerPath = path.join(root, 'viewer-app/dist/index.html')
const outputPath = path.join(root, 'lib/client.js')

if (!fs.existsSync(viewerPath)) {
  console.error('viewer-app/dist/index.html is missing; run `node scripts/build-viewer.mjs` first')
  process.exit(1)
}

const template = fs.readFileSync(templatePath, 'utf8')
if (!template.includes('__VIEWER_HTML__')) {
  console.error('scripts/client.template.js has no __VIEWER_HTML__ placeholder')
  process.exit(1)
}

const viewerHtml = fs.readFileSync(viewerPath, 'utf8')
// Keep the embedded document from terminating a surrounding <script> if the
// bundle is ever inlined by a carrier.
const serialized = JSON.stringify(viewerHtml).replace(/</g, '\\u003c')
const output = template.replace('__VIEWER_HTML__', () => serialized)
fs.writeFileSync(outputPath, output)
console.log(`lib/client.js written: ${(output.length / 1024).toFixed(0)} KiB (viewer ${(viewerHtml.length / 1024).toFixed(0)} KiB)`)
