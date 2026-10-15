import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useCircuitStore } from '../src/stores/circuit'
import { useUiStore } from '../src/stores/ui'
import { ribbonGroups } from '../src/data/ribbon'
import { componentCatalog, getDefinition } from '../src/data/editorCatalog'
import { parseCircuitFile } from '../src/services/files/circuitFile'
import { loadSfc, mountSfc } from './helpers/vueSfc'

test('canonical editorCatalog and ribbon expose standardized display names', () => {
  const bb100Def = getDefinition('BREADBOARD_100')
  const supplyDef = getDefinition('POWER_SUPPLY')

  assert.ok(bb100Def, 'BREADBOARD_100 definition must exist')
  assert.equal(bb100Def.name, 'Power Breadboard')

  assert.ok(supplyDef, 'POWER_SUPPLY definition must exist')
  assert.equal(supplyDef.name, 'Power Supply')

  const structureGroup = ribbonGroups.find((g) => g.id === 'structure')
  assert.ok(structureGroup, 'Structure group must exist in ribbon')

  const ribbonBb100 = structureGroup.items.find((item) => item.type === 'BREADBOARD_100')
  assert.ok(ribbonBb100, 'BREADBOARD_100 must exist in Structure ribbon group')
  assert.equal(ribbonBb100.name, 'Power Breadboard')

  const ribbonSupply = structureGroup.items.find((item) => item.type === 'POWER_SUPPLY')
  assert.ok(ribbonSupply, 'POWER_SUPPLY must exist in Structure ribbon group')
  assert.equal(ribbonSupply.name, 'Power Supply')

  // Verify legacy names are nowhere in the catalog or ribbon
  const allCatalogNames = componentCatalog.map((c) => c.name)
  const allRibbonNames = ribbonGroups.flatMap((g) => g.items.map((i) => i.name))
  for (const legacy of ['Solderless Breadboard', 'Power supply visual']) {
    assert.ok(!allCatalogNames.includes(legacy), `Catalog must not contain legacy name: ${legacy}`)
    assert.ok(!allRibbonNames.includes(legacy), `Ribbon must not contain legacy name: ${legacy}`)
  }
})

test('Structure picker renders Power Breadboard and Power Supply in ComponentRibbon', async () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const oldResizeObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver')
  const oldRAF = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame')
  const oldCAF = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame')

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    },
  })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      addEventListener() {},
      removeEventListener() {},
      querySelector() { return null },
    },
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  })
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number,
  })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: (id: number) => clearTimeout(id),
  })

  try {
    const pinia = createPinia()
    setActivePinia(pinia)
    const ui = useUiStore()
    ui.activeRibbonGroup = 'structure'

    const ribbonComponent = await loadSfc('components/workbench/ComponentRibbon.vue')
    const view = mountSfc(ribbonComponent, pinia)
    try {
      const renderedText = view.text()
      assert.ok(renderedText.includes('Power Breadboard'), 'Structure picker must display "Power Breadboard"')
      assert.ok(renderedText.includes('Power Supply'), 'Structure picker must display "Power Supply"')
      assert.ok(!renderedText.includes('Solderless Breadboard'), 'Structure picker must NOT display "Solderless Breadboard"')
      assert.ok(!renderedText.includes('Power supply visual'), 'Structure picker must NOT display "Power supply visual"')
    } finally {
      view.app.unmount()
    }
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window')
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document')
    if (oldResizeObserver) Object.defineProperty(globalThis, 'ResizeObserver', oldResizeObserver); else Reflect.deleteProperty(globalThis, 'ResizeObserver')
    if (oldRAF) Object.defineProperty(globalThis, 'requestAnimationFrame', oldRAF); else Reflect.deleteProperty(globalThis, 'requestAnimationFrame')
    if (oldCAF) Object.defineProperty(globalThis, 'cancelAnimationFrame', oldCAF); else Reflect.deleteProperty(globalThis, 'cancelAnimationFrame')
  }
})

test('Component Info of BREADBOARD_100 displays Power Breadboard', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const circuit = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()

  circuit.createDraft()
  const bbId = circuit.placeModule('BREADBOARD_100', { x: 0, y: 0, z: 0 })
  workspace.selectModule(bbId)
  ui.openWindow('component-info')

  const componentInfoComponent = await loadSfc('components/windows/ComponentInfoWindow.vue')
  const view = mountSfc(componentInfoComponent, pinia)
  try {
    const aside = view.all().find((n) => n.tag === 'aside')
    assert.ok(aside, 'Component Info aside must be mounted')
    const h2 = view.all().find((n) => n.tag === 'h2')
    assert.ok(h2, 'Component Info must have an h2 heading')
    assert.equal(h2.text, 'Power Breadboard')

    const renderedText = view.text()
    assert.ok(renderedText.includes('Power Breadboard'), 'Component Info must display Power Breadboard')
    assert.ok(!renderedText.includes('Solderless Breadboard'), 'Component Info must NOT display Solderless Breadboard')
  } finally {
    view.app.unmount()
  }
})

test('Component Info of POWER_SUPPLY displays Power Supply', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const circuit = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()

  circuit.createDraft()
  const supplyId = circuit.placeModule('POWER_SUPPLY', { x: 2, y: 0, z: 1 })
  workspace.selectModule(supplyId)
  ui.openWindow('component-info')

  const componentInfoComponent = await loadSfc('components/windows/ComponentInfoWindow.vue')
  const view = mountSfc(componentInfoComponent, pinia)
  try {
    const aside = view.all().find((n) => n.tag === 'aside')
    assert.ok(aside, 'Component Info aside must be mounted')
    const h2 = view.all().find((n) => n.tag === 'h2')
    assert.ok(h2, 'Component Info must have an h2 heading')
    assert.equal(h2.text, 'Power Supply')

    const renderedText = view.text()
    assert.ok(renderedText.includes('Power Supply'), 'Component Info must display Power Supply')
    assert.ok(!renderedText.includes('Power supply visual'), 'Component Info must NOT display Power supply visual')
  } finally {
    view.app.unmount()
  }
})

test('Save/Open legacy circuit with BREADBOARD_100 and POWER_SUPPLY operates seamlessly', () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useCircuitStore()

  const legacyCircuitJson = JSON.stringify({
    schema_version: '1.0',
    circuit_id: 'legacy-breadboard-supply',
    modules: [
      {
        id: 'bb_100_module',
        type: 'BREADBOARD_100',
        position: { x: 1.0, y: 0.0, z: -2.5 },
        rotation: 180,
      },
      {
        id: 'power_supply_module',
        type: 'POWER_SUPPLY',
        position: { x: -3.0, y: 0.0, z: 4.0 },
        rotation: 0,
        properties: {
          voltage_v: 12.0,
          current_limit_a: 2.5,
          power_on: true,
        },
      },
    ],
    connections: [],
  })

  // 1. Parse and import legacy circuit
  const parsed = parseCircuitFile(legacyCircuitJson)
  store.importGraph(parsed)

  assert.equal(store.graph!.modules.length, 2)
  const bbModule = store.graph!.modules.find((m) => m.id === 'bb_100_module')
  const psModule = store.graph!.modules.find((m) => m.id === 'power_supply_module')

  assert.ok(bbModule)
  assert.equal(bbModule.type, 'BREADBOARD_100')
  assert.equal(bbModule.rotation, 180)

  assert.ok(psModule)
  assert.equal(psModule.type, 'POWER_SUPPLY')
  assert.deepEqual(psModule.properties, { voltage_v: 12.0, current_limit_a: 2.5, power_on: true })

  // 2. Export circuit and re-import
  const exportedJson = store.exportGraph()
  const reopened = parseCircuitFile(exportedJson)

  assert.equal(reopened.modules.length, 2)
  const reopenedBb = reopened.modules.find((m) => m.id === 'bb_100_module')
  const reopenedPs = reopened.modules.find((m) => m.id === 'power_supply_module')

  assert.ok(reopenedBb)
  assert.equal(reopenedBb.type, 'BREADBOARD_100')
  assert.deepEqual(reopenedBb.position, { x: 1.0, y: 0.0, z: -2.5 })
  assert.equal(reopenedBb.rotation, 180)

  assert.ok(reopenedPs)
  assert.equal(reopenedPs.type, 'POWER_SUPPLY')
  assert.deepEqual(reopenedPs.position, { x: -3.0, y: 0.0, z: 4.0 })
  assert.deepEqual(reopenedPs.properties, { voltage_v: 12.0, current_limit_a: 2.5, power_on: true })
})
