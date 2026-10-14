import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getBreadboardTopology, getBreadboardContact, contactFromInstance } from '../src/electrical/BreadboardTopology'

test('breadboard topology has stable five-hole nodes and explicit continuous rails on every variant', () => {
  for (const [type, contacts, nodes] of [['BREADBOARD', 830, 130], ['BREADBOARD_630', 630, 126], ['BREADBOARD_100', 100, 2]] as const) {
    const board = getBreadboardTopology(type)!
    assert.equal(board.contacts.length, contacts)
    assert.equal(new Set(board.contacts.map(c => c.contactId)).size, contacts)
    assert.equal(new Set(board.contacts.map(c => c.nodeId)).size, nodes)
    assert.ok(board.contacts.every(c => c.localPosition.every(Number.isFinite)))
    for (const node of new Set(board.contacts.filter(c => c.contactId.startsWith('terminal:')).map(c => c.nodeId))) {
      assert.equal(board.contacts.filter(c => c.nodeId === node).length, 5)
    }
  }
  const contact = (id: string) => getBreadboardContact('BREADBOARD', id)!
  assert.equal(contact('terminal:A:01').nodeId, contact('terminal:E:01').nodeId)
  assert.notEqual(contact('terminal:A:01').nodeId, contact('terminal:F:01').nodeId)
  assert.notEqual(contact('terminal:A:01').nodeId, contact('terminal:A:02').nodeId)
  assert.equal(contact('rail:top-positive:01').nodeId, contact('rail:top-positive:50').nodeId)
  assert.notEqual(contact('rail:top-positive:01').nodeId, contact('rail:top-negative:01').nodeId)
})

test('instance lookup preserves socket order but never guesses a contact for an invalid index', () => {
  for (const [index, id] of [[0, 'terminal:A:01'], [629, 'terminal:J:63'], [630, 'rail:top-positive:01'], [730, 'rail:top-positive:26'], [829, 'rail:bottom-negative:50']] as const) {
    assert.equal(contactFromInstance('BREADBOARD', index)?.contactId, id)
  }
  assert.equal(contactFromInstance('BREADBOARD_630', 629)?.contactId, 'terminal:J:63')
  assert.equal(contactFromInstance('BREADBOARD_100', 99)?.contactId, 'rail:negative:50')
  for (const index of [-1, 830, 0.1, NaN, Infinity]) assert.equal(contactFromInstance('BREADBOARD', index), null)
  assert.equal(getBreadboardContact('BREADBOARD', 'terminal:A:64'), null)
  assert.equal(getBreadboardTopology('BOARD'), null)
})
