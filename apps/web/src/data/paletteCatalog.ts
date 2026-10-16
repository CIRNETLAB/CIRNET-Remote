import { getComponentSearchIndex } from './componentSearch'
import { iconUrl, ribbonGroups, type LibraryComponent } from './ribbon'

/** Static view metadata is shared by palette renders and never rebuilt by typing. */
export const paletteGroups = ribbonGroups.map(group => {
  const searchIndex = getComponentSearchIndex(group.items)
  const cards = new Map(searchIndex.entries.map(({ item, part, definition }) => [item.type, {
    item,
    thumbnail: !!part,
    placeable: !!definition,
    iconSrc: item.icon ? iconUrl(item.icon) : undefined,
    support: item.support || (item.window ? 'Open window' : definition ? 'Place component' : item.type === 'JUMPER' ? 'Connect ports' : 'Model unavailable'),
  }]))
  return { ...group, iconSrc: group.icon ? iconUrl(group.icon) : undefined, searchIndex, cards }
})
export interface PaletteCard {
  item: LibraryComponent
  thumbnail: boolean
  placeable: boolean
  iconSrc?: string
  support: string
}
