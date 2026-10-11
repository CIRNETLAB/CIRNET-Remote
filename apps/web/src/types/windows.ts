export const windowDefinitions = {
  oscilloscope: { title: 'Oscilloscope', width: 760, height: 530 },
  generator: { title: 'Function Generator', width: 760, height: 530 },
  'power-supply': { title: 'Power Supply', width: 600, height: 510 },
  monitor: { title: 'Signal Monitor', width: 720, height: 500 },
  'component-info': { title: 'Component Info', width: 380, height: 390 },
  inspector: { title: 'Inspector', width: 400, height: 470 },
  'hex-editor': { title: 'Hex Editor', width: 470, height: 330 },
} as const
export type WindowKind = keyof typeof windowDefinitions
export interface WorkspaceWindow {
  kind: WindowKind; open: boolean; x: number; y: number; width: number; height: number; z: number; activation: number
}
