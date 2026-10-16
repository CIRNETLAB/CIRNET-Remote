import { componentCatalog, type ComponentDefinition } from './editorCatalog'
import { partCatalog, type PartDefinition } from './partCatalog'
import { libraryComponents, ribbonGroups, type LibraryComponent, type RibbonGroup } from './ribbon'

const fold = (text: string) => text.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim()
const gateWords = new Set(['and', 'nand', 'or', 'nor', 'xor', 'xnor', 'not'])
// Gate names and IC identifiers never participate in typo correction.
const functionWords = ['inverter', 'buffer', 'schmitt', 'trigger', 'flip', 'flop', 'input', 'output', 'quad', 'dual', 'triple', 'single', 'gate', 'collector', 'drain', 'unbuffered', 'clock', 'reset', 'latch', 'adder', 'multiplier']

interface SearchField {
  readonly text: string
  readonly words: readonly string[]
  readonly exact: ReadonlySet<string>
}

export interface ComponentSearchEntry {
  readonly item: LibraryComponent
  readonly part: PartDefinition | undefined
  readonly definition: ComponentDefinition | undefined
  readonly group: RibbonGroup | undefined
  readonly codes: readonly string[]
  readonly aliases: readonly string[]
  readonly names: SearchField
  readonly aliasWords: SearchField
  readonly functions: SearchField
  readonly details: SearchField
  readonly words: ReadonlySet<string>
}

export interface ComponentSearchIndex {
  readonly items: LibraryComponent[]
  readonly entries: readonly ComponentSearchEntry[]
  search(query: string): LibraryComponent[]
}

export interface ComponentSearchMetadata {
  parts?: readonly PartDefinition[]
  definitions?: readonly ComponentDefinition[]
  groups?: readonly RibbonGroup[]
}

interface MetadataMaps {
  readonly parts: ReadonlyMap<string, PartDefinition>
  readonly definitions: ReadonlyMap<string, ComponentDefinition>
  readonly groups: ReadonlyMap<LibraryComponent, RibbonGroup>
}

function metadataMaps(metadata: ComponentSearchMetadata): MetadataMaps {
  return {
    parts: new Map((metadata.parts ?? partCatalog).map(part => [part.editorType, part])),
    definitions: new Map((metadata.definitions ?? componentCatalog).map(definition => [definition.type, definition])),
    groups: new Map((metadata.groups ?? ribbonGroups).flatMap(group => group.items.map(item => [item, group] as const))),
  }
}

const catalogMetadata = metadataMaps({})

function normalized(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => !!value).map(fold).filter(Boolean))]
}

function field(values: (string | undefined)[]): SearchField {
  const text = normalized(values).join(' ')
  const exact = new Set(text.split(' ').filter(Boolean))
  return { text, words: [...exact], exact }
}

function buildEntry(item: LibraryComponent, metadata: MetadataMaps): ComponentSearchEntry {
  const part = metadata.parts.get(item.type)
  const definition = metadata.definitions.get(item.type)
  const group = metadata.groups.get(item)
  const codes = [...new Set(normalized([item.type, part?.logic?.code, part?.shortName, part?.partNumber, definition?.partNumber]).flatMap(code => [code, code.replace(/ /g, '')]))]
  const aliases = [...new Set(normalized(part?.aliases ?? []).flatMap(alias => [alias, alias.replace(/ /g, '')]))]
  const packageAliases = part ? [fold(part.package.id).replace(/ /g, ''),
    ...(part.package.family === 'dip' ? [`dip${part.package.pins.length}`, `dip ${part.package.pins.length}`] : []),
  ] : []
  const names = field([item.name, part?.name, definition?.name])
  const aliasWords = field(aliases)
  const functions = field([
    part?.function, part?.logic?.gate, part?.logic?.family, part?.logic?.inputCharacteristics,
    part?.editor.family, part?.package.id, part?.package.family, ...packageAliases, definition?.family, group?.id, group?.label,
  ])
  const details = field([item.description, item.support])
  const words = new Set([...codes.flatMap(code => code.split(' ')), ...names.words, ...aliasWords.words, ...functions.words, ...details.words])
  return { item, part, definition, group, codes, aliases, names, aliasWords, functions, details, words }
}

/** One insertion, deletion, substitution or adjacent transposition. */
function oneEditApart(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false
  let first = 0
  while (first < left.length && first < right.length && left[first] === right[first]) first++
  if (left.length === right.length) {
    return left.slice(first + 1) === right.slice(first + 1)
      || (left[first] === right[first + 1] && left[first + 1] === right[first] && left.slice(first + 2) === right.slice(first + 2))
  }
  return left.length > right.length
    ? left.slice(first + 1) === right.slice(first)
    : left.slice(first) === right.slice(first + 1)
}

interface QueryToken {
  readonly value: string
  readonly strict: boolean
  readonly corrections: readonly string[]
}

function queryToken(value: string): QueryToken {
  const strict = gateWords.has(value)
  const corrections = !strict && !functionWords.includes(value) && value.length >= 4 && /^[a-z]+$/.test(value)
    ? functionWords.filter(word => word !== value && oneEditApart(value, word))
    : []
  return { value, strict, corrections }
}

const postingKinds = ['codes', 'aliases', 'names', 'functions', 'words'] as const
type PostingKind = typeof postingKinds[number]
type VocabularyEntry = { readonly text: string } & Partial<Record<PostingKind, Uint32Array>>

function buildPostings(entries: readonly ComponentSearchEntry[]) {
  const mutable = new Map<string, { text: string } & Partial<Record<PostingKind, number[]>>>()
  function add(text: string, kind: PostingKind, order: number) {
    let word = mutable.get(text)
    if (!word) { word = { text }; mutable.set(text, word) }
    ;(word[kind] ??= []).push(order)
  }
  for (let order = 0; order < entries.length; order++) {
    const entry = entries[order]!
    for (const code of entry.codes) add(code, 'codes', order)
    for (const alias of entry.aliases) add(alias, 'aliases', order)
    for (const word of new Set([...entry.names.words, ...entry.aliasWords.words])) add(word, 'names', order)
    for (const word of new Set([...entry.functions.words, ...entry.details.words])) add(word, 'functions', order)
    for (const word of entry.words) add(word, 'words', order)
  }
  // Compact numeric postings avoid retaining one JS object for every word/item pair.
  const vocabulary: VocabularyEntry[] = []
  const lookup = new Map<string, VocabularyEntry>()
  const codes: VocabularyEntry[] = []
  for (const source of mutable.values()) {
    const word: VocabularyEntry = { text: source.text }
    for (const kind of postingKinds) if (source[kind]) word[kind] = Uint32Array.from(source[kind]!)
    vocabulary.push(word)
    lookup.set(word.text, word)
    if (word.codes) codes.push(word)
  }
  return { vocabulary, lookup, codes }
}

const noMatch = 255
function applyRank(ranks: Uint8Array, posting: Uint32Array | undefined, rank: number) {
  if (!posting) return
  for (let offset = 0; offset < posting.length; offset++) {
    const order = posting[offset]!
    if (rank < ranks[order]!) ranks[order] = rank
  }
}

function applyOverride(ranks: Uint8Array, posting: Uint32Array | undefined, rank: number) {
  if (!posting) return
  for (let offset = 0; offset < posting.length; offset++) {
    const order = posting[offset]!
    if (ranks[order] !== noMatch) ranks[order] = rank
  }
}

function indexFromEntries(items: LibraryComponent[], entries: readonly ComponentSearchEntry[]): ComponentSearchIndex {
  const postings = buildPostings(entries)
  return {
    items,
    entries,
    search(query) {
      // Match distinct vocabulary once, then combine numeric postings. Candidate
      // metadata and normalized field records are never revisited while typing.
      const text = fold(query)
      if (!text) return items
      const tokens = text.split(' ').map(queryToken)
      const compact = text.replace(/ /g, '')
      const ranks = new Uint8Array(items.length)
      const strength = new Uint32Array(items.length)
      const tokenRanks = new Uint8Array(items.length)
      for (const token of tokens) {
        tokenRanks.fill(noMatch)
        const exact = postings.lookup.get(token.value)
        applyRank(tokenRanks, exact?.codes, 0)
        applyRank(tokenRanks, exact?.aliases, 1)
        if (token.strict) {
          applyRank(tokenRanks, exact?.names, 3)
          applyRank(tokenRanks, exact?.functions, 4)
        } else {
          for (const word of postings.vocabulary) {
            if (word.text.startsWith(token.value)) {
              applyRank(tokenRanks, word.codes, 2)
              applyRank(tokenRanks, word.names, 3)
              applyRank(tokenRanks, word.functions, 4)
            }
            if (word.text.includes(token.value)) applyRank(tokenRanks, word.words, 5)
          }
          for (const correction of token.corrections) applyRank(tokenRanks, postings.lookup.get(correction)?.words, 6)
        }
        let remaining = 0
        for (let order = 0; order < items.length; order++) {
          if (ranks[order] === noMatch) continue
          const score = tokenRanks[order]!
          ranks[order] = Math.max(ranks[order]!, score)
          if (score !== noMatch) { strength[order]! += score; remaining++ }
        }
        if (!remaining) return []
      }
      // Apply whole-query priorities in increasing precedence without widening AND.
      for (const code of postings.codes) if (code.text.startsWith(compact)) applyOverride(ranks, code.codes, 2)
      applyOverride(ranks, postings.lookup.get(text)?.aliases, 1)
      applyOverride(ranks, postings.lookup.get(compact)?.aliases, 1)
      applyOverride(ranks, postings.lookup.get(text)?.codes, 0)
      applyOverride(ranks, postings.lookup.get(compact)?.codes, 0)
      const matches: number[] = []
      for (let order = 0; order < items.length; order++) if (ranks[order] !== noMatch) matches.push(order)
      matches.sort((left, right) => ranks[left]! - ranks[right]! || strength[left]! - strength[right]! || left - right)
      return matches.map(order => items[order]!)
    },
  }
}

/** Build once for a static catalog; query execution only normalizes the query. */
export function createComponentSearchIndex(items: LibraryComponent[], metadata?: ComponentSearchMetadata): ComponentSearchIndex {
  const maps = metadata ? metadataMaps(metadata) : catalogMetadata
  return indexFromEntries(items, items.map(item => buildEntry(item, maps)))
}

export const componentSearchIndex = createComponentSearchIndex(libraryComponents)
const entriesByItem = new Map(componentSearchIndex.entries.map(entry => [entry.item, entry]))
const scopedIndices = new WeakMap<LibraryComponent[], ComponentSearchIndex>([[libraryComponents, componentSearchIndex]])

/** Scope by array identity; known ribbon items share their prebuilt entry metadata. */
export function getComponentSearchIndex(items: LibraryComponent[] = libraryComponents): ComponentSearchIndex {
  let index = scopedIndices.get(items)
  if (!index) {
    index = indexFromEntries(items, items.map(item => entriesByItem.get(item) ?? buildEntry(item, catalogMetadata)))
    scopedIndices.set(items, index)
  }
  return index
}

// Prepare all menu scopes before the first input event.
for (const group of ribbonGroups) getComponentSearchIndex(group.items)

export function searchComponents(query: string, items: LibraryComponent[] = libraryComponents): LibraryComponent[] {
  return getComponentSearchIndex(items).search(query)
}
