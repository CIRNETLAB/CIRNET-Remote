import { onUnmounted,watch } from 'vue'
import { useRoute,useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useProjectStore } from '../stores/projects'
import { useUiStore } from '../stores/ui'

export function useProjectWorkspace() {
  const auth=useAuthStore(),projects=useProjectStore(),ui=useUiStore(),route=useRoute(),router=useRouter()
  let transition=Promise.resolve(),sourceGuest:string|null=null,navigation=0,disposed=false
  const principal=watch(()=>auth.principal,(next,previous)=>{
    const id=next?.principal_id??null
    if(previous?.kind==='GUEST'&&next?.kind==='USER'&&auth.session?.claim_available)sourceGuest=previous.principal_id
    else if(next?.kind!=='USER')sourceGuest=null
    // setPrincipal clears all prior-owned drafts synchronously before its first await.
    transition=projects.setPrincipal(id)
  },{immediate:true,flush:'sync'})
  const claim=auth.$onAction(({name,args,after})=>{
    if(name!=='claimGuest'||args[0]!==true||!sourceGuest)return
    const source=sourceGuest
    after(async succeeded=>{
      if(succeeded&&auth.authenticated){await transition;if(!disposed)await projects.claimGuestRecovery(source,true);sourceGuest=null}
    })
  })
  const navigate=watch(()=>[route.fullPath,auth.ready,auth.principal?.principal_id] as const,async()=>{
    const version=++navigation
    if(!auth.ready)return
    await transition
    if(disposed||version!==navigation)return
    projects.navigationError=null
    if(route.name==='UnknownWorkspace') {projects.navigationError='This workspace address does not exist.';ui.openWindow('projects');return}
    if(route.name!=='ProjectWorkspace'&&route.name!=='ProjectCircuit')return
    ui.openWindow('projects')
    const projectId=String(route.params.projectId),documentId=typeof route.params.documentId==='string'?route.params.documentId:null
    const selected=await projects.selectProject(projectId)
    if(disposed||version!==navigation||!selected)return
    if(!documentId)return
    if(projects.saveState.binding?.documentId===documentId)return
    if(!projects.circuits.some(document=>document.document_id===documentId)){
      // The requested document can live beyond the first bounded page.
      while(projects.nextCircuitCursor&&!projects.circuits.some(document=>document.document_id===documentId)) {
        if(!await projects.loadCircuits(true)||disposed||version!==navigation)return
      }
    }
    if(!projects.circuits.some(document=>document.document_id===documentId)){projects.navigationError='Circuit not found in this project, or access is unavailable.';return}
    await projects.requestOpen(documentId)
  },{immediate:true})
  const binding=watch(()=>projects.saveState.binding,(next,previous)=>{
    if(next&&next.documentId!==previous?.documentId)void router.replace({name:'ProjectCircuit',params:{projectId:next.projectId,documentId:next.documentId}})
    else if(!next&&previous&&route.name==='ProjectCircuit')void router.replace('/')
  })
  const request=watch(()=>projects.requestedDocumentId,id=>{if(id)ui.openWindow('projects')})
  onUnmounted(()=>{disposed=true;++navigation;principal();claim();navigate();binding();request();projects.dispose()})
}
