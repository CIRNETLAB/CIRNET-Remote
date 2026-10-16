import {onUnmounted,watch} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {useAuthStore} from '../stores/auth'
import {useAssignmentStore} from '../stores/assignments'
import {useExperimentStore} from '../stores/experiment'
import {useInstrumentStore} from '../stores/instrument'
import {useUiStore} from '../stores/ui'
import {assignmentsApi} from '../services/api/assignments'
import {experimentsApi} from '../services/api/experiments'
import {errorMessage} from '../services/api/client'

/** Navigation carries selection only. The editor and its canvas keep their existing authority. */
export function useLabNavigation(){
 const auth=useAuthStore(),author=useAssignmentStore(),experiment=useExperimentStore(),ui=useUiStore(),route=useRoute(),router=useRouter()
 let navigation=0,disposed=false,request:AbortController|undefined
 const scope=watch(()=>[auth.principal?.principal_id??null,auth.principal?.role??null] as const,([id,role])=>{author.setScope(id,role);useInstrumentStore().setPrincipal(id)},{immediate:true,flush:'sync'})
 const navigate=watch(()=>[route.fullPath,auth.ready,auth.principal?.principal_id,auth.principal?.role] as const,async()=>{
  const version=++navigation;request?.abort();if(!auth.ready)return
  if(!['AssignmentWorkspace','AssignmentAuthoring','ExperimentEvidence'].includes(String(route.name)))return
  const controller=new AbortController(),principalId=auth.principal?.principal_id,role=auth.principal?.role;request=controller
  const stale=()=>controller.signal.aborted||version!==navigation||disposed||principalId!==auth.principal?.principal_id||role!==auth.principal?.role
  if(route.name==='AssignmentAuthoring'){
   ui.openWindow('assignments')
   if(!author.canAuthor){author.error='Instructor or administrator access is required for private assignment drafts.';return}
   const id=String(route.params.assignmentId)
   if(author.binding?.assignment_id!==id)await author.openDocument(id)
   return
  }
  try{
   if(route.name==='AssignmentWorkspace'){
    ui.openWindow('assignments');const value=await assignmentsApi.get(String(route.params.assignmentId),controller.signal)
    if(stale())return
    experiment.assignments=[...experiment.assignments.filter(item=>item.assignment_id!==value.assignment_id),value];experiment.assignmentId=value.assignment_id
   }else{
    ui.openWindow('history');const value=await experimentsApi.get(String(route.params.experimentId),controller.signal)
    if(stale())return
    experiment.receive(value,'history');experiment.selectExperiment(value.experiment_id)
   }
  }catch(error){if(stale())return;if(route.name==='ExperimentEvidence')experiment.historyError=errorMessage(error);else author.error=errorMessage(error)}
 },{immediate:true})
 const selection=experiment.$onAction(({name,args,after})=>{
  if(name!=='selectExperiment')return
  after(()=>{if(disposed||!experiment.activeId||experiment.activeId!==args[0])return;void router.replace({name:'ExperimentEvidence',params:{experimentId:experiment.activeId}})})
 })
 const publicSelection=watch(()=>experiment.assignmentId,id=>{if(id&&route.name!=='ExperimentEvidence')void router.replace({name:'AssignmentWorkspace',params:{assignmentId:id}})})
 const binding=watch(()=>author.binding?.assignment_id,id=>{if(id)void router.replace({name:'AssignmentAuthoring',params:{assignmentId:id}})})
 onUnmounted(()=>{disposed=true;++navigation;request?.abort();scope();navigate();selection();publicSelection();binding();author.dispose()})
}
