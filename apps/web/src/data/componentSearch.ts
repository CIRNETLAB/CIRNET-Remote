import { libraryComponents, type LibraryComponent } from './ribbon'
import { getPartForType } from './partCatalog'

const fold = (text: string) => text.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const functionWords = new Set(['and','or','xor','nand','nor','xnor','not','inverter','schmitt','flip','flop'])
export function searchComponents(query: string, items: LibraryComponent[] = libraryComponents): LibraryComponent[] {
  const tokens = fold(query).split(/\s+/).filter(Boolean)
  if (!tokens.length) return items
  return items.filter(item => {
    const part = getPartForType(item.type)
    const haystack = fold([item.type, item.name, item.description, part?.function, part?.logic?.gate, ...(part?.aliases ?? [])].filter(Boolean).join(' '))
    const words = new Set(haystack.split(' '))
    return tokens.every(token => functionWords.has(token) ? words.has(token) : haystack.includes(token))
  })
}
