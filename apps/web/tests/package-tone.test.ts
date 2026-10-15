import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Color, Group, Mesh, MeshStandardMaterial } from 'three'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'
import { addPackageModel } from '../src/three/PackageModel'
import { getPartForType } from '../src/data/partCatalog'
import { getDefinition } from '../src/data/editorCatalog'
import { createPackageThumbnailCache } from '../src/three/PackageThumbnails'

const materialOf = (model: Group, name: string) => (model.getObjectByName(name) as Mesh<any, MeshStandardMaterial>).material
const channels = (color: Color) => color.clone().convertLinearToSRGB().toArray()
function assertSubdued(actual: Color, original: string) {
  const before = channels(new Color(original)), after = channels(actual)
  for (let i = 0; i < 3; i++) {
    const ratio = after[i]! / before[i]!
    assert.ok(ratio >= .88 && ratio <= .92, `coating channel ${i} keeps its hue with a modest decrease; ratio=${ratio}`)
  }
}

test('only requested physical package body coatings receive the modest tone decrease', () => {
  const cases = [
    ['RESISTOR_AXIAL', '#467697'], ['CAPACITOR_CERAMIC', '#cba05e'], ['CAPACITOR_ELECTROLYTIC', '#253d57'],
    ['DIODE_1N4148', '#ae613a'], ['ZENER_1N4733A', '#ae613a'], ['TRANSISTOR_2N3904', '#24272b'],
    ['LED_LTL307EE', '#ba3434'], ['BUZZER_PS1240', '#24272b'], ['TOGGLE_SWITCH_200MSP1', '#272c30'],
    ['PUSH_BUTTON_B3F1000', '#272c30'], ['DIP_SWITCH_A6D4100', '#a52e28'], ['SN74HC08N', '#24272b'], ['SN74LS266N', '#24272b'],
  ] as const
  for (const [type, original] of cases) {
    const model = buildComponent({ id: 'component', type })
    try { assertSubdued(materialOf(model, 'package-body').color, original) }
    finally { disposeObject(model) }
  }
})

test('tone adjustment preserves silver leads, resistor bands, LED hue and polarity markings', () => {
  const resistor = buildComponent({ id: 'R1', type: 'RESISTOR_AXIAL', properties: { resistanceOhms: 1000, tolerancePercent: 1 } })
  const capacitor = buildComponent({ id: 'C1', type: 'CAPACITOR_ELECTROLYTIC' })
  const led = buildComponent({ id: 'D1', type: 'LED_LTL307EE' })
  const logic = buildComponent({ id: 'U1', type: 'SN74HC08N' })
  try {
    for (const model of [resistor, capacitor, led, logic]) {
      model.traverse(object => {
        if (object instanceof Mesh && object.name === 'lead-metal') {
          const material = object.material as MeshStandardMaterial
          assert.equal(material.color.getHexString(), 'd8dce0')
          assert.equal(material.metalness, .86)
        }
      })
    }
    assert.deepEqual([0, 1, 2, 3, 4].map(i => materialOf(resistor, `package-resistor-band-${i}`).color.getHexString()), ['704725', '1c1d20', '1c1d20', '704725', '704725'])
    assert.equal(materialOf(capacitor, 'package-polarity-stripe').color.getHexString(), 'c9ccc1')
    assert.equal(materialOf(capacitor, 'package-capacitor-lid').color.getHexString(), 'd8dce0')
    assert.equal(materialOf(led, 'package-cathode-marker').color.getHexString(), 'c9ccc1')
    assert.equal(materialOf(logic, 'package-pin1-marker').color.getHexString(), 'c9ccc1')
    assert.equal(logic.getObjectByName('package-marking')?.userData.text, '74HC08')
    const lens = materialOf(led, 'package-body')
    assertSubdued(lens.color, '#ba3434')
    assert.equal(lens.transparent, false)
    assert.equal(lens.emissiveIntensity, 0)
  } finally { for (const model of [resistor, capacitor, led, logic]) disposeObject(model) }
})

test('Display and terminal package colors stay outside the body tone adjustment', () => {
  for (const type of ['SEGMENT_SC5611EWA', 'SEGMENT_DC5611EWA', 'SEGMENT_CC5612EWA', 'DC_SUPPLY']) {
    const part = getPartForType(type)!, model = new Group()
    addPackageModel(model, { id: 'component', type }, part)
    try {
      assert.equal(materialOf(model, 'package-body').color.getHexString(), type === 'DC_SUPPLY' ? '929ea7' : '24272b')
      if (type !== 'DC_SUPPLY') {
        assert.equal(materialOf(model, 'package-display-face').color.getHexString(), '101317')
        assert.equal(materialOf(model, 'package-digit-0-a').color.getHexString(), '482526')
      }
    } finally { disposeObject(model) }
  }
})

test('Arithmetic changes only the abstraction body while saved legacy groups retain their colors', () => {
  for (const type of ['ADDER', 'MULTIPLIER', 'MEMORY', 'DISPLAY', 'PROBE']) {
    const definition = getDefinition(type)!, model = buildComponent({ id: 'component', type })
    try {
      const body = model.children.find(object => object instanceof Mesh && object.userData.selectionSurface) as Mesh<any, MeshStandardMaterial>
      if (type === 'ADDER' || type === 'MULTIPLIER') assertSubdued(body.material.color, definition.color)
      else assert.equal(body.material.color.getHexString(), new Color(definition.color).getHexString())
      const endpoint = model.children.find(object => object.userData.kind === 'port') as Mesh<any, MeshStandardMaterial> | undefined
      if (endpoint) assert.ok(['ddb56d', '69cbbb', '96bde6'].includes(endpoint.material.color.getHexString()), 'logical endpoint colors remain clear')
    } finally { disposeObject(model) }
  }
})

test('thumbnail and workspace use the same subdued package body materials', async () => {
  const workspace = buildComponent({ id: 'workspace', type: 'RESISTOR_AXIAL' })
  let thumbnailColor: string | undefined
  const cache = createPackageThumbnailCache({ createRenderer: () => ({
    render(model) { thumbnailColor = materialOf(model, 'package-body').color.getHexString(); return 'data:image/png;base64,preview' }, dispose() {},
  }) })
  const lease = cache.acquire('RESISTOR_AXIAL')
  try {
    await lease.ready
    assert.equal(thumbnailColor, materialOf(workspace, 'package-body').color.getHexString())
    assertSubdued(materialOf(workspace, 'package-body').color, '#467697')
  } finally { lease.release(); disposeObject(workspace) }
})
