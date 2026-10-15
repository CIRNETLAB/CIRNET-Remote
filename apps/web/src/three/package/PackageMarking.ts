import { CanvasTexture, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, type BufferGeometry } from 'three'

export function shortPackageCode(code: string) {
  return code.replace(/^SN(?=74)/, '').replace(/^(74(?:HC|LS)?\d+)N$/, '$1').replace(/^(CD\d+)(?:BE|B|E)$/, '$1')
}

/** A marking keeps one canvas/texture for its whole lifetime, including updates. */
export function createPackageMarking(text: string, width: number, depth: number, name = 'package-marking', surface?: BufferGeometry) {
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas')
  if (canvas) { canvas.width = 768; canvas.height = 256 }
  const context = canvas?.getContext('2d') ?? null
  const texture = context ? new CanvasTexture(canvas!) : null
  if (texture) texture.colorSpace = SRGBColorSpace
  const material = new MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 })
  const label = new Mesh(surface ?? new PlaneGeometry(width, depth), material)
  label.name = name; label.rotation.x = -Math.PI / 2
  label.userData.selectionSurface = false; label.userData.ignorePick = true
  label.visible = !!context
  label.userData.setText = (next: string) => {
    label.userData.text = next
    if (!context || !texture) return
    context.clearRect(0, 0, canvas!.width, canvas!.height)
    context.fillStyle = '#d3d4c8'; context.textAlign = 'center'; context.textBaseline = 'middle'
    const lines = next.split('\n'); context.font = `${lines.length > 1 ? 56 : 68}px monospace`
    lines.forEach((line, i) => context.fillText(line, canvas!.width / 2, canvas!.height / 2 + (i - (lines.length - 1) / 2) * 70, canvas!.width - 32))
    texture.needsUpdate = true
  }
  label.userData.setText(text)
  return label
}

export function updatePackageMarking(label: Mesh | undefined, text: string) {
  if (label?.userData.text !== text) label?.userData.setText?.(text)
}
