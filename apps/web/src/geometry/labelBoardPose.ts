import type { CircuitModule } from '../types/circuit'
import { moduleLocalToWorld, worldToModuleLocal } from '../electrical/modulePose'

const yaw = (degrees = 0) => ((degrees % 360) + 360) % 360
const associatedBoard = (module: CircuitModule) => module.type === 'LABEL' && typeof module.properties?.boardId === 'string' ? module.properties.boardId : undefined
const samePose = (left: CircuitModule, right: CircuitModule) => yaw(left.rotation) === yaw(right.rotation)
  && (['x', 'y', 'z'] as const).every(axis => (left.position?.[axis] ?? 0) === (right.position?.[axis] ?? 0))

/** A board association is visual context, never a second stored label pose.
 * Derive the transformed world pose from the previous graph so a group move
 * that already includes the label cannot apply the board transform twice. */
export function synchronizeLabelBoardPoses(before: CircuitModule[], after: CircuitModule[]): CircuitModule[] {
  if (!after.some(module => associatedBoard(module))) return after
  const previous = new Map(before.map(module => [module.id, module])), next = new Map(after.map(module => [module.id, module]))
  return after.map(module => {
    const boardId = associatedBoard(module), original = previous.get(module.id)
    if (!boardId || !original || associatedBoard(original) !== boardId) return module
    const oldBoard = previous.get(boardId), newBoard = next.get(boardId)
    if (!oldBoard) return module
    if (!newBoard) {
      const { boardId: _boardId, ...properties } = module.properties!
      return { ...module, properties }
    }
    if (samePose(oldBoard, newBoard)) return module
    const local = worldToModuleLocal({ x: original.position?.x ?? 0, y: original.position?.y ?? 0, z: original.position?.z ?? 0 }, oldBoard)
    return { ...module, position: moduleLocalToWorld(local, newBoard), rotation: yaw((original.rotation ?? 0) + (newBoard.rotation ?? 0) - (oldBoard.rotation ?? 0)) }
  })
}

/** Copy association IDs only; all pose conversion remains in the copy command. */
export function remapLabelBoardReference(module: CircuitModule, owners: ReadonlyMap<string, string>): CircuitModule {
  const boardId = associatedBoard(module), mapped = boardId && owners.get(boardId)
  return mapped && mapped !== boardId ? { ...module, properties: { ...module.properties, boardId: mapped } } : module
}
