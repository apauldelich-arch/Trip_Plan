/* Waymark cloud edition — private Supabase Auth + RLS data + private Storage. */
const $=s=>document.querySelector(s); const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Math.random().toString(36).slice(2,11)+Date.now().toString(36);
const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});const ym=d=>d.slice(0,7);
const seed=()=>[{id:uid(),name:'Madrid & Valencia',destination:'Spain',start:'2026-12-04',end:'2026-12-07',status:'upcoming',legs:[{id:uid(),type:'bus',title:'Coach to airport',from:'Central London',to:'Stansted Airport',date:'2026-12-04',time:'03:18',arrival:'05:00',details:'Check coach stop and live status',tasks:[{id:uid(),text:'Save coach ticket',done:false}],documents:[]},{id:uid(),type:'plane',title:'Flight to Madrid',from:'Stansted',to:'Madrid',date:'2026-12-04',time:'06:15',arrival:'09:20',details:'Arrival time is local. Allow time for security and baggage.',tasks:[{id:uid(),text:'Check in online',done:false},{id:uid(),text:'Confirm baggage allowance',done:false}],documents:[]},{id:uid(),type:'train',title:'Train to Valencia',from:'Madrid',to:'Valencia',date:'2026-12-05',time:'07:15',arrival:'09:15',details:'Illustrative rail connection',tasks:[],documents:[]},{id:uid(),type:'plane',title:'Flight home',from:'Valencia',to:'London',date:'2026-12-07',time:'11:10',arrival:'13:10',details:'Arrival time is London local time',tasks:[{id:uid(),text:'Save return boarding pass',done:false}],documents:[]}]}];
let trips=[],currentTrip=null,currentLeg=null,view='overview',month=new Date();
let name='Traveller',email='',fileTarget=null,cloudUser=null,client=null,writeQueue=Promise.resolve(),loadingUser=false;
const cfg=window.WAYMARK_CONFIG||{};
const configured=Boolean(cfg.supabaseUrl&&cfg.supabasePublishableKey&&!cfg.supabaseUrl.includes('YOUR_'));
const stateChip=()=>{const e=$('.local-chip');if(e)e.textContent=cloudUser?'● Private cloud sync':'● Sign in required'};
async function boot(){
  if(!configured){$('#auth-message').textContent='Cloud setup required: configure a dedicated Supabase project first. See README.';$('#auth-submit').disabled=true;return}
  try{
    const sdk=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm');
    client=sdk.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
    client.auth.onAuthStateChange((event,session)=>{
      if(event==='PASSWORD_RECOVERY'){queueMicrotask(()=>showPasswordRecovery());}
      if(event==='SIGNED_OUT') {cloudUser=null;trips=[];currentTrip=null;$('#app').classList.add('hidden');$('#auth').classList.remove('hidden');stateChip()}
      else if(session?.user&&(event==='SIGNED_IN'||event==='INITIAL_SESSION'||event==='USER_UPDATED')){
        queueMicrotask(()=>startSession(session.user));
      }
    });
    const {data,error}=await client.auth.getUser();if(error&&error.name!=='AuthSessionMissingError')console.warn('Auth:',error.message);
    if(data?.user)await startSession(data.user)
  }catch(e){$('#auth-message').textContent='Unable to load authentication. Check the configuration or your internet connection.';console.error(e)}
}
async function startSession(user){
  if(loadingUser||cloudUser?.id===user.id)return;
  loadingUser=true;cloudUser=user;name=user.user_metadata?.full_name||user.email?.split('@')[0]||'Traveller';email=user.email||'';
  try{const {data,error}=await client.from('waymark_workspaces').select('trips').eq('user_id',user.id).maybeSingle();if(error)throw error;
    trips=Array.isArray(data?.trips)?data.trips:[];
    currentTrip=null;currentLeg=null;view='overview';showApp();stateChip();
  }catch(e){cloudUser=null;$('#auth-message').textContent='Could not load private workspace: '+e.message;$('#app').classList.add('hidden');$('#auth').classList.remove('hidden')}
  finally{loadingUser=false}
}
function save(){
  if(!cloudUser||!client)return Promise.reject(Error('Not signed in'));
  const owner=cloudUser.id,snapshot=structuredClone(trips);
  writeQueue=writeQueue.catch(()=>{}).then(async()=>{
    if(!cloudUser||cloudUser.id!==owner)throw Error('Session changed before saving');
    const {error}=await client.from('waymark_workspaces').upsert({user_id:owner,trips:snapshot,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(error)throw error;
  });
  writeQueue.catch(e=>{console.error('Sync error',e);toast('Could not sync changes. Please check connection.')});
  return writeQueue;
}
function toast(s){$('#toast').textContent=s;$('#toast').classList.remove('hidden');clearTimeout(window.__toast);window.__toast=setTimeout(()=>$('#toast').classList.add('hidden'),2700)}
function modal(title,content){$('#modal-title').textContent=title;$('#modal-content').innerHTML=content;$('#modal-overlay').classList.remove('hidden')};function closeModal(){$('#modal-overlay').classList.add('hidden')}
$('#close-modal').onclick=closeModal;$('#modal-overlay').addEventListener('click',e=>{if(e.target===$('#modal-overlay'))closeModal()});
function showPasswordRecovery(){
  modal('Set a new password',`<form id="recover-form"><div class="input-wrap"><label>New password</label><input type="password" id="new-password" required minlength="8" autocomplete="new-password"></div><button class="btn primary">Update password</button></form>`);
  $('#recover-form').onsubmit=async e=>{e.preventDefault();const password=$('#new-password').value;const {error}=await client.auth.updateUser({password});if(error){toast(error.message);return}closeModal();toast('Password updated')};
}
function authMode(mode){$('#auth-submit').textContent=mode==='signup'?'Create private account →':mode==='reset'?'Send reset email →':'Sign in securely →';$('#password-wrap').classList.toggle('hidden',mode==='reset');$('#auth-mode').value=mode;$('#auth-message').textContent=''}
$('#tab-login').onclick=()=>authMode('login');$('#tab-signup').onclick=()=>authMode('signup');$('#forgot').onclick=()=>authMode('reset');
$('#auth-form').onsubmit=async e=>{
  e.preventDefault();if(!client)return;
  const mode=$('#auth-mode').value,mail=$('#auth-email').value.trim(),password=$('#auth-password').value;
  $('#auth-submit').disabled=true;$('#auth-message').textContent='Working…';
  try{
    let error,data;
    if(mode==='signup')({error,data}=await client.auth.signUp({email:mail,password,options:{emailRedirectTo:location.origin}}));
    else if(mode==='reset')({error}=await client.auth.resetPasswordForEmail(mail,{redirectTo:location.origin}));
    else ({error,data}=await client.auth.signInWithPassword({email:mail,password}));
    if(error)throw error;
    $('#auth-message').textContent=mode==='reset'?'If the address is registered, a reset email will be sent.':mode==='signup'&&!data?.session?'Check your email to verify your account.':'Signed in.';
  }catch(err){$('#auth-message').textContent=err.message||'Authentication failed'}
  finally{$('#auth-submit').disabled=false}
};
function showApp(){$('#auth').classList.add('hidden');$('#app').classList.remove('hidden');$('#avatar').textContent=name[0].toUpperCase();$('#profile-name').textContent=name;render()}
$('#logout').onclick=async()=>{try{await writeQueue;const {error}=await client.auth.signOut();if(error)throw error}catch(e){toast('Sign out failed: '+e.message)}};
$('#mobile-nav').onclick=()=>$('.sidebar').classList.toggle('open');$('#new-trip').onclick=addTripModal;
$('#reset-demo').onclick=async()=>{if(!cloudUser)return;if(confirm('Delete all cloud trip metadata for your account? Remove attached documents first if you also want to delete their stored files.')){trips=[];await save();currentTrip=null;view='overview';render()}};
for(const b of document.querySelectorAll('.nav'))b.onclick=()=>{view=b.dataset.view;currentTrip=null;$('.sidebar').classList.remove('open');render()};
function setTitle(title,subtitle){$('#page-title').innerHTML=escapeHTML(title)+'<span class="brand-dot">.</span>';$('#page-subtitle').textContent=subtitle;for(const b of document.querySelectorAll('.nav'))b.classList.toggle('active',b.dataset.view===view)}
function render(){if(currentTrip){renderTrip();return}if(view==='calendar')renderCalendarPage();else if(view==='documents')renderWallet();else renderOverview()}
function monthLabel(){return month.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}
function changeMonth(n){month=new Date(month.getFullYear(),month.getMonth()+n,1);render()}
function goToday(){const now=new Date();month=new Date(now.getFullYear(),now.getMonth(),1);currentTrip=null;view='calendar';render()}
function calendarHTML(){const year=month.getFullYear(),m=month.getMonth(),days=new Date(year,m+1,0).getDate(),offset=(new Date(year,m,1).getDay()+6)%7;let html='<div class="card-header"><h3>'+monthLabel()+'</h3><div class="calendar-nav"><button class="today-btn" type="button" data-today title="Jump to current month">Today</button><button class="icon-btn" data-month="-1" aria-label="Previous month">‹</button><button class="icon-btn" data-month="1" aria-label="Next month">›</button></div></div><div class="calendar-grid">';for(const d of ['M','T','W','T','F','S','S'])html+='<div class="dow">'+d+'</div>';for(let i=0;i<offset;i++)html+='<div class="date-cell empty"></div>';for(let i=1;i<=days;i++){const date=year+'-'+String(m+1).padStart(2,'0')+'-'+String(i).padStart(2,'0');const has=trips.some(t=>t.start<=date&&t.end>=date);const today=new Date();const isToday=today.getFullYear()===year&&today.getMonth()===m&&today.getDate()===i;html+='<button class="date-cell '+(has?'has-trip ':'')+(isToday?'is-today ':'')+'" data-date="'+date+'"'+(isToday?' aria-current="date" title="Today"':'')+'>'+i+(has?'<span class="dot"></span>':'')+'</button>'}return html+'</div>'}
function bindCal(){for(const b of document.querySelectorAll('[data-today]'))b.onclick=goToday;for(const b of document.querySelectorAll('[data-month]'))b.onclick=()=>changeMonth(Number(b.dataset.month));for(const b of document.querySelectorAll('[data-date]'))b.onclick=()=>{const date=b.dataset.date;const matching=trips.filter(t=>t.start<=date&&t.end>=date);if(matching.length){currentTrip=matching[0].id;currentLeg=null;render()}else toast('No trip on '+fmt(date)+' — create one to get started')}}
function tripItem(t){return `<button class="trip-item" data-trip="${t.id}"><span class="trip-icon">✈</span><span style="flex:1;text-align:left"><span class="trip-title">${escapeHTML(t.name)}</span><span class="trip-meta">${fmt(t.start)} – ${fmt(t.end)} · ${t.legs.length} journey steps</span></span><span class="badge ${t.status==='completed'?'complete':'planned'}">${t.status==='completed'?'Completed':'Planned'}</span></button>`}
function bindTrips(){document.querySelectorAll('[data-trip]').forEach(b=>b.onclick=()=>{currentTrip=b.dataset.trip;currentLeg=null;render()})}
function renderOverview(){setTitle('Good to see you, '+name.split(' ')[0],'YOUR TRAVEL WORKSPACE');const upcoming=trips.filter(t=>t.status!=='completed').sort((a,b)=>a.start.localeCompare(b.start));const t=upcoming[0];$('#content').innerHTML=`<div class="welcome"><div><h2>Your journeys at a glance</h2><p>One space for every connection, ticket and travel detail.</p></div></div><div class="grid-main"><div><div class="card"><div id="calendar-holder">${calendarHTML()}</div><div class="helper">● Dates shaded in green contain a saved trip. Select a date to open it.</div></div></div><div><div class="upcoming-hero"><div class="eyebrow">NEXT ADVENTURE</div><h3>${t?escapeHTML(t.name):'Your next journey awaits'}</h3><p>${t?`${fmt(t.start)} – ${fmt(t.end)} · ${t.legs.length} steps ready to organise`:'Start a trip and build your first travel timeline.'}</p><button class="btn" id="hero-open">${t?'Open journey →':'Create a trip →'}</button></div><div class="card"><div class="section-title"><h3>Your trips</h3><span class="muted small">${trips.length} total</span></div><div class="trip-list">${trips.length?trips.slice().sort((a,b)=>b.start.localeCompare(a.start)).map(tripItem).join(''):'<div class="empty-state">No trips yet</div>'}</div></div></div></div>`;bindCal();bindTrips();$('#hero-open').onclick=()=>{if(t){currentTrip=t.id;currentLeg=null;render()}else addTripModal()}}
function renderCalendarPage(){setTitle('Travel calendar','ALL TRIPS BY DATE');$('#content').innerHTML=`<div class="welcome"><div><h2>Plan around your journeys</h2><p>Pick a date to view the full itinerary.</p></div></div><div class="grid-main"><div class="card">${calendarHTML()}</div><div class="card"><div class="section-title"><h3>Saved trips</h3></div><div class="trip-list">${trips.map(tripItem).join('')||'<div class="empty-state">No trips yet</div>'}</div></div></div>`;bindCal();bindTrips()}
function selectedTrip(){return trips.find(t=>t.id===currentTrip)}
function getLeg(t){return t.legs.find(l=>l.id===currentLeg)||t.legs[0]}
const legEmoji={plane:'✈',bus:'▣',train:'▰',walk:'↟',taxi:'◆',other:'◉'};
// Existing steps retain their data. Legacy steps on the trip end date are shown as return travel.
function journeyOf(t,l){return l.journey==='return'||l.journey==='outbound'?l.journey:(t.end!==t.start&&l.date===t.end?'return':'outbound')}
function renderJourneySections(t,sorted,l){
  const stepHTML=x=>`<div class="leg"><div class="leg-time">${escapeHTML(x.time||'—')}<div class="muted small">${fmt(x.date).replace(/ 2026| 2027/g,'')}</div></div><div class="rail"></div><button class="leg-box ${l&&l.id===x.id?'on':''}" data-leg="${x.id}"><span style="text-align:left"><strong>${escapeHTML(x.title)}</strong>${x.travelStatus&&x.travelStatus!=='scheduled'?`<small class="status-text">${escapeHTML(x.travelStatus)}</small>`:''}<small>${escapeHTML(x.from)} → ${escapeHTML(x.to)}</small></span><span class="leg-icon">${legEmoji[x.type]||'◉'}</span></button></div>`;
  return ['outbound','return'].map(section=>{
    const items=sorted.filter(x=>journeyOf(t,x)===section);
    const isReturn=section==='return';
    const label=isReturn?'Return journey':'Outbound journey';
    const date=isReturn?t.end:t.start;
    const header='<div class="journey-section-header"><div><span class="journey-section-kicker">'+(isReturn?'HOMEWARD JOURNEY':'START OF YOUR TRIP')+'</span><h4>'+label+'</h4><span class="muted small">'+fmt(date)+' · '+items.length+' step'+(items.length===1?'':'s')+'</span></div><button class="btn ghost smallbtn" type="button" data-add-journey="'+section+'">＋ Add step</button></div>';
    const body=items.length?items.map(stepHTML).join(''):'<div class="journey-empty">No '+label.toLowerCase()+' steps yet. Use “Add step” to plan this part of your trip.</div>';
    return '<section class="journey-section journey-'+section+'">'+header+body+'</section>';
  }).join('');
}
function renderTrip(){const t=selectedTrip();if(!t){currentTrip=null;render();return}setTitle('Your journey','TRIP DETAILS');const sorted=t.legs.slice().sort((a,b)=>(a.date+' '+a.time).localeCompare(b.date+' '+b.time));if(!currentLeg&&sorted.length)currentLeg=sorted[0].id;const l=getLeg(t);const allTasks=t.legs.flatMap(x=>x.tasks);const checked=allTasks.filter(x=>x.done).length;const progress=allTasks.length?Math.round(100*checked/allTasks.length):0;$('#content').innerHTML=`<button class="back" id="back">← Back to overview</button><div class="detail-head"><div><h2 class="detail-title">${escapeHTML(t.name)}</h2><div class="detail-sub">${escapeHTML(t.destination)} · ${fmt(t.start)} – ${fmt(t.end)}</div></div><div class="actions-row"><button class="btn ghost smallbtn" id="edit-trip">✎ Edit trip & dates</button><button class="btn primary smallbtn" id="add-leg">＋ Journey step</button></div></div><div class="detail-layout"><div class="card"><div class="card-header"><h3>Journey timeline</h3><span class="muted small">${sorted.length} steps</span></div>${sorted.length?renderJourneySections(t,sorted,l):'<div class="empty-state"><div class="big">✈</div><strong>No journey steps</strong>Start with your journey from home, or add a flight.</div>'}<div class="actions-row"><button class="btn ghost smallbtn" id="add-leg-bottom">＋ Add another step</button></div></div><div><div class="card"><div class="card-header"><h3>Trip readiness</h3><span class="badge">${progress}%</span></div><p class="muted small">${checked} of ${allTasks.length} preparation tasks completed</p><div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div><div class="quick-note">✦ Save original tickets and checklists to each journey step, so they're right where you need them.</div></div><div class="card" style="margin-top:20px" id="leg-detail"></div></div></div>`;$('#back').onclick=()=>{currentTrip=null;view='overview';render()};$('#add-leg').onclick=()=>legModal(t);$('#add-leg-bottom').onclick=()=>legModal(t);document.querySelectorAll('[data-add-journey]').forEach(b=>b.onclick=()=>legModal(t,null,b.dataset.addJourney));$('#edit-trip').onclick=()=>addTripModal(t);document.querySelectorAll('[data-leg]').forEach(b=>b.onclick=()=>{currentLeg=b.dataset.leg;renderTrip()});renderLegPanel(t,l)}
let tab='docs';function renderLegPanel(t,l){const host=$('#leg-detail');if(!l){host.innerHTML='<div class="empty-state">Add a journey step to start saving tickets and tasks.</div>';return}host.innerHTML=`<div class="card-header"><div><div class="eyebrow">SELECTED STEP</div><h3 style="margin-top:8px">${escapeHTML(l.title)}</h3>${l.travelStatus&&l.travelStatus!=='scheduled'?`<span class="badge travel-${escapeHTML(l.travelStatus)}">${escapeHTML(l.travelStatus)}</span>`:''}</div><button class="btn ghost smallbtn" id="edit-leg">✎ Edit step</button></div><div class="tab-strip"><button class="tab ${tab==='docs'?'active':''}" data-tab="docs">Documents</button><button class="tab ${tab==='tasks'?'active':''}" data-tab="tasks">Checklist</button><button class="tab ${tab==='info'?'active':''}" data-tab="info">Details</button></div><div id="tab-content"></div>`;$('#edit-leg').onclick=()=>legModal(t,l);document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderLegPanel(t,l)});const target=$('#tab-content');if(tab==='docs'){target.innerHTML=`${l.documents.length?l.documents.map(d=>`<div class="doc-row"><span class="doc-icon">${d.type==='application/pdf'?'▤':'▧'}</span><div style="min-width:0;flex:1"><strong style="word-break:break-word">${escapeHTML(d.name)}</strong><small>${Math.ceil(d.size/1024)} KB · Private cloud</small></div><button class="btn ghost smallbtn" data-open-doc="${d.id}" title="Open document">Open</button><button class="btn ghost smallbtn" data-replace-doc="${d.id}" title="Replace document">Replace</button><button class="btn ghost smallbtn" data-rename-doc="${d.id}" title="Rename document">Edit</button><button class="btn ghost smallbtn danger" data-delete-doc="${d.id}" title="Remove document">Remove</button></div>`).join(''):'<div class="empty-state"><div class="big">▤</div><strong>No documents yet</strong>Attach an original boarding pass, screenshot or PDF.</div>'}<div class="actions-row"><button class="btn primary smallbtn" id="add-doc">＋ Add screenshot / PDF</button></div><p class="helper">Files are kept in private cloud storage. Some airlines require an official live boarding pass.</p>`;$('#add-doc').onclick=()=>{fileTarget={tripId:t.id,legId:l.id};$('#file-input').click()};target.querySelectorAll('[data-open-doc]').forEach(b=>b.onclick=()=>openFile(b.dataset.openDoc));target.querySelectorAll('[data-replace-doc]').forEach(b=>b.onclick=()=>{fileTarget={tripId:t.id,legId:l.id,replaceId:b.dataset.replaceDoc};$('#file-input').click()});target.querySelectorAll('[data-rename-doc]').forEach(b=>b.onclick=()=>{const doc=l.documents.find(d=>d.id===b.dataset.renameDoc);if(!doc)return;const updated=prompt('Document name:',doc.name);if(updated!==null&&updated.trim()){doc.name=updated.trim();save();renderLegPanel(t,l);toast('Document name updated')}});target.querySelectorAll('[data-delete-doc]').forEach(b=>b.onclick=async()=>{if(confirm('Remove this saved document permanently?')){await deleteFile(b.dataset.deleteDoc);l.documents=l.documents.filter(d=>d.id!==b.dataset.deleteDoc);save();renderLegPanel(t,l)}})}else if(tab==='tasks'){target.innerHTML=`${l.tasks.map(task=>`<div class="task-row"><input type="checkbox" id="task-${task.id}" data-task="${task.id}" ${task.done?'checked':''}><label for="task-${task.id}" style="${task.done?'text-decoration:line-through;color:#9ba8a9':''}">${escapeHTML(task.text)}</label><button class="icon-btn" data-remove-task="${task.id}">×</button></div>`).join('')||'<div class="empty-state">Nothing to check off yet.</div>'}<form id="task-form" class="actions-row"><input id="task-text" placeholder="Add a preparation task" required style="flex:1;min-width:150px"><button class="btn primary smallbtn">Add</button></form>`;target.querySelectorAll('[data-task]').forEach(b=>b.onchange=()=>{l.tasks.find(x=>x.id===b.dataset.task).done=b.checked;save();renderTrip()});target.querySelectorAll('[data-remove-task]').forEach(b=>b.onclick=()=>{l.tasks=l.tasks.filter(x=>x.id!==b.dataset.removeTask);save();renderTrip()});$('#task-form').onsubmit=e=>{e.preventDefault();const value=$('#task-text').value.trim();if(value){l.tasks.push({id:uid(),text:value,done:false});save();renderLegPanel(t,l)}}}else{target.innerHTML=`<div class="subheading">Travel details</div><p><strong>${escapeHTML(l.from)}</strong> → <strong>${escapeHTML(l.to)}</strong></p><p class="muted">${fmt(l.date)} · Departure ${escapeHTML(l.time||'Not set')} · Arrival ${escapeHTML(l.arrival||'Not set')}</p><div class="subheading">Notes</div><p style="white-space:pre-wrap;line-height:1.6">${escapeHTML(l.details||'No notes added.')}</p><button class="btn ghost smallbtn" id="edit-more">✎ Edit times & details</button>`;$('#edit-more').onclick=()=>legModal(t,l)}}
function addTripModal(existing){const t=existing||{};modal(existing?'Edit trip':'Create your next trip',`<form id="trip-form"><div class="input-wrap"><label>Trip name</label><input name="name" required maxlength="90" placeholder="e.g. London → Madrid → Valencia" value="${escapeHTML(t.name||'')}"></div><div class="input-wrap"><label>Destination</label><input name="destination" placeholder="e.g. Spain" value="${escapeHTML(t.destination||'')}"></div><div class="field-row"><div class="input-wrap"><label>Start date</label><input name="start" type="date" required value="${t.start||''}"></div><div class="input-wrap"><label>End date</label><input name="end" type="date" required value="${t.end||''}"></div></div><div class="input-wrap"><label>Trip status</label><select name="status"><option value="upcoming" ${t.status!=='completed'?'selected':''}>Planned / upcoming</option><option value="completed" ${t.status==='completed'?'selected':''}>Completed</option></select></div><div class="form-actions"><button type="button" class="btn ghost" id="cancel">Cancel</button><button class="btn primary">${existing?'Save changes':'Create trip'}</button></div></form>`);$('#cancel').onclick=closeModal;$('#trip-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);if(f.get('end')<f.get('start')){toast('End date must be after start date');return}if(existing){Object.assign(existing,Object.fromEntries(f))}else{const v={id:uid(),...Object.fromEntries(f),legs:[]};trips.push(v);currentTrip=v.id;currentLeg=null}save();closeModal();tab='docs';render();toast(existing?'Trip updated':'Trip created')}}
function legModal(t,existing,journey='outbound'){const l=existing||{};modal(existing?'Edit journey step':'Add journey step',`<form id="leg-form"><div class="input-wrap"><label>Journey section</label><select name="journey"><option value="outbound" ${(existing?journeyOf(t,l):journey)==='outbound'?'selected':''}>Outbound journey</option><option value="return" ${(existing?journeyOf(t,l):journey)==='return'?'selected':''}>Return journey</option></select></div><div class="input-wrap"><label>Transport type</label><select name="type">${['plane','bus','train','walk','taxi','other'].map(k=>`<option value="${k}" ${l.type===k?'selected':''}>${k==='other'?'Other':k[0].toUpperCase()+k.slice(1)}</option>`).join('')}</select></div><div class="input-wrap"><label>Step title</label><input name="title" required maxlength="100" placeholder="e.g. National Express to Stansted" value="${escapeHTML(l.title||'')}"></div><div class="field-row"><div class="input-wrap"><label>From</label><input name="from" placeholder="Departure location" value="${escapeHTML(l.from||'')}"></div><div class="input-wrap"><label>To</label><input name="to" placeholder="Arrival location" value="${escapeHTML(l.to||'')}"></div></div><div class="field-row"><div class="input-wrap"><label>Date</label><input name="date" type="date" required value="${l.date||(journey==='return'?t.end:t.start)}"></div><div class="input-wrap"><label>Departure time</label><input name="time" type="time" value="${l.time||''}"></div></div><div class="input-wrap"><label>Arrival time (as shown locally)</label><input name="arrival" type="time" value="${l.arrival||''}"></div><div class="input-wrap"><label>Journey status</label><select name="travelStatus">${[['scheduled','Scheduled'],['delayed','Delayed'],['rescheduled','Rescheduled'],['cancelled','Cancelled']].map(([val,label])=>`<option value="${val}" ${l.travelStatus===val?'selected':''}>${label}</option>`).join('')}</select></div><div class="input-wrap"><label>Notes / references</label><textarea name="details" rows="3" placeholder="Platform, luggage, instructions, booking reference...">${escapeHTML(l.details||'')}</textarea></div><p class="helper">Changing a departure date or time updates its position on the timeline. Other steps and trip dates are not moved automatically.</p><div class="form-actions"><button type="button" class="btn ghost" id="cancel">Cancel</button>${existing?'<button type="button" class="btn ghost" id="delete-leg" style="color:#bc574e">Delete</button>':''}<button class="btn primary">Save step</button></div></form>`);$('#cancel').onclick=closeModal;if(existing)$('#delete-leg').onclick=async()=>{if(confirm('Delete this journey step, including its stored documents?')){for(const doc of existing.documents){try{await deleteFile(doc.id)}catch(e){toast('Some stored files could not be deleted')}}t.legs=t.legs.filter(x=>x.id!==existing.id);currentLeg=null;save();closeModal();renderTrip()}};$('#leg-form').onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));if(existing)Object.assign(existing,v);else{const n={id:uid(),...v,tasks:[],documents:[]};t.legs.push(n);currentLeg=n.id}save();closeModal();tab='docs';renderTrip();toast('Journey step saved')}}
function renderWalletJourneys(t,steps){
  const stepHTML=({l,docs})=>`
        <div class="wallet-step-group">
          <div class="wallet-step-header">
            <div><strong>${escapeHTML(l.title)}</strong><div class="muted small">${escapeHTML(l.date?fmt(l.date):fmt(t.start))}${l.time?' · '+escapeHTML(l.time):''} · ${docs.length} file(s)</div></div>
            <button class="btn ghost smallbtn" data-wallet-trip="${t.id}" data-wallet-leg="${l.id}">View step</button>
          </div>
          <div class="wallet-grid">${docs.map(d=>`
            <div class="wallet-card">
              <div class="doc-icon">▤</div>
              <strong style="margin-top:13px;word-break:break-word">${escapeHTML(d.name)}</strong>
              <small>${escapeHTML(l.title)}</small>
              <div class="actions-row"><button class="btn ghost smallbtn" data-wallet-open="${d.id}">Open file ↗</button></div>
            </div>`).join('')}</div>
        </div>`;
  return ['outbound','return'].map(section=>{
    const sectionSteps=steps.filter(({l})=>journeyOf(t,l)===section).sort((a,b)=>(a.l.date+' '+(a.l.time||'')).localeCompare(b.l.date+' '+(b.l.time||'')));
    if(!sectionSteps.length)return '';
    const title=section==='return'?'Return journey':'Outbound journey';
    return '<div class="wallet-journey-header"><strong>'+title+'</strong><span>'+sectionSteps.length+' step'+(sectionSteps.length===1?'':'s')+'</span></div>'+sectionSteps.map(stepHTML).join('');
  }).join('');
}
function renderWallet(){
  setTitle('Document wallet','YOUR SAVED TRAVEL FILES');
  const groups=trips.map(t=>({
    t,
    steps:t.legs.map(l=>({l,docs:l.documents||[]})).filter(x=>x.docs.length)
  })).filter(g=>g.steps.length).sort((a,b)=>b.t.start.localeCompare(a.t.start));
  const total=groups.reduce((n,g)=>n+g.steps.reduce((a,s)=>a+s.docs.length,0),0);
  const sections=groups.map(({t,steps})=>`
    <section class="wallet-trip-group">
      <div class="wallet-trip-header">
        <div><div class="eyebrow">TRIP · ${escapeHTML(fmt(t.start))} – ${escapeHTML(fmt(t.end))}</div>
          <h3>${escapeHTML(t.name)}</h3>
          <p class="muted small">${escapeHTML(t.destination||'')} · ${steps.reduce((n,s)=>n+s.docs.length,0)} saved file(s)</p></div>
        <button class="btn ghost smallbtn" data-wallet-trip="${t.id}">View trip</button>
      </div>
      ${renderWalletJourneys(t,steps)}
    </section>`).join('');
  $('#content').innerHTML=`<div class="welcome"><div><h2>Travel documents by journey</h2><p>Find each ticket beneath its trip and the flight, train, or transfer it belongs to.</p></div></div><div class="card"><div class="section-title"><h3>Saved files</h3><span class="muted small">${total} documents</span></div>${groups.length?sections:'<div class="empty-state"><div class="big">▤</div><strong>Nothing saved yet</strong>Open a journey step to attach a screenshot, PDF or ticket.</div>'}<p class="helper">Private files sync with your signed-in account. Open files through short-lived secure links.</p></div>`;
  document.querySelectorAll('[data-wallet-open]').forEach(b=>b.onclick=()=>openFile(b.dataset.walletOpen));
  document.querySelectorAll('[data-wallet-trip]').forEach(b=>b.onclick=()=>{
    currentTrip=b.dataset.walletTrip;currentLeg=b.dataset.walletLeg||null;tab='docs';renderTrip()
  });
}
// Files live in a private Supabase Storage bucket. Every path begins with the current user's UUID.
const bucket='waymark-documents';
const docLocation=id=>{for(const t of trips)for(const l of t.legs)for(const d of l.documents){if(d.id===id)return d}return null};
async function deleteFile(id){const d=docLocation(id);if(!d?.path)return;const {error}=await client.storage.from(bucket).remove([d.path]);if(error)throw error}
async function openFile(id){
  try{const d=docLocation(id);if(!d?.path)throw Error('File not found');
    const {data,error}=await client.storage.from(bucket).createSignedUrl(d.path,90);
    if(error)throw error;window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }catch(e){toast('Unable to open private file: '+e.message)}
}
$('#file-input').onchange=async e=>{
  const target=fileTarget,file=e.target.files[0];e.target.value='';if(!file||!target||!cloudUser)return;
  const allowed=['application/pdf','image/png','image/jpeg','image/webp'];
  if(!allowed.includes(file.type)){toast('Use PDF, PNG, JPEG or WebP');return}
  if(file.size>15*1024*1024){toast('15 MB maximum');return}
  try{
    const t=trips.find(x=>x.id===target.tripId),l=t?.legs.find(x=>x.id===target.legId);if(!l)throw Error('Journey step not found');
    const old=target.replaceId?l.documents.find(d=>d.id===target.replaceId):null;if(target.replaceId&&!old)throw Error('Original document not found');
    const id=old?.id||uid(),path=`${cloudUser.id}/${id}/${crypto.randomUUID()}`;
    const {error}=await client.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;
    const previous=old?.path;
    if(old)Object.assign(old,{name:file.name,size:file.size,type:file.type,path});
    else l.documents.push({id,name:file.name,size:file.size,type:file.type,path});
    try{await save()}catch(e){if(old)old.path=previous;else l.documents=l.documents.filter(d=>d.id!==id);await client.storage.from(bucket).remove([path]);throw e}
    if(previous){const {error:removeError}=await client.storage.from(bucket).remove([previous]);if(removeError)console.warn('Old file cleanup failed',removeError)}
    renderTrip();toast(old?'Private document replaced':'Private document uploaded')
  }catch(err){console.error(err);toast('Upload failed: '+err.message)}
};
boot();