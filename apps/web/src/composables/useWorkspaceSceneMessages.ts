import { onScopeDispose, watch } from 'vue'
import { useWorkspaceMessageStore } from '../stores/workspaceMessages'

interface SceneMessages {
  graphics: () => string
  zoomArea: () => boolean
  marquee: () => boolean
  selectionPreview: () => string
  placement: () => string
  wire: () => string
}

/** Local scene state survives account rotation. Refresh live hints in the new
 * presentation scope, without replaying events or private application errors. */
export function useWorkspaceSceneMessages(state: SceneMessages) {
  const messages=useWorkspaceMessageStore()
  watch(()=>[state.graphics(),messages.principalKey] as const,([text])=>messages.setHint('graphics',text,{level:'error',scope:'session',window:'inspector'}),{immediate:true,flush:'sync'})
  const hints: [string,()=>string][]=[
    ['zoom-area',()=>state.zoomArea()?'Drag an area to zoom · Right click or Esc to cancel':''],
    ['marquee',()=>state.marquee()?'Drag to select components and wires · Right click or Esc to cancel':''],
    ['selection-preview',state.selectionPreview],['placement',state.placement],['wire-tool',state.wire],
  ]
  for(const [source,text] of hints)watch(()=>[text(),messages.principalKey,messages.draftId] as const,([value])=>messages.setHint(source,value),{immediate:true,flush:'post'})
  onScopeDispose(()=>{for(const source of ['graphics',...hints.map(([source])=>source)])messages.clearSource(source)})
}
