import { fileCommand, expectEventConnection, selectRun } from './workbench-ui'
import {test,expect,type Browser,type BrowserContext,type Page} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import type {ExperimentCreate,ExperimentRecord} from '../src/contracts/generated/dto'
import {parseStructural} from '../src/contracts/structural'
const origin='http://127.0.0.1:14173'
const assignmentPanel=(page:Page)=>page.getByRole('region',{name:'Assignments',exact:true})
const historyPanel=(page:Page)=>page.getByRole('region',{name:'Experiment history and queue',exact:true})
const graph=(name='AND working circuit')=>({schema_version:'1.0',circuit_id:'w6-and-circuit',modules:[{id:'X',type:'DIGITAL_SWITCH',properties:{state:false}},{id:'Y',type:'DIGITAL_SWITCH',properties:{state:true}},{id:'G',type:'74HC08'},{id:'L',type:'LED'},{id:'BB',type:'BREADBOARD'}],connections:[{source:'X.OUT',destination:'G.A1'},{source:'Y.OUT',destination:'G.B1'},{source:'G.Y1',destination:'L.IN'}],metadata:{name,opaque_extension:{retain:['exact',7]}}})
const definition=(id:string,title:string)=>({schema_version:'1.0',assignment_id:id,title,assessment_policy:'FUNCTIONAL_ONLY',lab_endpoints:[{endpoint_id:'x',role:'INPUT_SOURCE',design_port:'X.OUT'},{endpoint_id:'y',role:'OUTPUT_SENSE',design_port:'L.IN'}],expected_behavior:{expected_signals:[{signal:'y',time_ns:10,value:0}]},reference_design_graph:graph()})
async function admin(browser:Browser){const context=await browser.newContext({baseURL:origin}),session=parseStructural('SessionView',await(await context.request.get('/api/auth/session')).json());const response=await context.request.post('/api/auth/login',{headers:{Origin:origin,'X-CSRF-Token':session.csrf_token},data:{username:'e2e_admin',password:process.env.NETCIRCUIT_E2E_ADMIN_PASSWORD!}});expect(response.status()).toBe(200);return {context,session:parseStructural('SessionView',await response.json())}}
async function createUser(context:BrowserContext,csrf:string,role:'INSTRUCTOR'|'STUDENT'){const username=`w6_${role.toLowerCase()}_${randomUUID().slice(0,8)}`,password=`secret-${randomUUID()}`;expect((await context.request.post('/api/admin/users',{headers:{Origin:origin,'X-CSRF-Token':csrf},data:{username,password,display_name:username,role}})).status()).toBe(201);return {username,password}}
async function login(page:Page,user:{username:string;password:string}){await page.goto('/');await page.getByRole('button',{name:'Open account',exact:true}).click();await page.getByLabel('Username',{exact:true}).fill(user.username);await page.getByLabel('Password',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close account',exact:true}).click();await expectEventConnection(page)}
async function openAssignments(page:Page){await fileCommand(page, 'Assignment');await expect(assignmentPanel(page)).toBeVisible()}
async function importGraph(page:Page,value=graph()){await page.getByLabel('Open circuit file',{exact:true}).setInputFiles({name:'and.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});await expect(page.locator('.project-title')).toContainText(String(value.metadata.name))}
async function title(page:Page,value:string){await assignmentPanel(page).getByLabel('Assignment title',{exact:true}).fill(value);await assignmentPanel(page).getByLabel('Assignment title',{exact:true}).press('Tab')}
async function save(page:Page,revision:number){await assignmentPanel(page).getByRole('button',{name:'Save assignment draft',exact:true}).click();await expect(assignmentPanel(page).getByLabel('Assignment save status',{exact:true})).toContainText(`revision ${revision}`);await expect(assignmentPanel(page).getByLabel('Assignment save status',{exact:true})).toContainText('saved')}
async function endpoint(page:Page,id:string,role:string,target:string){const panel=assignmentPanel(page);await panel.getByLabel('Endpoint ID',{exact:true}).fill(id);await panel.getByLabel('Endpoint role',{exact:true}).selectOption(role);await panel.getByLabel('Endpoint target',{exact:true}).fill(target);await panel.getByRole('button',{name:'Add assignment endpoint',exact:true}).click()}
async function history(page:Page){await fileCommand(page, 'History');await expect(historyPanel(page)).toBeVisible()}

test('instructor drafts publish stable student views and CAS conflicts preserve local answers for a fork',async({browser})=>{
 test.setTimeout(120_000)
 const setup=await admin(browser),teacher=await createUser(setup.context,setup.session.csrf_token,'INSTRUCTOR'),student=await createUser(setup.context,setup.session.csrf_token,'STUDENT')
 const teacherContext=await browser.newContext({baseURL:origin}),studentContext=await browser.newContext({baseURL:origin}),page=await teacherContext.newPage(),learner=await studentContext.newPage()
 try{
  await login(page,teacher);await importGraph(page);const canvas=page.getByLabel('Three-dimensional circuit workspace',{exact:true});await canvas.evaluate(element=>element.setAttribute('data-w6-canvas','preserved'))
  await openAssignments(page);await assignmentPanel(page).getByRole('button',{name:'New assignment draft',exact:true}).click();await title(page,'Published AND lesson')
  const id=await assignmentPanel(page).getByLabel('Assignment ID',{exact:true}).inputValue()
  await endpoint(page,'x','INPUT_SOURCE','X.OUT');await endpoint(page,'y','OUTPUT_SENSE','L.IN')
  await assignmentPanel(page).getByLabel('Expected signal name',{exact:true}).fill('y');await assignmentPanel(page).getByLabel('Expected signal time',{exact:true}).fill('10');await assignmentPanel(page).getByRole('button',{name:'Add expected signal',exact:true}).click()
  await assignmentPanel(page).getByRole('button',{name:'Use current circuit as reference',exact:true}).click();await save(page,1)
  await assignmentPanel(page).getByRole('button',{name:'Publish saved assignment',exact:true}).click();await expect(assignmentPanel(page).getByLabel('Assignment save status',{exact:true})).toContainText('published revision 2')
  const privateDocument=parseStructural('AssignmentAuthoringDocument',await(await teacherContext.request.get(`/api/assignment-documents/${id}`)).json());expect(privateDocument.definition.reference_design_graph).toEqual(graph());expect(privateDocument.definition.expected_behavior?.expected_signals).toEqual([{signal:'y',time_ns:10,value:0}])
  await login(learner,student);await importGraph(learner,graph('Student circuit stays open'));await openAssignments(learner)
  await assignmentPanel(learner).getByRole('button',{name:'Use assignment Published AND lesson',exact:true}).click();await expect(assignmentPanel(learner).getByRole('region',{name:'Instructor assignment authoring',exact:true})).toHaveCount(0)
  const publicView=parseStructural('AssignmentView',await(await studentContext.request.get(`/api/assignments/${id}`)).json());expect(publicView.document_kind).toBe('student');expect(publicView).not.toHaveProperty('expected_behavior');expect(publicView).not.toHaveProperty('reference_design_graph');expect(publicView.lab_endpoints[0]).not.toHaveProperty('design_port')
  expect([403,404]).toContain((await studentContext.request.get(`/api/assignment-documents/${id}`)).status());await expect(learner.locator('.project-title')).toContainText('Student circuit stays open')
  await title(page,'Unpublished teacher changes');await save(page,3);await expect(assignmentPanel(page).getByLabel('Assignment save status',{exact:true})).toContainText('published revision 2')
  await assignmentPanel(learner).getByRole('button',{name:'Refresh published assignments',exact:true}).click();await expect(assignmentPanel(learner).getByRole('button',{name:'Use assignment Published AND lesson',exact:true})).toBeVisible();expect((await(await studentContext.request.get(`/api/assignments/${id}`)).json()).title).toBe('Published AND lesson')
  await assignmentPanel(page).getByRole('button',{name:'Publish saved assignment',exact:true}).click();await expect(assignmentPanel(page).getByLabel('Assignment save status',{exact:true})).toContainText('published revision 4')
  const other=await teacherContext.newPage();await other.goto(`/assignment-documents/${id}`);await expect(assignmentPanel(other).getByLabel('Assignment save status',{exact:true})).toContainText('revision 4')
  await title(page,'First author update');await save(page,5);await title(other,'Keep conflicting local answers');await assignmentPanel(other).getByRole('button',{name:'Save assignment draft',exact:true}).click();await expect(assignmentPanel(other).getByLabel('Assignment save status',{exact:true})).toContainText('conflict');await expect(assignmentPanel(other).getByLabel('Assignment title',{exact:true})).toHaveValue('Keep conflicting local answers')
  await assignmentPanel(other).getByRole('button',{name:'Keep conflicting assignment changes',exact:true}).click();await assignmentPanel(other).getByRole('button',{name:'Reload assignment draft',exact:true}).click();await assignmentPanel(other).getByRole('button',{name:'Keep assignment changes',exact:true}).click();await expect(assignmentPanel(other).getByLabel('Assignment title',{exact:true})).toHaveValue('Keep conflicting local answers')
  await assignmentPanel(other).getByRole('button',{name:'Fork assignment draft',exact:true}).click();const forkId=await assignmentPanel(other).getByLabel('Assignment ID',{exact:true}).inputValue();expect(forkId).not.toBe(id);await save(other,1)
  expect((await(await teacherContext.request.get(`/api/assignment-documents/${id}`)).json()).revision).toBe(5);expect((await(await teacherContext.request.get(`/api/assignment-documents/${forkId}`)).json()).definition.expected_behavior).toEqual(privateDocument.definition.expected_behavior)
  await expect(canvas).toHaveAttribute('data-w6-canvas','preserved');await expect(page.locator('.project-title')).toContainText('AND working circuit')
 }finally{await teacherContext.close();await studentContext.close();await setup.context.close()}
})

test('a student submits typed pre-run vectors to the real virtual AND circuit and restores captured history without replaying Run',async({page,browser,context})=>{
 test.setTimeout(90_000)
 const setup=await admin(browser),student=await createUser(setup.context,setup.session.csrf_token,'STUDENT'),id=`and-${randomUUID()}`
 try{
  const created=await setup.context.request.post('/api/assignment-documents',{headers:{Origin:origin,'X-CSRF-Token':setup.session.csrf_token},data:{definition:definition(id,'Capture AND exercise')}});expect(created.status()).toBe(201)
  expect((await setup.context.request.patch(`/api/assignment-documents/${id}/publication`,{headers:{Origin:origin,'X-CSRF-Token':setup.session.csrf_token},data:{base_revision:1,published:true}})).status()).toBe(200)
  await login(page,student);await importGraph(page);const canvas=page.getByLabel('Three-dimensional circuit workspace',{exact:true});await canvas.evaluate(element=>element.setAttribute('data-w6-canvas','history-preserved'))
  await openAssignments(page);await assignmentPanel(page).getByRole('button',{name:'Use assignment Capture AND exercise',exact:true}).click();await page.getByRole('button',{name:'Close Assignments',exact:true}).click()
  await page.getByRole('button',{name:'Open Inspector',exact:true}).click();await page.getByLabel('Capture duration (ns)',{exact:true}).fill('40');await page.getByLabel('Capture signals',{exact:true}).fill('y');await page.getByLabel('Capture signals',{exact:true}).press('Tab');await page.getByLabel('Capture maximum events',{exact:true}).fill('100');await page.getByLabel('Test vector time (ns)',{exact:true}).fill('20');await page.getByLabel('Test vector inputs',{exact:true}).fill('x=1');await page.getByRole('button',{name:'Add test vector',exact:true}).click();await expect(page.getByLabel('Include trigger in next Run',{exact:true})).toBeDisabled();await page.getByRole('button',{name:'Close Inspector',exact:true}).click()
  let captureCreate!:(value:{submitted:ExperimentCreate;record:ExperimentRecord})=>void,rejectCreate!:(reason:unknown)=>void,createPosts=0
  const actualCreate=new Promise<{submitted:ExperimentCreate;record:ExperimentRecord}>((resolve,reject)=>{captureCreate=resolve;rejectCreate=reject})
  await page.route('**/api/experiments',async route=>{
   if(route.request().method()!=='POST'){await route.continue();return}
   try{
    createPosts++
    // Read the real committed server response before the page can navigate.
    // A page Response body can disappear from Chromium after navigation.
    const response=await route.fetch({maxRetries:0,timeout:10_000});expect(response.status()).toBe(201)
    const submitted=parseStructural('ExperimentCreate',route.request().postDataJSON()),record=parseStructural('ExperimentRecord',await response.json())
    captureCreate({submitted,record})
    await route.fulfill({response})
   }catch(error){rejectCreate(error);throw error}
  })
  await selectRun(page);await page.getByRole('toolbar',{name:'Execution controls',exact:true}).getByRole('button',{name:'Run',exact:true}).click();const {submitted,record}=await actualCreate;expect(submitted.capture_config).toEqual({signals:['y'],duration_ns:40,max_events:100});expect(submitted.test_vectors).toEqual([{time_ns:20,inputs:{x:1}}]);expect(submitted).not.toHaveProperty('generator_config');expect(submitted).not.toHaveProperty('clock_config');expect(record.assignment_id).toBe(id);expect(createPosts).toBe(1)
  await expect.poll(async()=> (await(await context.request.get(`/api/experiments/${record.experiment_id}`)).json()).state,{timeout:30_000}).toBe('COMPLETE')
  const result=parseStructural('ExperimentRecord',await(await context.request.get(`/api/experiments/${record.experiment_id}`)).json());expect(result.capture?.available).toBe(true);expect(result.functional_verification?.status).toBe('PASS');expect(result.functional_verification).not.toHaveProperty('expected_signals')
  await history(page);await historyPanel(page).getByRole('button',{name:'Refresh execution history',exact:true}).click();await historyPanel(page).getByRole('button',{name:`Read experiment ${record.experiment_id}`,exact:true}).click();await expect(page).toHaveURL(new RegExp(`/experiments/${record.experiment_id}$`));await expect(historyPanel(page).getByLabel('Evidence access',{exact:true})).toContainText('Read-only history')
  await historyPanel(page).getByRole('button',{name:'Open selected capture',exact:true}).click();await expect(page.getByRole('img',{name:'Observed digital event traces',exact:true})).toBeVisible();await expect(page.locator('path.observed-trace[data-signal="y"]')).toHaveAttribute('d',/V8/)
  await expect(canvas).toHaveAttribute('data-w6-canvas','history-preserved');await expect(page.locator('.project-title')).toContainText('AND working circuit')
  let creates=0,runs=0;page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/experiments')creates++;if(request.method()==='POST'&&/\/run$/.test(new URL(request.url()).pathname))runs++})
  await page.reload();await expect(historyPanel(page).getByRole('region',{name:'Selected experiment evidence',exact:true})).toContainText(record.experiment_id);await expect(historyPanel(page).getByLabel('Evidence access',{exact:true})).toContainText('Read-only history');await historyPanel(page).getByRole('button',{name:'Open selected capture',exact:true}).click();await expect(page.getByRole('img',{name:'Observed digital event traces',exact:true})).toBeVisible();expect(creates).toBe(0);expect(runs).toBe(0)
 }finally{await setup.context.close()}
})

test('Stop during a real committed Create with a lost acknowledgement resolves identity and never sends Run',async({page,context})=>{
 test.setTimeout(90_000)
 await page.goto('/');await expectEventConnection(page);await importGraph(page)
 let committed!:(value:ExperimentRecord)=>void,release!:()=>void;const actualCreate=new Promise<ExperimentRecord>(resolve=>committed=resolve),allowLoss=new Promise<void>(resolve=>release=resolve)
 let creates=0,runs=0,stops=0
 page.on('request',request=>{if(request.method()!=='POST')return;const path=new URL(request.url()).pathname;if(path==='/api/experiments')creates++;if(/\/run$/.test(path))runs++;if(/\/stop$/.test(path))stops++})
 await page.route('**/api/experiments',async route=>{if(route.request().method()!=='POST'){await route.continue();return}const response=await route.fetch();expect(response.status()).toBe(201);committed(parseStructural('ExperimentRecord',await response.json()));await allowLoss;await route.abort('connectionreset')})
 await selectRun(page);await page.getByRole('toolbar',{name:'Execution controls',exact:true}).getByRole('button',{name:'Run',exact:true}).click();const record=await actualCreate
 expect((await context.request.get(`/api/experiments/${record.experiment_id}`)).status()).toBe(200)
 await selectRun(page);await page.getByRole('toolbar',{name:'Execution controls',exact:true}).getByRole('button',{name:'Stop',exact:true}).click();release()
 await expect.poll(async()=> (await(await context.request.get(`/api/experiments/${record.experiment_id}`)).json()).state,{timeout:30_000}).toBe('COMPLETE')
 await history(page);await historyPanel(page).getByRole('button',{name:'Refresh execution history',exact:true}).click();await expect(historyPanel(page).getByRole('button',{name:`Read experiment ${record.experiment_id}`,exact:true})).toBeVisible()
 expect(creates).toBe(1);expect(stops).toBe(1);expect(runs).toBe(0)
})
