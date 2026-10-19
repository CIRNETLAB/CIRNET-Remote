import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { parse, compileScript } from 'vue/compiler-sfc'
import { createSSRApp, h, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createPinia } from 'pinia'
import { useInstrumentStore } from '../src/stores/instrument'
import { useCircuitStore } from '../src/stores/circuit'
import { useUiStore } from '../src/stores/ui'
import { windowDefinitions } from '../src/types/windows'
import { CH1_COLOR, CH2_COLOR, SCOPE_KEYS, SCOPE_LABELS } from '../src/data/instrumentVisuals'
import { SCOPE_LAYOUT, scopeLegendsArtwork } from '../src/three/OscilloscopeArtwork'

// Render the actual SFCs using Vue/esbuild already supplied by this project.
// No browser, sample source or separate test framework is needed.
async function windowComponent(name: string): Promise<Component> {
  const outfile = resolve('.test-build', `${name}.ssr.mjs`)
  await build({ entryPoints: [resolve('src/components/windows', `${name}.vue`)], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', plugins: [{
    name: 'instrument-sfc', setup(builder) {
      builder.onLoad({ filter: /\.vue$/ }, async ({ path }) => {
        const { descriptor } = parse(await readFile(path, 'utf8'), { filename: path })
        const script = compileScript(descriptor, { id: name, inlineTemplate: true, templateOptions: { ssr: true } })
        return { contents: script.content, loader: 'ts', resolveDir: dirname(path) }
      })
    },
  }] })
  return (await import(pathToFileURL(outfile).href)).default
}

async function renderWindow(name: string, channels: string[] = []) {
  const component = await windowComponent(name), pinia = createPinia()
  const instrument = useInstrumentStore(pinia), circuit = useCircuitStore(pinia)
  circuit.createDraft('Instrument visual test')
  instrument.monitor.channels = channels
  const before = JSON.stringify({ instrument: instrument.$state, circuit: circuit.$state })
  const html = await renderToString(createSSRApp({ render: () => h(component) }).use(pinia))
  assert.equal(JSON.stringify({ instrument: instrument.$state, circuit: circuit.$state }), before, 'rendering must not create acquisition state, samples or graph edits')
  return html
}

test('scope renders its front-panel controls with an empty capture screen and no sample renderer', async () => {
  const html = await renderWindow('OscilloscopeWindow')
  for (const label of ['Horizontal', 'Trigger', 'Vertical', 'Auto Set', 'Run/Stop', 'Single', 'Default', 'Mode', 'Source', 'Slope', 'Menu', 'NO CAPTURE SOURCE']) assert.ok(html.includes(label), label)
  for (const label of ['Time / Div','Horizontal Position','Trigger Level']) assert.ok(html.includes(`aria-label="${label}"`), label)
  assert.match(html,/0 declared channels/);assert.doesNotMatch(html,/aria-label="CH[12] Volts/);assert.match(html, /<fieldset[^>]*disabled/)
  assert.match(html, /Empty oscilloscope grid; no waveform data/)
  assert.match(html, /Frequency[\s\S]*—/)
  assert.doesNotMatch(html, /<canvas|<polyline|PREVIEW|1GSa\/s/)
  assert.ok(html.includes('--instrument-ch1:' + CH1_COLOR)); assert.ok(html.includes('--instrument-ch2:' + CH2_COLOR))
  assert.equal(SCOPE_LAYOUT.knobs.find(knob => knob.name === 'ch1_volts_div')!.accent, CH1_COLOR)
  assert.equal(SCOPE_LAYOUT.knobs.find(knob => knob.name === 'ch2_volts_div')!.accent, CH2_COLOR)
  const legends = scopeLegendsArtwork().commands.filter(command => command.kind === 'text').map(command => command.text)
  for (const control of Object.values(SCOPE_KEYS)) assert.ok(legends.includes(control.label))
  for (const label of Object.values(SCOPE_LABELS)) assert.ok(legends.includes(label))
})

test('monitor has capture status, time markers and honest empty channels/measurements', async () => {
  const html = await renderWindow('SignalMonitorWindow')
  for (const text of ['NO TRACE DATA', 'NO CAPTURE SOURCE', 'Channels', 'No channels configured', 'Time Base', 'Trigger', 'Samples', 'Duration', 'Edges']) assert.ok(html.includes(text), text)
  assert.match(html, /aria-label="Run"/)
  assert.doesNotMatch(html, /Pause/)
  assert.match(html, /<fieldset[^>]*disabled/)
  assert.match(html, /Empty signal monitor; no acquired traces/)
  assert.match(html, /1 ms/)
  assert.doesNotMatch(html, /<canvas|<polyline|Capturing|Triggered/)
})

test('configured monitor names remain escaped labels without fabricating digital traces', async () => {
  const html = await renderWindow('SignalMonitorWindow', ['CLK', 'DATA<&>', 'ENABLE'])
  assert.ok(html.includes('CLK')); assert.ok(html.includes('DATA&lt;&amp;&gt;')); assert.ok(html.includes('ENABLE'))
  assert.ok(!html.includes('No channels configured'))
  assert.ok(html.includes('NO TRACE DATA'))
  assert.doesNotMatch(html, /<polyline|<canvas/)
})

test('instrument windows remain bounded and restore defaults while Inspector and Hex retain their sizes', () => {
  const scope = windowDefinitions.oscilloscope
  assert.ok(scope.width >= 720 && scope.width <= 780)
  assert.ok(scope.height >= 480 && scope.height <= 540)
  const pinia = createPinia(), ui = useUiStore(pinia)
  ui.setViewport(1200, 800); ui.setWorkbenchSize(1200, 800)
  ui.openWindow('oscilloscope'); ui.openWindow('monitor')
  ui.setWorkbenchSize(390, 480); ui.setViewport(390, 362)
  for (const window of ui.windows) {
    assert.ok(window.x >= 54 && window.y >= 96)
    assert.ok(window.x + window.width <= 390 && window.y + window.height <= 362)
  }
  ui.setWorkbenchSize(1200, 800); ui.setViewport(1200, 800)
  assert.equal(ui.windows[0].width, scope.width); assert.equal(ui.windows[0].height, scope.height)
  assert.deepEqual(windowDefinitions.generator, { title: 'Function Generator', width: 760, height: 530 })
  assert.deepEqual(windowDefinitions.inspector, { title: 'Inspector', width: 400, height: 470 })
  assert.deepEqual(windowDefinitions['hex-editor'], { title: 'Hex Editor', width: 470, height: 330 })
})
