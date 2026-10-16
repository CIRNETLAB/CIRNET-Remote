import type { RouteRecordRaw } from 'vue-router'

// Route records carry navigation state; App keeps the workbench mounted.
export const workspaceRoutes: RouteRecordRaw[] = [
  { path: '/', name: 'SingleWorkspace', component: { render: () => null } },
  { path: '/projects/:projectId', name:'ProjectWorkspace',component:{render:()=>null} },
  { path: '/projects/:projectId/circuits/:documentId', name:'ProjectCircuit',component:{render:()=>null} },
  { path: '/assignments/:assignmentId',name:'AssignmentWorkspace',component:{render:()=>null} },
  { path: '/assignment-documents/:assignmentId',name:'AssignmentAuthoring',component:{render:()=>null} },
  { path: '/experiments/:experimentId',name:'ExperimentEvidence',component:{render:()=>null} },
  ...['dashboard','laboratory','circuits','stations','experiments','settings'].map(path=>({path:`/${path}`,redirect:'/'})),
  { path: '/:pathMatch(.*)*', name:'UnknownWorkspace',component:{render:()=>null} },
]
