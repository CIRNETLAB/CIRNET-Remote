export type FileCommand = 'new' | 'open' | 'save' | 'saveAs' | 'import' | 'export' | 'history' | 'assignment'
export interface FileMenuItem {
  id: FileCommand
  label: string
  disabled: boolean
  shortcut?: string
  restoreFocus?: boolean
}

/** Both menu activation and keyboard shortcuts enter through this guard. */
export function executeFileCommand(items: readonly FileMenuItem[], id: FileCommand, run: (id: FileCommand) => void): boolean {
  const command = items.find(item => item.id === id)
  if (!command || command.disabled) return false
  run(id)
  return true
}
