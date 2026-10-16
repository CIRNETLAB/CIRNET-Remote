import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as componentSearch from '../src/data/componentSearch'
import { componentCatalog } from '../src/data/editorCatalog'
import { partCatalog, type PartDefinition } from '../src/data/partCatalog'
import { libraryComponents, ribbonGroups, type LibraryComponent } from '../src/data/ribbon'

const types = (items: LibraryComponent[]) => items.map(item => item.type)
const item = (type: string, name = type, description = ''): LibraryComponent => ({ type, name, description })
const part = (editorType: string, overrides: Partial<PartDefinition> = {}): PartDefinition => ({
  ...partCatalog[0]!, editorType, name: 'Custom part', shortName: undefined,
  aliases: [], logic: undefined, function: 'generic', ...overrides,
})

test('function typos are corrected without changing IC numbers or gate identity', () => {
  assert.ok(componentSearch.searchComponents('schimtt triger').some(result => result.type === 'SN7414N'))
  assert.ok(componentSearch.searchComponents('invertr').some(result => result.type === 'SN7404N'))
  assert.ok(componentSearch.searchComponents('filp flop').some(result => result.type === 'CD4013BE'))
  assert.deepEqual(componentSearch.searchComponents('74HC09'), [])
  assert.deepEqual(componentSearch.searchComponents('CD4014'), [])
})

test('a reusable index ranks code, alias, code prefix, name, function, then partial matches', () => {
  assert.equal(typeof componentSearch.createComponentSearchIndex, 'function', 'the index must be reusable between queries')
  const items = [item('PARTIAL', 'X7408Z'), item('FUNCTION', 'Control'), item('NAME', '7408 display'), item('74080'), item('ALIAS'), item('7408')]
  const index = componentSearch.createComponentSearchIndex(items, {
    parts: [part('FUNCTION', { function: '7408-control' }), part('ALIAS', { aliases: ['7408'] })],
    definitions: [], groups: [],
  })
  assert.deepEqual(types(index.search('7408')), ['7408', 'ALIAS', '74080', 'NAME', 'FUNCTION', 'PARTIAL'])
})

test('AND, NAND, OR, NOR, XOR and XNOR remain distinct whole gate words', () => {
  assert.equal(typeof componentSearch.createComponentSearchIndex, 'function')
  const gates = ['AND', 'NAND', 'OR', 'NOR', 'XOR', 'XNOR']
  const items = gates.map(gate => item(`CUSTOM_${gate}`, `Quad ${gate} gate`))
  const index = componentSearch.createComponentSearchIndex(items, { parts: [], definitions: [], groups: [] })
  for (const gate of gates) assert.deepEqual(types(index.search(gate)), [`CUSTOM_${gate}`], gate)
  assert.deepEqual(index.search('AND NAND'), [])
})

test('recognized function words keep multi-token AND semantics without fuzzy substitutions', () => {
  const items = [item('ONLY_FLIP', 'Flip latch'), item('ONLY_FLOP', 'Flop latch'), item('BOTH', 'Flip flop latch')]
  const index = componentSearch.createComponentSearchIndex(items, { parts: [], definitions: [], groups: [] })
  assert.deepEqual(types(index.search('flip flop')), ['BOTH'])
  assert.deepEqual(types(index.search('filp flop')), ['BOTH'])
})

test('query folding handles Unicode, diacritics, whitespace and separators with AND semantics', () => {
  assert.equal(typeof componentSearch.createComponentSearchIndex, 'function')
  const items = [item('DIODE_TEST', 'Đèn Schmitt trigger'), item('OTHER', 'Schmitt buffer')]
  const index = componentSearch.createComponentSearchIndex(items, { parts: [], definitions: [], groups: [] })
  assert.deepEqual(types(index.search('  ＳＣＨＭＩＴＴ__trígger  ')), ['DIODE_TEST'])
  assert.deepEqual(types(index.search('den schmitt')), ['DIODE_TEST'])
  assert.deepEqual(index.search('schmitt missing'), [])
  assert.ok(componentSearch.searchComponents('ＳＮ７４ＨＣ０８Ｎ').some(result => result.type === 'SN74HC08N'))
  assert.ok(componentSearch.searchComponents('74-hc08').some(result => result.type === 'SN74HC08N'))
  for (const query of ['7408', '74HC08', 'SN74HC08N', 'CD4013', 'flip_flop', 'schmitt-trigger']) {
    assert.ok(componentSearch.searchComponents(query).length > 0, query)
  }
})

test('DIP package spellings share membership while package matches rank below names', () => {
  const items = [item('PACKAGE', 'Packaged device'), item('ACCESSORY', 'DIP14 accessory')]
  const index = componentSearch.createComponentSearchIndex(items, {
    parts: [part('PACKAGE')], definitions: [], groups: [],
  })
  assert.deepEqual(types(index.search('DIP14')), ['ACCESSORY', 'PACKAGE'])
  const packageOnly = componentSearch.createComponentSearchIndex([items[0]!], {
    parts: [part('PACKAGE')], definitions: [], groups: [],
  })
  for (const query of ['DIP14', 'DIP-14', 'dip 14']) assert.deepEqual(types(packageOnly.search(query)), ['PACKAGE'], query)
})

test('IC and exact alias separator variants preserve their active scope and ranking', () => {
  const logic = ribbonGroups.find(group => group.id === 'logic')!.items
  const arithmetic = ribbonGroups.find(group => group.id === 'arithmetic')!.items
  for (const query of ['74HC08', 'SN74HC08N', '74-HC-08', 'SN-74-HC-08-N']) {
    assert.deepEqual(types(componentSearch.searchComponents(query, logic)), ['SN74HC08N'], query)
    assert.deepEqual(componentSearch.searchComponents(query, arithmetic), [], query)
  }
  const items = [item('PREFIX', 'Alias-10'), item('EXACT', 'Unrelated')]
  const index = componentSearch.createComponentSearchIndex(items, {
    parts: [part('EXACT', { aliases: ['Alias10'] })], definitions: [], groups: [],
  })
  assert.deepEqual(types(index.search('alias-10')), ['EXACT', 'PREFIX'])
})

test('prebuilt group subsets reuse entries and never search outside Logic or Arithmetic', () => {
  assert.equal(typeof componentSearch.getComponentSearchIndex, 'function')
  const logic = ribbonGroups.find(group => group.id === 'logic')!.items
  const arithmetic = ribbonGroups.find(group => group.id === 'arithmetic')!.items
  assert.equal(logic.length, 40)
  assert.equal(arithmetic.length, 2)
  const logicIndex = componentSearch.getComponentSearchIndex(logic)
  assert.equal(logicIndex, componentSearch.getComponentSearchIndex(logic))
  assert.equal(logicIndex.entries[0], componentSearch.componentSearchIndex.entries.find(entry => entry.item === logic[0]))
  assert.equal(componentSearch.getComponentSearchIndex(), componentSearch.componentSearchIndex)
  assert.equal(componentSearch.searchComponents(''), libraryComponents)
  assert.equal(logicIndex.search('  __  '), logic)
  assert.equal(componentSearch.searchComponents('', arithmetic), arithmetic)
  assert.deepEqual(componentSearch.searchComponents('resistor', logic), [])
  assert.deepEqual(componentSearch.searchComponents('nand', arithmetic), [])
  assert.deepEqual(types(componentSearch.searchComponents('mult', arithmetic)), ['MULTIPLIER'])
  assert.deepEqual(componentSearch.searchComponents('nand', []), [])
})

test('an index snapshots catalog and item search metadata before queries', () => {
  assert.equal(typeof componentSearch.createComponentSearchIndex, 'function')
  const entry = item('CUSTOM', 'Indexed name', 'Snapshot description')
  const physical = part('CUSTOM', { aliases: ['Custom alias'], function: 'schmitt-trigger' })
  const definition = { ...componentCatalog[0]!, type: 'CUSTOM', name: 'Editor description', family: 'Test family' }
  const index = componentSearch.createComponentSearchIndex([entry], { parts: [physical], definitions: [definition], groups: [] })
  Object.defineProperty(entry, 'description', { get() { throw new Error('item metadata read during query') } })
  Object.defineProperty(physical, 'function', { get() { throw new Error('part metadata read during query') } })
  Object.defineProperty(definition, 'family', { get() { throw new Error('definition metadata read during query') } })
  for (const query of ['snapshot', 'custom alias', 'editor description', 'test family', 'schimtt triger']) {
    assert.equal(index.search(query)[0], entry, query)
  }
  assert.equal(index.entries[0]!.part, physical)
  assert.equal(index.entries[0]!.definition, definition)
})

test('queries use prebuilt postings without revisiting individual normalized search fields', () => {
  const entry = item('CUSTOM_7408', 'Schmitt trigger', 'Snapshot description')
  const index = componentSearch.createComponentSearchIndex([entry], {
    parts: [part('CUSTOM_7408', { aliases: ['Legacy7408'] })], definitions: [], groups: [],
  })
  for (const field of ['codes', 'aliases', 'names', 'aliasWords', 'functions', 'details', 'words']) {
    Object.defineProperty(index.entries[0]!, field, { get() { throw new Error(`candidate field ${field} revisited during query`) } })
  }
  for (const query of ['7408', 'legacy-7408', 'schimtt trigger', 'snapshot', 'schmitt missing']) {
    assert.equal(index.search(query)[0], query === 'schmitt missing' ? undefined : entry, query)
  }
})

test('equal ranked results keep the input order across repeated queries', () => {
  assert.equal(typeof componentSearch.createComponentSearchIndex, 'function')
  const items = [item('B', 'Schmitt trigger beta'), item('A', 'Schmitt trigger alpha'), item('C', 'Schmitt trigger gamma')]
  const index = componentSearch.createComponentSearchIndex(items, { parts: [], definitions: [], groups: [] })
  assert.equal(index.search(''), items)
  assert.deepEqual(types(index.search('schmitt trigger')), ['B', 'A', 'C'])
  assert.deepEqual(types(index.search('trig')), ['B', 'A', 'C'])
  assert.deepEqual(types(index.search('schmitt trigger')), ['B', 'A', 'C'])
  assert.deepEqual(types(items), ['B', 'A', 'C'])
})
