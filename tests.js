// Repeatable API integration tests. Uses a temporary database, never real project data.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'borrowbuddy-test-'));
process.env.BORROWBUDDY_DATA_DIR=folder;
process.env.NODE_ENV='test';
const {server}=require('./server');
let count=0;
const test=(description, fn)=>fn().then(()=>{console.log('PASS',description);count++;});
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  let mayaCookie='',jordanCookie='';
  async function api(route,{method='GET',cookie='',payload}={}){
    const res=await fetch(base+route,{method,headers:{...(payload?{'Content-Type':'application/json'}:{}),...(cookie?{'Cookie':cookie}:{})},body:payload?JSON.stringify(payload):undefined});
    return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
  }
  const user={name:'Maya Chen',email:'maya@example.test',password:'SomePassword123!'};
  await test('valid registration and session creation',async()=>{const r=await api('/api/auth/register',{method:'POST',payload:user});assert.equal(r.status,201);assert.ok(r.cookie);mayaCookie=r.cookie;});
  await test('duplicate account rejected',async()=>{const r=await api('/api/auth/register',{method:'POST',payload:user});assert.equal(r.status,409);});
  await test('weak password rejected',async()=>{const r=await api('/api/auth/register',{method:'POST',payload:{name:'Bad',email:'bad@example.test',password:'123'}});assert.equal(r.status,400);});
  await test('invalid password rejected',async()=>{const r=await api('/api/auth/login',{method:'POST',payload:{email:user.email,password:'wrongpassword'}});assert.equal(r.status,401);});
  await test('second account registration',async()=>{const r=await api('/api/auth/register',{method:'POST',payload:{name:'Jordan Lee',email:'jordan@example.test',password:'OtherPassword123!'}});assert.equal(r.status,201);jordanCookie=r.cookie;});
  const item={title:'TI-84 Plus Calculator',category:'School Supplies',condition:'Good',location:'Willis Library lobby',description:'Working calculator with a protective case for exams.',isListed:true};
  let itemId,requestId;
  await test('unauthenticated listing creation blocked',async()=>{assert.equal((await api('/api/items',{method:'POST',payload:item})).status,401);});
  await test('invalid listing form rejected',async()=>{assert.equal((await api('/api/items',{method:'POST',cookie:mayaCookie,payload:{...item,description:'short'}})).status,400);});
  await test('lender can create an item',async()=>{const r=await api('/api/items',{method:'POST',cookie:mayaCookie,payload:item});assert.equal(r.status,201);itemId=r.body.item.id;});
  await test('browse and search returns saved listing',async()=>{const r=await api('/api/items?q=calculator');assert.equal(r.body.items.length,1);assert.equal(r.body.items[0].title,item.title);});
  await test('non-owner cannot edit listing',async()=>{assert.equal((await api('/api/items/'+itemId,{method:'PUT',cookie:jordanCookie,payload:{...item,title:'Altered'}})).status,403);});
  await test('lender can edit listing',async()=>{const r=await api('/api/items/'+itemId,{method:'PUT',cookie:mayaCookie,payload:{...item,title:'TI-84 Plus Graphing Calculator'}});assert.equal(r.status,200);});
  const start=new Date();start.setDate(start.getDate()+1);const end=new Date(start);end.setDate(end.getDate()+3);
  const asDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const reqData={itemId,startDate:asDate(start),endDate:asDate(end),notes:'Need for exam'};
  await test('owner cannot borrow own item',async()=>{assert.equal((await api('/api/requests',{method:'POST',cookie:mayaCookie,payload:reqData})).status,400);});
  await test('invalid return date rejected',async()=>{assert.equal((await api('/api/requests',{method:'POST',cookie:jordanCookie,payload:{...reqData,endDate:'2020-01-01'}})).status,400);});
  await test('borrower submits valid request',async()=>{const r=await api('/api/requests',{method:'POST',cookie:jordanCookie,payload:reqData});assert.equal(r.status,201);requestId=r.body.request.id;});
  await test('duplicate pending request prevented',async()=>{assert.equal((await api('/api/requests',{method:'POST',cookie:jordanCookie,payload:reqData})).status,409);});
  await test('wrong person cannot approve request',async()=>{assert.equal((await api('/api/requests/'+requestId,{method:'PATCH',cookie:jordanCookie,payload:{action:'approve'}})).status,403);});
  await test('owner approval activates a loan',async()=>{const r=await api('/api/requests/'+requestId,{method:'PATCH',cookie:mayaCookie,payload:{action:'approve'}});assert.equal(r.body.request.status,'approved');});
  await test('approved loan marks item unavailable',async()=>{const r=await api('/api/items');assert.equal(r.body.items[0].available,false);});
  await test('double lending prevented',async()=>{assert.equal((await api('/api/requests',{method:'POST',cookie:jordanCookie,payload:reqData})).status,409);});
  await test('only lender can confirm return',async()=>{assert.equal((await api('/api/requests/'+requestId,{method:'PATCH',cookie:jordanCookie,payload:{action:'return'}})).status,403);});
  await test('return restores availability and records history',async()=>{const r=await api('/api/requests/'+requestId,{method:'PATCH',cookie:mayaCookie,payload:{action:'return'}});assert.equal(r.body.request.status,'returned');assert.ok(r.body.request.returnedAt);assert.equal((await api('/api/items')).body.items[0].available,true);});
  await test('requests survive persistence to JSON',async()=>{const disk=JSON.parse(fs.readFileSync(path.join(folder,'borrowbuddy.json'),'utf8'));assert.equal(disk.requests[0].status,'returned');assert.equal(disk.users.length,2);});
  await test('owner can delete completed listing',async()=>{assert.equal((await api('/api/items/'+itemId,{method:'DELETE',cookie:mayaCookie})).status,200);});
  await test('history retains item name after deletion',async()=>{const r=await api('/api/requests?role=borrower',{cookie:jordanCookie});assert.equal(r.body.requests[0].itemTitle,'TI-84 Plus Graphing Calculator');});
  await test('logout invalidates session',async()=>{await api('/api/auth/logout',{method:'POST',cookie:jordanCookie});assert.equal((await api('/api/requests',{cookie:jordanCookie})).status,401);});
  console.log(`\nALL ${count} API INTEGRATION TESTS PASSED`);
}
run().then(()=>server.close(()=>fs.rmSync(folder,{recursive:true,force:true}))).catch(e=>{console.error(e);server.close(()=>fs.rmSync(folder,{recursive:true,force:true}));process.exitCode=1;});
