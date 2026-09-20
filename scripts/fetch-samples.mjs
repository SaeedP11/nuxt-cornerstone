/**
 * Download sample DICOM files into playground/public/samples/.
 *
 * These are the MIT-licensed test images from the Cornerstone3D repository:
 * one CT slice encoded in several transfer syntaxes. Loading all of them as a
 * single stack is a direct smoke test of the WASM codec wiring — each entry
 * goes through a different decoder — and gives the slice slider something to
 * scroll through.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE
  = 'https://raw.githubusercontent.com/cornerstonejs/cornerstone3D/main/packages/dicomImageLoader/examplesOld/test-images'

/** `[local name, label, source file]` — order is the stack order. */
const SAMPLES = [
  ['01-implicit-le.dcm', 'Implicit VR little endian (uncompressed)', 'CTImage.dcm_LittleEndianImplicitTransferSyntax_1.2.840.10008.1.2.dcm'],
  ['02-explicit-le.dcm', 'Explicit VR little endian (uncompressed)', 'CTImage.dcm_LittleEndianExplicitTransferSyntax_1.2.840.10008.1.2.1.dcm'],
  ['03-explicit-be.dcm', 'Explicit VR big endian (uncompressed)', 'CTImage.dcm_BigEndianExplicitTransferSyntax_1.2.840.10008.1.2.2.dcm'],
  ['04-rle.dcm', 'RLE lossless', 'CTImage.dcm_RLELosslessTransferSyntax_1.2.840.10008.1.2.5.dcm'],
  ['05-jpeg-lossless.dcm', 'JPEG lossless SV1 (jpeg-lossless-decoder-js)', 'CTImage.dcm_JPEGProcess14SV1TransferSyntax_1.2.840.10008.1.2.4.70.dcm'],
  ['06-jpeg-baseline.dcm', 'JPEG baseline (WASM: libjpeg-turbo)', 'CTImage.dcm_JPEGProcess1TransferSyntax_1.2.840.10008.1.2.4.50.dcm'],
  ['07-jpeg-ls.dcm', 'JPEG-LS lossless (WASM: charls)', 'CTImage.dcm_JPEGLSLosslessTransferSyntax_1.2.840.10008.1.2.4.80.dcm'],
  ['08-jpeg2000.dcm', 'JPEG 2000 lossless (WASM: openjpeg)', 'CTImage.dcm_JPEG2000LosslessOnlyTransferSyntax_1.2.840.10008.1.2.4.90.dcm'],
  // Deliberately absent: Deflated Explicit VR Little Endian
  // (1.2.840.10008.1.2.1.99). Cornerstone3D 5.10.7's default metadata path
  // naturalises Part 10 with dcmjs's AsyncDicomReader, which does not inflate
  // the deflated dataset, so the load fails with "no pixel data in
  // NATURALIZED". It works with dicomImageLoader.useLegacyMetadataProvider,
  // which parses through dicom-parser and pako instead. See the README.
]

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'playground', 'public', 'samples')

await mkdir(outDir, { recursive: true })

const manifest = []
let failures = 0

for (const [name, label, source] of SAMPLES) {
  const url = `${BASE}/${source}`
  process.stdout.write(`${name} … `)
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    await writeFile(join(outDir, name), bytes)
    manifest.push({ name, label, bytes: bytes.byteLength })
    console.log(`${(bytes.byteLength / 1024).toFixed(0)} KiB`)
  }
  catch (error) {
    failures += 1
    console.log(`failed (${error.message})`)
  }
}

await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`\n${manifest.length}/${SAMPLES.length} samples in playground/public/samples/`)
if (failures > 0) process.exitCode = 1
