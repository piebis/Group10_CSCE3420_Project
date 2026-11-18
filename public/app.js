/* BorrowBuddy client: dynamic pages, validated forms, and database-backed API workflows. */
'use strict';
const state = {user:null,items:[],myItems:[],requests:[],page:'browse',role:'borrower',q:'',category:'All',available:true};
const CATEGORIES=['Electronics','Textbooks','Tools','School Supplies','Outdoor','Other'];
const EMOJI={Electronics:'📷',Textbooks:'📚',Tools:'🛠️','School Supplies':'🧮',Outdoor:'🏕️',Other:'📦'};
const app=document.getElementById('app-content');
const modalRoot=document.getElementById('modal-root');
let toastTimer;
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmtDate=value=>{if(!value)return '—';const dt=new Date(value.slice(0,10)+'T12:00:00');return dt.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});};
const localToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const fmtStatus=value=>({pending:'Pending',approved:'Active loan',declined:'Declined',canceled:'Canceled',returned:'Returned'})[value]||value;
function showToast(message,error=false){const el=document.getElementById('toast');el.textContent=message;el.className='toast show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='toast',3600);}
async function api(url,opts={}){
  const response=await fetch(url,{credentials:'same-origin',...opts,headers:{...(opts.body?{'Content-Type':'application/json'}:{}),...(opts.headers||{})}});
  let body;try{body=await response.json();}catch{throw new Error('Unable to read the server response.');}
  if(!response.ok)throw new Error(body.error||`Request failed (${response.status}).`);
  return body;
}
async function refresh(){
  const [me,items]=await Promise.all([api('/api/auth/me'),api('/api/items')]);
  state.user=me.user;state.items=items.items;
  if(state.user){
    const [mine,requests]=await Promise.all([api('/api/items?mine=true'),api('/api/requests')]);
    state.myItems=mine.items;state.requests=requests.requests;
  }else{state.myItems=[];state.requests=[];}
  drawHeader();render();
}
function drawHeader(){
  document.getElementById('header-actions').innerHTML=state.user?
    `<span class="user-identity"><span class="avatar">${esc(state.user.name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase())}</span><span class="user-name">${esc(state.user.name)}</span></span><button class="btn btn-outline btn-sm" data-action="logout">Log out</button>`:
    `<button class="btn btn-outline btn-sm" data-action="login">Log in</button><button class="btn btn-primary btn-sm" data-action="signup">Sign up</button>`;
  document.querySelectorAll('[data-nav]').forEach(el=>el.classList.toggle('current',el.dataset.nav===state.page));
  const pending=state.requests.filter(r=>r.lenderId===state.user?.id&&r.status==='pending').length;
  const badge=document.getElementById('request-count');badge.hidden=!pending;
}
function render(){drawHeader();if(state.page==='browse')renderBrowse();else if(state.page==='listings')renderListings();else renderLoans();}
function go(page){if((page==='listings'||page==='loans')&&!state.user){openAuth('login');showToast('Sign in to manage your campus lending.',true);return;}state.page=page;window.scrollTo({top:0,behavior:'instant'});render();}
function currentListings(){return state.items.filter(it=>{
  if(state.available&&!it.available)return false;
  if(state.category!=='All'&&state.category!==it.category)return false;
  return [it.title,it.description,it.category,it.location,it.lenderName].join(' ').toLowerCase().includes(state.q.toLowerCase().trim());
});}
function itemCard(it){
  return `<article class="item-card">
    <div class="item-image" data-category="${esc(it.category)}" aria-label="${esc(it.category)} illustration">${EMOJI[it.category]||'📦'}
      <span class="pill ${it.available?'pill-available':'pill-unavailable'}">${it.available?'● Available':'● On loan'}</span>
    </div><div class="card-body"><span class="card-category">${esc(it.category)}</span>
      <h3 class="card-title">${esc(it.title)}</h3><p class="card-desc">${esc(it.description.slice(0,91))}${it.description.length>91?'…':''}</p>
      <div class="card-meta"><span>📍 ${esc(it.location)}</span><span>✦ ${esc(it.condition)}</span></div>
      <div class="card-bottom"><strong>👤 ${esc(it.lenderName)}</strong><button class="btn btn-soft btn-sm" data-action="detail" data-id="${esc(it.id)}">View item ↗</button></div>
    </div></article>`;
}
function renderBrowse(){
  app.innerHTML=`<section class="hero" aria-labelledby="hero-title"><div class="hero-copy">
    <p class="eyebrow"><span class="round"></span> The smarter way to share on campus</p>
    <h1 id="hero-title">Need it once? <em>Borrow it.</em></h1>
    <p>From calculators to cameras, find what you need from fellow students. Spend less, share more, and keep good things in circulation.</p>
    <div class="hero-actions"><button class="btn btn-primary" data-action="create">＋ List an item</button><button class="btn btn-outline" data-action="how">How it works ↗</button></div>
    </div><div class="hero-art" aria-hidden="true">🎒</div></section>
    <section class="kpis" aria-label="Community overview">
      <div class="kpi"><span><strong>${state.items.length}</strong><small>Campus listings</small></span><span class="kpi-icon">📦</span></div>
      <div class="kpi"><span><strong>${state.items.filter(i=>i.available).length}</strong><small>Ready to borrow</small></span><span class="kpi-icon">✨</span></div>
      <div class="kpi"><span><strong>${new Set(state.items.map(i=>i.ownerId)).size}</strong><small>Student lenders</small></span><span class="kpi-icon">🤝</span></div>
    </section>
    <section aria-labelledby="browse-heading"><div class="section-head"><div><h2 id="browse-heading">Explore the collection</h2><p>Useful things. Real students. No unnecessary purchases.</p></div><span class="tag" id="result-count">${state.items.length} items</span></div>
      <div class="filters"><label class="search-wrap">⌕ <input aria-label="Search listings" placeholder="Search cameras, calculators, books..." id="search-input" value="${esc(state.q)}" /></label>
      <select aria-label="Filter category" class="filter-select" id="category-select"><option value="All">All categories</option>${CATEGORIES.map(c=>`<option value="${esc(c)}" ${state.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
      <label class="filter-check"><input type="checkbox" id="available-only" ${state.available?'checked':''}/> Available only</label></div>
      <div class="items-grid" id="items-area"></div>
    </section>`;
  renderCards();
}
function renderCards(){const el=document.getElementById('items-area');if(!el)return;const items=currentListings();el.innerHTML=items.length?items.map(itemCard).join(''):
  `<div class="empty-state"><div class="big-icon">🔎</div><h3>No matching items</h3><p>Try another keyword, choose a different category, or turn off the availability filter.</p><button class="btn btn-soft" data-action="clear-filters">Clear filters</button></div>`;
  document.getElementById('result-count').textContent=`${items.length} item${items.length!==1?'s':''}`;
}
function renderListings(){
  const items=state.myItems;
  app.innerHTML=`<section class="page-top section-head"><div><h1>My listings</h1><p>Share items you are happy to lend to students.</p></div><button class="btn btn-primary" data-action="create">＋ Add an item</button></section>
  <div class="strip">💡 &nbsp; List items you're comfortable lending. Meet in a public campus location and inspect items together.</div>
  <div class="list-stack">${items.length?items.map(it=>`<article class="listing-row"><div class="listing-emoji">${EMOJI[it.category]||'📦'}</div><div class="listing-info"><h3>${esc(it.title)}</h3><p>${esc(it.category)} · ${esc(it.location)} · ${it.available?'Available':'Unavailable'}</p></div><span class="pill ${it.available?'pill-available':'pill-unavailable'}">${it.available?'Available':'Paused / on loan'}</span><div class="listing-actions"><button class="btn btn-outline btn-sm" data-action="edit" data-id="${esc(it.id)}">Edit</button><button class="btn btn-danger btn-sm" data-action="delete" data-id="${esc(it.id)}">Delete</button></div></article>`).join(''):
  `<div class="empty-state"><div class="big-icon">📦</div><h3>Your shelf is empty</h3><p>List a useful item so another student can borrow it instead of buying it.</p><button class="btn btn-primary" data-action="create">List your first item</button></div>`}</div>`;
}
function renderLoans(){
  const outgoing=state.requests.filter(r=>r.borrowerId===state.user.id),incoming=state.requests.filter(r=>r.lenderId===state.user.id);
  const subset=state.role==='borrower'?outgoing:incoming;
  app.innerHTML=`<section class="page-top"><h1>My loans</h1><p>Stay on top of every request, approval, and return.</p></section>
    <div class="statistics"><div class="stat"><strong>${outgoing.length}</strong><span>Requests I've sent</span></div><div class="stat"><strong>${incoming.filter(r=>r.status==='pending').length}</strong><span>Requests to review</span></div><div class="stat"><strong>${state.requests.filter(r=>r.status==='approved').length}</strong><span>Active loans</span></div></div>
    <div class="segmented" role="group" aria-label="Loan history tabs"><button data-action="role" data-role="borrower" class="${state.role==='borrower'?'selected':''}">I'm borrowing (${outgoing.length})</button><button data-action="role" data-role="lender" class="${state.role==='lender'?'selected':''}">I'm lending (${incoming.length})</button></div>
    <div class="list-stack">${subset.length?subset.map(requestRow).join(''):`<div class="empty-state"><div class="big-icon">📅</div><h3>No ${state.role==='borrower'?'borrowing':'lending'} activity yet</h3><p>${state.role==='borrower'?'Browse the collection and request an item you need.':'When someone requests your item, you can review it here.'}</p><button class="btn btn-primary" data-nav="browse">Browse items</button></div>`}</div>`;
}
function requestRow(r){
  const borrower=state.role==='borrower';
  const actions=r.status==='pending'?(borrower?`<button class="btn btn-danger btn-sm" data-action="request" data-status="cancel" data-id="${esc(r.id)}">Cancel request</button>`:
    `<button class="btn btn-primary btn-sm" data-action="request" data-status="approve" data-id="${esc(r.id)}">Approve</button><button class="btn btn-outline btn-sm" data-action="request" data-status="decline" data-id="${esc(r.id)}">Decline</button>`):
    (r.status==='approved'&&!borrower?`<button class="btn btn-primary btn-sm" data-action="request" data-status="return" data-id="${esc(r.id)}">Confirm return</button>`:'');
  return `<article class="request-card"><div><h3>${esc(r.itemTitle)}</h3><p>${borrower?'Lender: '+esc(r.lenderName):'Borrower: '+esc(r.borrowerName)}</p>
    <p>📆 ${fmtDate(r.startDate)} – ${fmtDate(r.endDate)} ${r.status==='approved'&&r.endDate<localToday()?'· ⚠️ Past due':''}</p>
    ${r.notes?`<p>💬 ${esc(r.notes)}</p>`:''}</div><div class="request-actions"><span class="pill pill-${esc(r.status)}">${fmtStatus(r.status)}</span>${actions}</div></article>`;
}
function openModal(title,subtitle,html,{large=false}={}){
  modalRoot.innerHTML=`<div class="modal-backdrop" data-backdrop="true"><div class="modal ${large?'modal-lg':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-header"><div><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button class="close-modal" data-action="close" aria-label="Close dialog">×</button></div><div class="modal-body">${html}</div></div></div>`;
  modalRoot.querySelector('input,textarea,button')?.focus();
}
function closeModal(){modalRoot.innerHTML='';}
function openAuth(mode='login'){
  const signup=mode==='signup';openModal(signup?'Join BorrowBuddy':'Welcome back',signup?'Start sharing what you have and borrowing what you need.':'Log in to manage your campus lending.',
    `<form id="auth-form" data-mode="${mode}">${signup?`<div class="field"><label for="auth-name">Full name</label><input id="auth-name" name="name" required minlength="2" maxlength="60" autocomplete="name" placeholder="Your name"/></div>`:''}
    <div class="field"><label for="auth-email">Email address</label><input type="email" id="auth-email" name="email" required maxlength="160" autocomplete="email" placeholder="you@example.com" /></div>
    <div class="field"><label for="auth-password">Password</label><input type="password" id="auth-password" name="password" minlength="8" maxlength="128" required autocomplete="${signup?'new-password':'current-password'}" placeholder="At least 8 characters"/></div>
    <button class="btn btn-primary" style="width:100%" type="submit">${signup?'Create account':'Log in'}</button></form>
    <p class="auth-switch">${signup?'Already have an account?':'New here?'} <button class="link-button" data-action="${signup?'login':'signup'}">${signup?'Log in':'Create an account'}</button></p>`);
}
function openEdit(id=null){
  if(!state.user){openAuth('login');return;}
  const it=state.myItems.find(i=>i.id===id);
  openModal(it?'Edit your listing':'List an item','Only share items that you can safely lend and retrieve.',
    `<form id="item-form" data-id="${it?esc(it.id):''}"><div class="field"><label for="item-title">Item title</label><input id="item-title" name="title" required minlength="4" maxlength="80" placeholder="e.g. TI-84 graphing calculator" value="${esc(it?.title||'')}" /></div>
    <div class="field-row"><div class="field"><label for="item-category">Category</label><select name="category" id="item-category" required>${CATEGORIES.map(c=>`<option ${c===it?.category?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="field"><label for="item-condition">Condition</label><select id="item-condition" name="condition" required>${['Like new','Good','Fair'].map(c=>`<option ${c===(it?.condition||'Good')?'selected':''}>${c}</option>`).join('')}</select></div></div>
    <div class="field"><label for="item-desc">Description</label><textarea id="item-desc" name="description" required minlength="12" maxlength="600" placeholder="What comes with it? Anything students should know?">${esc(it?.description||'')}</textarea></div>
    <div class="field"><label for="item-location">Public campus pickup location</label><input id="item-location" name="location" required minlength="3" maxlength="80" value="${esc(it?.location||'Willis Library lobby')}"/><span class="field-help">Use a public meeting spot, not a personal address.</span></div>
    <div class="field"><label class="filter-check"><input type="checkbox" name="isListed" ${it?.isListed!==false?'checked':''}/> Listing is visible to other students</label></div>
    <div class="form-actions"><button type="button" class="btn btn-outline" data-action="close">Cancel</button><button type="submit" class="btn btn-primary">${it?'Save changes':'Publish listing'}</button></div></form>`,{large:true});
}
function openDetails(id){
  const it=state.items.find(i=>i.id===id)||state.myItems.find(i=>i.id===id);
  if(!it)return showToast('That listing is no longer available.',true);
  const own=it.ownerId===state.user?.id;
  openModal(it.title,'Item details and pickup information',
    `<div class="detail-banner" aria-hidden="true">${EMOJI[it.category]||'📦'}</div><span class="card-category">${esc(it.category)}</span>
    <h3 class="detail-title">${esc(it.title)}</h3><p class="detail-description">${esc(it.description)}</p>
    <div class="detail-grid"><div><small>Owner</small><strong>${esc(it.lenderName)}</strong></div><div><small>Condition</small><strong>${esc(it.condition)}</strong></div><div><small>Meetup spot</small><strong>${esc(it.location)}</strong></div><div><small>Status</small><strong>${it.available?'Available to request':'Currently unavailable'}</strong></div></div>
    <div class="form-actions"><button class="btn btn-outline" data-action="close">Close</button>${own?`<button class="btn btn-primary" data-action="edit" data-id="${esc(it.id)}">Edit my item</button>`:
    `<button class="btn btn-primary" data-action="borrow" data-id="${esc(it.id)}" ${it.available?'':'disabled'}>${it.available?'Request to borrow':'Already on loan'}</button>`}</div>`,{large:true});
}
function openRequest(id){
  if(!state.user){openAuth('login');showToast('Log in to request this item.');return;}
  const it=state.items.find(i=>i.id===id);
  if(!it)return;
  if(it.ownerId===state.user.id)return showToast('You cannot borrow your own item.',true);
  if(!it.available)return showToast('This item is currently unavailable.',true);
  const today=localToday();
  openModal('Request to borrow',`Send a request to ${it.lenderName} for “${it.title}”.`,
    `<form id="request-form" data-id="${esc(it.id)}"><div class="field-row"><div class="field"><label for="request-start">Borrow date</label><input type="date" required name="startDate" id="request-start" min="${today}" value="${today}"/></div><div class="field"><label for="request-end">Return date</label><input type="date" required name="endDate" id="request-end" min="${today}" value="${today}"/></div></div>
    <p class="field-help">Borrow for up to 14 calendar days. The lender must approve your request.</p>
    <div class="field" style="margin-top:16px"><label for="request-notes">Message to lender (optional)</label><textarea name="notes" maxlength="240" id="request-notes" placeholder="What will you use it for? When can you meet?"></textarea></div>
    <div class="form-actions"><button class="btn btn-outline" type="button" data-action="close">Cancel</button><button class="btn btn-primary" type="submit">Send request</button></div></form>`);
}
function howItWorks(){openModal('How borrowing works','A simple process designed around student-to-student sharing.',
  `<div class="list-stack"><div class="strip"><strong>1 · Explore</strong><br/>Search available items and view their descriptions, condition, and meetup location.</div><div class="strip"><strong>2 · Request</strong><br/>Choose dates of up to 14 days and submit a borrowing request.</div><div class="strip"><strong>3 · Lender reviews</strong><br/>The lender approves or declines. Approved items are locked to prevent double lending.</div><div class="strip"><strong>4 · Return</strong><br/>Coordinate a handoff in a public space. The lender confirms the return, reopening the listing.</div></div><p class="field-help">BorrowBuddy is a class project. Item exchange and identity verification are the responsibility of the users.</p>`);
}
async function action(name,id,el){
  if(name==='login'||name==='signup'){openAuth(name);return;}
  if(name==='logout'){await api('/api/auth/logout',{method:'POST'});closeModal();state.page='browse';await refresh();showToast('You have logged out.');return;}
  if(name==='close'){closeModal();return;}
  if(name==='create'){openEdit();return;}
  if(name==='edit'){openEdit(id);return;}
  if(name==='detail'){openDetails(id);return;}
  if(name==='borrow'){openRequest(id);return;}
  if(name==='how'){howItWorks();return;}
  if(name==='clear-filters'){state.q='';state.category='All';state.available=false;renderBrowse();return;}
  if(name==='role'){state.role=el.dataset.role;renderLoans();return;}
  if(name==='delete'){
    if(!confirm('Delete this listing? This cannot be undone.'))return;
    await api('/api/items/'+encodeURIComponent(id),{method:'DELETE'});await refresh();showToast('Listing deleted.');return;
  }
  if(name==='request'){
    const status=el.dataset.status;
    const verbs={approve:'Approve this request?',decline:'Decline this request?',cancel:'Cancel this request?',return:'Confirm that this item has been returned?'};
    if(!confirm(verbs[status]))return;
    await api('/api/requests/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({action:status})});await refresh();
    showToast({approve:'Request approved. Loan is now active.',decline:'Request declined.',cancel:'Request canceled.',return:'Return confirmed. Item is available again.'}[status]);
  }
}
document.addEventListener('click',async event=>{
  const nav=event.target.closest('[data-nav]');if(nav){go(nav.dataset.nav);return;}
  const btn=event.target.closest('[data-action]');if(btn){try{await action(btn.dataset.action,btn.dataset.id,btn);}catch(error){showToast(error.message,true);}return;}
  if(event.target.matches('[data-backdrop]'))closeModal();
});
document.addEventListener('input',event=>{
  if(event.target.id==='search-input'){state.q=event.target.value;renderCards();}
});
document.addEventListener('change',event=>{
  if(event.target.id==='category-select'){state.category=event.target.value;renderCards();}
  if(event.target.id==='available-only'){state.available=event.target.checked;renderCards();}
  if(event.target.id==='request-start'){const end=document.getElementById('request-end');end.min=event.target.value;if(end.value<end.min)end.value=end.min;}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!['auth-form','item-form','request-form'].includes(form.id))return;
  event.preventDefault();const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
  try{
    const values=Object.fromEntries(new FormData(form).entries());
    if(form.id==='auth-form'){
      const mode=form.dataset.mode;
      await api('/api/auth/'+(mode==='signup'?'register':'login'),{method:'POST',body:JSON.stringify(values)});
      closeModal();await refresh();showToast(mode==='signup'?'Account created successfully.':'Welcome back!');
    }else if(form.id==='item-form'){
      values.isListed=Boolean(form.querySelector('[name="isListed"]').checked);
      const id=form.dataset.id;
      await api(id?'/api/items/'+encodeURIComponent(id):'/api/items',{method:id?'PUT':'POST',body:JSON.stringify(values)});
      closeModal();await refresh();showToast(id?'Listing updated.':'Your item is now listed!');
    }else{
      const start=new Date(values.startDate+'T12:00:00Z'),end=new Date(values.endDate+'T12:00:00Z');
      if((end-start)/86400000>13 || end<start)throw new Error('Choose a borrowing period of 1–14 days.');
      await api('/api/requests',{method:'POST',body:JSON.stringify({...values,itemId:form.dataset.id})});
      closeModal();state.page='loans';state.role='borrower';await refresh();showToast('Your request has been sent to the lender.');
    }
  }catch(error){showToast(error.message,true);}finally{if(submit)submit.disabled=false;}
});
refresh().catch(error=>{app.innerHTML=`<div class="empty-state" style="margin-top:45px"><h3>Unable to connect to BorrowBuddy</h3><p>${esc(error.message)} Make sure the local server is running, then refresh the page.</p><button class="btn btn-primary" onclick="location.reload()">Try again</button></div>`;});
