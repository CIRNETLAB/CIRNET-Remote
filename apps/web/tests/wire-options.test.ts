import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { loadSfc, mountSfc, dispatch } from './helpers/vueSfc'
import { useCircuitStore } from '../src/stores/circuit'
import { parseCircuitFile } from '../src/services/files/circuitFile'
import { readWireVisual } from '../src/wires/wireVisual'

test('jumper options render ten accessible colors, two route buttons, and five icon buttons', async () => {
  let color = '', mode = ''
  const view = mountSfc(
    await loadSfc('components/workbench/WireOptions.vue'),
    createPinia(),
    {
      color: '#d8493f',
      routeMode: 'FREE',
      canAdd: true,
      canRemove: true,
      canStack: true,
      canLowerStack: true,
      canRaiseStack: true,
      onColor: (value: string) => { color = value },
      onMode: (value: string) => { mode = value },
    }
  )
  try {
    for (const name of ['Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Black', 'Gray', 'White', 'Brown']) {
      assert.ok(view.find('button', 'aria-label', `${name} wire`), `Color ${name} must exist`)
    }
    const redButton = view.find('button', 'aria-label', 'Red wire')
    assert.equal(redButton.props['aria-pressed'], true)

    dispatch(view.find('button', 'aria-label', 'Purple wire'), 'onClick')
    assert.equal(color, '#8656a8')

    // Two route buttons: Manual and Orthogonal 90°
    const manualBtn = view.find('button', 'aria-label', 'Manual route mode')
    const orthoBtn = view.find('button', 'aria-label', 'Orthogonal 90° route mode')
    assert.ok(manualBtn, 'Manual button must exist')
    assert.ok(orthoBtn, 'Orthogonal button must exist')
    assert.equal(manualBtn.props['aria-pressed'], true)
    assert.equal(orthoBtn.props['aria-pressed'], false)

    dispatch(orthoBtn, 'onClick')
    assert.equal(mode, 'ORTHOGONAL')
    dispatch(manualBtn, 'onClick')
    assert.equal(mode, 'FREE')

    // Five action buttons
    const addBend = view.find('button', 'aria-label', 'Add bend to selected segment')
    const removeBend = view.find('button', 'aria-label', 'Remove selected bend')
    const downBtn = view.find('button', 'aria-label', 'Lower wire priority')
    const upBtn = view.find('button', 'aria-label', 'Raise wire priority')
    const topBtn = view.find('button', 'aria-label', 'Move wire above overlapping wires')

    assert.ok(addBend, 'Add bend button must exist')
    assert.ok(removeBend, 'Remove bend button must exist')
    assert.ok(downBtn, 'Down button must exist')
    assert.ok(upBtn, 'Up button must exist')
    assert.ok(topBtn, 'Top button must exist')

    assert.equal(addBend.props.title, 'Add bend')
    assert.equal(removeBend.props.title, 'Remove bend')
    assert.equal(downBtn.props.title, 'Down')
    assert.equal(upBtn.props.title, 'Up')
    assert.equal(topBtn.props.title, 'Top')

    assert.equal(addBend.props.disabled, false)
    assert.equal(removeBend.props.disabled, false)
    assert.equal(downBtn.props.disabled, false)
    assert.equal(upBtn.props.disabled, false)
    assert.equal(topBtn.props.disabled, false)

    assert.equal(view.all().filter(node => node.tag === 'canvas').length, 0)
  } finally {
    view.app.unmount()
  }
})

test('palette keyboard forwards Escape and draft bend deletion while preserving native input keys', async () => {
  const keys: string[] = []
  const view = mountSfc(
    await loadSfc('components/workbench/WireOptions.vue'),
    createPinia(),
    { onRouteKey: (event: KeyboardEvent) => keys.push(event.key) }
  )
  try {
    const panel = view.find('section', 'aria-label', 'Jumper wire options')
    const press = (key: string, tagName: string) => (panel.props.onKeydown as (event: unknown) => void)({ key, target: { tagName }, stopPropagation() {} })
    press('Escape', 'BUTTON'); press('Backspace', 'BUTTON'); press('Delete', 'BUTTON')
    press('ArrowDown', 'SELECT'); press('Backspace', 'SELECT'); press('Backspace', 'INPUT'); press('Tab', 'BUTTON')
    assert.deepEqual(keys, ['Escape', 'Backspace', 'Delete'])
  } finally {
    view.app.unmount()
  }
})

test('new wire options default to manual Free and explain each routing mode', async () => {
  const component = await loadSfc('components/workbench/WireOptions.vue')
  const free = mountSfc(component, createPinia())
  try {
    const manualBtn = free.find('button', 'aria-label', 'Manual route mode')
    assert.equal(manualBtn.props['aria-pressed'], true)
    const orthoBtn = free.find('button', 'aria-label', 'Orthogonal 90° route mode')
    assert.equal(orthoBtn.props['aria-pressed'], false)
    assert.ok(free.text().includes('straight or diagonal'))
    assert.ok(free.text().includes('Parallel: lane order · Crossing: over/under'))
    assert.ok(free.text().includes('Drag a user bend or segment'))
  } finally {
    free.app.unmount()
  }
  for (const [mode, explanation] of [['ORTHOGONAL', 'X/Z runs'], ['AUTO', 'automatic right angles']] as const) {
    const view = mountSfc(component, createPinia(), { routeMode: mode })
    try {
      assert.ok(view.text().includes(explanation))
    } finally {
      view.app.unmount()
    }
  }
})

test('five icon buttons and layer controls reflect disabled states and priorities', async () => {
  const actions: string[] = []
  const component = await loadSfc('components/workbench/WireOptions.vue')

  // When disabled/unselected
  const disabledView = mountSfc(component, createPinia(), {
    layer: 0,
    canAdd: false,
    canRemove: false,
    canStack: false,
    canLowerStack: false,
    canRaiseStack: false,
  })
  try {
    assert.equal(disabledView.find('button', 'aria-label', 'Add bend to selected segment').props.disabled, true)
    assert.equal(disabledView.find('button', 'aria-label', 'Remove selected bend').props.disabled, true)
    assert.equal(disabledView.find('button', 'aria-label', 'Lower wire priority').props.disabled, true)
    assert.equal(disabledView.find('button', 'aria-label', 'Raise wire priority').props.disabled, true)
    assert.equal(disabledView.find('button', 'aria-label', 'Move wire above overlapping wires').props.disabled, true)
    assert.ok(disabledView.text().includes('Priority 0'))
  } finally {
    disabledView.app.unmount()
  }

  // When selected and stacked
  const activeView = mountSfc(component, createPinia(), {
    layer: 3,
    canAdd: true,
    canRemove: true,
    canStack: true,
    canCycleStack: true,
    canLowerStack: true,
    canRaiseStack: true,
    onAdd: () => actions.push('add'),
    onRemove: () => actions.push('remove'),
    onStack: (action: string) => actions.push(action),
    onCycleStack: () => actions.push('cycle'),
  })
  try {
    assert.ok(activeView.text().includes('Priority 3'))
    dispatch(activeView.find('button', 'aria-label', 'Add bend to selected segment'), 'onClick')
    dispatch(activeView.find('button', 'aria-label', 'Remove selected bend'), 'onClick')
    dispatch(activeView.find('button', 'aria-label', 'Lower wire priority'), 'onClick')
    dispatch(activeView.find('button', 'aria-label', 'Raise wire priority'), 'onClick')
    dispatch(activeView.find('button', 'aria-label', 'Move wire above overlapping wires'), 'onClick')
    dispatch(activeView.find('button', 'aria-label', 'Select next overlapping wire'), 'onClick')

    assert.deepEqual(actions, ['add', 'remove', 'down', 'up', 'top', 'cycle'])
  } finally {
    activeView.app.unmount()
  }
})

test('legacy equal-zero priorities can move down when creation ordering gives them an earlier neighbor', async () => {
  const view = mountSfc(await loadSfc('components/workbench/WireOptions.vue'), createPinia(), { layer: 0, canStack: true, canLowerStack: true })
  try {
    assert.equal(view.find('button', 'aria-label', 'Lower wire priority').props.disabled, false)
  } finally {
    view.app.unmount()
  }
})

test('Undo/Redo, Save/Open, and legacy AUTO route mode operate seamlessly with circuit store', () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useCircuitStore()

  const legacyCircuitJson = JSON.stringify({
    schema_version: '1.0',
    circuit_id: 'legacy-wire-modes',
    modules: [
      { id: 'bb1', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 }, rotation: 0 },
    ],
    connections: [
      {
        source: 'bb1.contact:terminal:A:01',
        destination: 'bb1.contact:terminal:J:01',
        metadata: {
          wireVisual: {
            version: 1,
            color: '#d8493f',
            routeMode: 'AUTO',
            controlPoints: [],
            thickness: 0.036,
            layer: 0,
          },
        },
      },
      {
        source: 'bb1.contact:terminal:A:05',
        destination: 'bb1.contact:terminal:J:05',
        metadata: {
          wireVisual: {
            version: 1,
            color: '#397ec6',
            routeMode: 'FREE',
            controlPoints: [],
            thickness: 0.036,
            layer: 1,
          },
        },
      },
    ],
  })

  // 1. Import legacy circuit containing AUTO and FREE wires
  const parsed = parseCircuitFile(legacyCircuitJson)
  store.importGraph(parsed)
  store.past = []

  assert.equal(store.graph!.connections.length, 2)
  const autoWire = store.graph!.connections[0]
  const freeWire = store.graph!.connections[1]

  // Verify AUTO is preserved, not blindly mutated
  assert.equal(readWireVisual(autoWire).routeMode, 'AUTO')
  assert.equal(readWireVisual(freeWire).routeMode, 'FREE')

  // 2. Update wire visual route mode to ORTHOGONAL
  store.updateWireVisual(freeWire, { ...readWireVisual(freeWire), routeMode: 'ORTHOGONAL' })
  assert.equal(readWireVisual(store.graph!.connections[1]).routeMode, 'ORTHOGONAL')
  assert.equal(store.past.length, 1)

  // 3. Test Undo/Redo
  store.undo()
  assert.equal(readWireVisual(store.graph!.connections[1]).routeMode, 'FREE')
  store.redo()
  assert.equal(readWireVisual(store.graph!.connections[1]).routeMode, 'ORTHOGONAL')

  // 4. Export and re-import (Save/Open round-trip)
  const exportedJson = store.exportGraph()
  const reopened = parseCircuitFile(exportedJson)

  assert.equal(reopened.connections.length, 2)
  assert.equal(readWireVisual(reopened.connections[0]).routeMode, 'AUTO')
  assert.equal(readWireVisual(reopened.connections[1]).routeMode, 'ORTHOGONAL')
})
