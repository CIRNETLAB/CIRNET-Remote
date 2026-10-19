import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Box3, Group, Mesh } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { getArtifactDirectory } from '../../../scripts/artifact-paths.mjs'

// Offline authoring tool. sharp is only a PNG rasterizer here, never a browser
// dependency. npm ci supplies it, or use --sharp-module /absolute/path/to/sharp.
const require = createRequire(import.meta.url)
const argument = process.argv.indexOf('--sharp-module')
const sharp = require(argument >= 0 ? process.argv[argument + 1] : 'sharp')
const web = new URL('../', import.meta.url)
const source = (name) => fileURLToPath(new URL(`src/three/${name}.ts`, web))
const temp = pathToFileURL(getArtifactDirectory('generator-export') + '/')
await build({ entryPoints: [source('FunctionGeneratorModel'), source('FunctionGeneratorArtwork')], outdir: fileURLToPath(temp), outExtension: { '.js': '.mjs' }, bundle: true, packages: 'external', platform: 'node', format: 'esm',
  plugins: [{ name: 'external-three-from-authoring-tool', setup(context) { context.onResolve({ filter: /^three(?:\/|$)/ }, ({ path }) => ({ path: import.meta.resolve(path), external: true })) } }] })
const { addFunctionGeneratorModel, FUNCTION_GENERATOR_SIZE } = await import(new URL('FunctionGeneratorModel.mjs', temp).href)
const { GENERATOR_LAYOUT, instrumentArtworkSvg, generatorScreenArtwork, generatorLegendsArtwork } = await import(new URL('FunctionGeneratorArtwork.mjs', temp).href)

// GLTFExporter uses FileReader for Blob serialization. No DOM or fake canvas is
// needed: geometry exports first; actual encoded PNGs are embedded afterwards.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.() }) }
  readAsDataURL(blob) { blob.arrayBuffer().then((result) => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.() }) }
}
const root = new Group(); root.name = 'net_circuit_function_generator_2ch'
root.userData = { model: 'net*CIRCUIT L1571979 two-channel function generator', size: FUNCTION_GENERATOR_SIZE, origin: 'center-bottom', up: 'Y', front: '+Z', unit: 'editor-world-unit', visualOnly: true }
addFunctionGeneratorModel(root); root.updateMatrixWorld(true)
const gltf = await new GLTFExporter().parseAsync(root, { binary: false, onlyVisible: true })
const geometry = Buffer.from(gltf.buffers[0].uri.split(',')[1], 'base64')
gltf.buffers[0].uri = 'function-generator-2ch.bin'
const favicon = await readFile(new URL('src/assets/icons/favicon.svg', web), 'utf8')
const embeddedLogo = favicon.match(/href="data:image\/(?:webp|png);base64,([^"]+)"/)?.[1]
if (!embeddedLogo) throw new Error('favicon.svg must contain its supplied owl artwork')
const images = [
  { material: 'generator_screen', filename: 'screen.png', png: await sharp(Buffer.from(instrumentArtworkSvg(generatorScreenArtwork()))).png().toBuffer() },
  { material: 'generator_legends', filename: 'legends.png', png: await sharp(Buffer.from(instrumentArtworkSvg(generatorLegendsArtwork()))).png().toBuffer() },
  { material: 'generator_brand', filename: 'owl.png', png: await sharp(Buffer.from(embeddedLogo, 'base64')).png().toBuffer() },
]
gltf.images = images.map((image) => ({ uri: image.filename }))
gltf.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }]
gltf.textures = images.map((_, i) => ({ sampler: 0, source: i }))
images.forEach((image, i) => {
  const material = gltf.materials.find((material) => material.name === image.material)
  if (!material) throw new Error(`Missing texture slot: ${image.material}`)
  material.pbrMetallicRoughness.baseColorFactor = [1, 1, 1, 1]
  material.pbrMetallicRoughness.baseColorTexture = { index: i }
  if (image.material !== 'generator_screen') material.alphaMode = 'BLEND'
})
// Preserve the front-facing UV orientation: glTF textures have flipY=false.
// Three's exporter normally flips CanvasTexture image rows. Here the source maps
// are supplied afterwards: invert V instead, once for each of our three planes.
for (const node of gltf.nodes.filter((node) => ['screen', 'front_legends', 'brand_owl'].includes(node.name))) {
  const accessor = gltf.accessors[gltf.meshes[node.mesh].primitives[0].attributes.TEXCOORD_0]
  const view = gltf.bufferViews[accessor.bufferView]
  const offset = view.byteOffset + (accessor.byteOffset ?? 0)
  for (let i = 0; i < accessor.count; i++) {
    const y = offset + i * (view.byteStride ?? 8) + 4
    geometry.writeFloatLE(1 - geometry.readFloatLE(y), y)
  }
}
const align = (bytes, fill = 0) => Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4, fill)])
const packed = structuredClone(gltf); delete packed.buffers[0].uri
const chunks = [align(geometry)]
let length = chunks[0].length
packed.images = images.map((image) => {
  const bufferView = packed.bufferViews.length
  packed.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: image.png.length })
  const chunk = align(image.png); chunks.push(chunk); length += chunk.length
  return { bufferView, mimeType: 'image/png' }
})
packed.buffers[0].byteLength = length
const json = align(Buffer.from(JSON.stringify(packed)), 0x20), bin = Buffer.concat(chunks)
const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8)
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + bin.length, 8)
jsonHeader.writeUInt32LE(json.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4)
binHeader.writeUInt32LE(bin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4)
const glb = Buffer.concat([header, jsonHeader, json, binHeader, bin])
const output = new URL('public/models/function-generator-2ch/', web)
await mkdir(output, { recursive: true })
await writeFile(new URL('function-generator-2ch.gltf', output), JSON.stringify(gltf, null, 2) + '\n')
await writeFile(new URL('function-generator-2ch.bin', output), geometry)
await writeFile(new URL('function-generator-2ch.glb', output), glb)
for (const image of images) await writeFile(new URL(image.filename, output), image.png)

// Palette SVG is derived from the same layout and screen recipe as the GLB.
// PNG below is a front illustration; the development viewer verifies actual GLB.
const px = x => (x / 6 + 0.5) * 1536, py = y => (1 - y / 3.6) * 922
const rect = (x, y, w, h, color, r = 8) => `<rect x="${px(x - w / 2)}" y="${py(y + h / 2)}" width="${w * 256}" height="${h / 3.6 * 922}" rx="${r}" fill="${color}"/>`
const circle = (x, y, radius, fill, stroke = 'none', width = 1) => `<circle cx="${px(x)}" cy="${py(y)}" r="${radius * 256}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`
const body = artwork => instrumentArtworkSvg(artwork).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
const { screen, recess, panel, owl, encoder, power } = GENERATOR_LAYOUT
const keys = GENERATOR_LAYOUT.buttons.map(k => {
  const w = k.w ?? .38, h = k.h ?? .24
  return rect(k.x, k.y, w + .028, h + .028, k.accent ?? '#080f16') + rect(k.x, k.y, w, h, k.color) + (k.accent ? rect(k.x, k.y + .071, .12, .024, k.accent, 3) : '')
}).join('')
const soft = GENERATOR_LAYOUT.softKeys.map(k => rect(k.x, k.y, .294, .266, '#080f16') + rect(k.x, k.y, .265, .24, '#35434e') + rect(k.x, k.y, .096, .024, '#20d4ee', 3)).join('')
const arrows = GENERATOR_LAYOUT.arrows.map(k => rect(k.x, k.y, .308, .268, '#080f16') + rect(k.x, k.y, .28, .24, '#35434e')).join('')
const bncs = GENERATOR_LAYOUT.outputs.map(k => circle(k.x, k.y, .185, '#080f16', k.accent, 10) + circle(k.x, k.y, .14, '#e1e8ec', '#b7c4cf', 10) + circle(k.x, k.y, .041, '#080f16', '#cba669', 4)).join('')
const dots = Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return circle(encoder.x + Math.cos(a) * .44, encoder.y + Math.sin(a) * .44, .018, '#20d4ee') }).join('')
const corners = [-2.80, 2.80].flatMap(x => [.72, 3.20].map(y => rect(x, y, .36, .50, '#30383e', 14))).join('')
const stand = rect(0, .06, 5.94, .12, '#30383e', 10) + [-2.85, 2.85].map(x => rect(x, .38, .23, .66, '#30383e', 10)).join('')
const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="922" viewBox="-30 -20 1596 962">${stand}${rect(0, 1.98, 6, 3.02, '#a1aab4', 25)}${rect(0, 1.98, 5.96, 3.00, '#30383e', 22)}${rect(0, 1.98, 5.65, 2.66, '#272e33', 16)}${corners}${rect(recess.x, recess.y, recess.w, recess.h, '#080f16', 12)}${rect(panel.x, panel.y, panel.w + .025, panel.h + .025, '#35434e')}${rect(panel.x, panel.y, panel.w, panel.h, '#272e33')}<g transform="translate(${px(screen.x - screen.w / 2)} ${py(screen.y + screen.h / 2)}) scale(${screen.w * 256 / 1024} ${screen.h / 3.6 * 922 / 768})">${body(generatorScreenArtwork())}</g>${soft}${keys}${arrows}${dots}${circle(encoder.x, encoder.y, .365, '#080f16', '#b7c4cf', 5)}${circle(encoder.x, encoder.y, .315, '#30383e')}${circle(encoder.x + .12, encoder.y - .17, .068, '#080f16')}${bncs}${circle(power.x, power.y, .159, '#272e33', '#20d4ee', 8)}<path d="M ${px(power.x)} ${py(power.y + .08)} v 20" stroke="#e1e8ec" stroke-width="4"/>${circle(power.x, power.y, .057, 'none', '#e1e8ec', 4)}<image x="${px(owl.x - owl.size / 2)}" y="${py(owl.y + owl.size / 2)}" width="${owl.size * 256}" height="${owl.size / 3.6 * 922}" href="data:image/png;base64,${images[2].png.toString('base64')}"/>${body(generatorLegendsArtwork())}</svg>`
await writeFile(new URL('preview.svg', output), preview + '\n')
await writeFile(new URL('preview.png', output), await sharp(Buffer.from(preview)).resize(1200).png().toBuffer())
await writeFile(new URL('src/assets/icons/function_generator_2ch.svg', web), preview.replace('width="1536" height="922"', 'width="240" height="160"') + '\n')
let triangles = 0, meshes = 0
root.traverse(node => { if (node instanceof Mesh) { meshes++; triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3 } })
console.log(JSON.stringify({ output: fileURLToPath(output), triangles, meshes, glbBytes: glb.length, encoderPivots: 1, channels: 2, bncConnectors: 3, chassisPitchDegrees: root.getObjectByName('visual_chassis').rotation.x * 180 / Math.PI, minimumY: new Box3().setFromObject(root, true).min.y }))

