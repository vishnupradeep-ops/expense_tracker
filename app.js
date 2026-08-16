// ===== Firebase =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getStorage, ref as sref, uploadBytes, getDownloadURL, deleteObject }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBk2keMg0uk2qGROT5Tb6LmRainsov_y48",
  authDomain: "vishnu-s-expense-tracker.firebaseapp.com",
  projectId: "vishnu-s-expense-tracker",
  storageBucket: "vishnu-s-expense-tracker.firebasestorage.app",
  messagingSenderId: "573954185835",
  appId: "1:573954185835:web:ee254b2edd0bdd3ba12f2e"
};
const fbApp=initializeApp(firebaseConfig);
const auth=getAuth(fbApp);
const fdb=getFirestore(fbApp);
const storage=getStorage(fbApp);
const SHARED="shared";
const SHARED_COL=collection(fdb,"workspaces",SHARED,"expenses");
let txCol=SHARED_COL;

// ===== CONFIG =====
const CATS=[
  {k:'food',n:'Food & Dining',em:'🍽️',c:'#FF8A4A'},
  {k:'groceries',n:'Groceries',em:'🛒',c:'#C6FF4A'},
  {k:'travel',n:'Travel & Transport',em:'🚗',c:'#4AA8FF'},
  {k:'office_consumables',n:'Office Consumables',em:'📎',c:'#B48AFF'},
  {k:'elec_office',n:'Electronics – Office',em:'🖥️',c:'#FFD24A'},
  {k:'elec_personal',n:'Electronics – Personal',em:'📱',c:'#4AE3C0'},
  {k:'software',n:'Software & Subscriptions',em:'💻',c:'#7B8CFF'},
  {k:'flat_rent',n:'Flat Rent',em:'🏢',c:'#FF6FB5'},
  {k:'electricity',n:'Electricity',em:'💡',c:'#FFC24A'},
  {k:'internet',n:'Internet / Broadband',em:'🌐',c:'#4AC0FF'},
  {k:'mobile',n:'Mobile Recharge',em:'📶',c:'#8FE04A'},
  {k:'books',n:'Books',em:'📚',c:'#FF9F6F'},
  {k:'clothing',n:'Clothing',em:'👔',c:'#FF6FB5'},
  {k:'home_appliances',n:'Home Appliances',em:'🏠',c:'#4AE3C0'},
  {k:'health',n:'Health & Medical',em:'💊',c:'#FF5C7A'},
  {k:'entertainment',n:'Entertainment',em:'🎬',c:'#B48AFF'},
  {k:'gifts',n:'Gifts & Donations',em:'🎁',c:'#FF8AC6'},
  {k:'repairs',n:'Repairs & Maintenance',em:'🔧',c:'#9AA0B0'},
  {k:'travel_stay',n:'Travel Stay',em:'🏨',c:'#4AA8FF'},
  {k:'spa',n:'Spa',em:'💆',c:'#7BE0C0'},
  {k:'grooming',n:'Haircut / Grooming',em:'💈',c:'#FF7B7B'},
  {k:'other',n:'Other',em:'•••',c:'#8A8A98'},
];
// legacy key remap so old data still shows a name
const CAT_ALIAS={dress:'clothing'};
function catObj(k){k=CAT_ALIAS[k]||k;return catMap[k]||{k,n:k,em:'•••',c:'#8A8A98'};}
const catMap=Object.fromEntries(CATS.map(c=>[c.k,c]));
const SOURCES=[
  {k:'cash',n:'Cash',c:'#4AE3C0'},{k:'upi',n:'UPI',c:'#C6FF4A'},
  {k:'canara_debit',n:'Canara Debit',c:'#4AA8FF'},
  {k:'canara_mapl',n:'Canara MAPL',c:'#FFD24A'},
  {k:'canara_msllp',n:'Canara MSLLP',c:'#FF6FB5'},
];
const srcMap=Object.fromEntries(SOURCES.map(s=>[s.k,s]));
const MEALS={breakfast:'Breakfast',lunch:'Lunch',dinner:'Dinner'};
const MOBILE_FOR={me:'Me',parents:'Parents',family:'Family',other:'Other'};
const NET_FOR={flat:'Flat',kerala:'Kerala Home',office:'Office',other:'Other'};
const REIM_TYPE={company_expense:'Company Expense',ceo_expense:'CEO Expense'};

// ===== STATE =====
let state={period:'month',tab:'overview',editId:null,selCat:'food',
  meal:'lunch',people:1,mobileFor:'me',netFor:'flat',type:'personal',src:'upi',
  reimOn:false,reimType:'company_expense',
  pendingBill:null,billObjUrl:null,billIsRemote:false,removeBill:false,
  txCatFilter:'all',txSrcFilter:'all',txSearch:'',
  repRange:'month',repFrom:'',repTo:'',repCat:'all',repSrc:'all',repType:'all',
  reimFilter:'pending'};
let data=[]; let currentUser=null; let unsub=null;
const $=id=>document.getElementById(id);

// ===== helpers =====
function fmt(n){const x=Math.round(n);const s=Math.abs(x).toString();let out;if(s.length<=3)out=s;else{let l=s.slice(-3),r=s.slice(0,-3);r=r.replace(/\B(?=(\d{2})+(?!\d))/g,',');out=r+','+l;}return(x<0?'-':'')+out;}
function todayStr(){return new Date().toISOString().slice(0,10);}
function escapeHtml(s){return(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function niceDate(str){const d=new Date(str+'T00:00:00'),t=todayStr();const y=new Date();y.setDate(y.getDate()-1);
  if(str===t)return'Today';if(str===y.toISOString().slice(0,10))return'Yesterday';
  return d.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});}
function inPeriod(ds){const d=new Date(ds+'T00:00:00'),now=new Date();
  if(state.period==='day')return ds===todayStr();
  if(state.period==='week'){const day=now.getDay(),diff=(day===0?6:day-1);const m=new Date(now);m.setDate(now.getDate()-diff);m.setHours(0,0,0,0);return d>=m;}
  return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}
function rangeBounds(r,from,to){const now=new Date();let s,e;
  if(r==='month'){s=new Date(now.getFullYear(),now.getMonth(),1);e=new Date(now.getFullYear(),now.getMonth()+1,0);}
  else if(r==='last_month'){s=new Date(now.getFullYear(),now.getMonth()-1,1);e=new Date(now.getFullYear(),now.getMonth(),0);}
  else if(r==='year'){s=new Date(now.getFullYear(),0,1);e=new Date(now.getFullYear(),11,31);}
  else if(r==='all'){s=new Date(2000,0,1);e=new Date(2100,0,1);}
  else{s=from?new Date(from+'T00:00:00'):new Date(2000,0,1);e=to?new Date(to+'T00:00:00'):new Date(2100,0,1);}
  e.setHours(23,59,59);return {s,e};}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400);}
function setSync(m){const b=$('syncBadge'),t=$('syncText');b.className='sync-badge';
  if(m==='on'){b.classList.add('on');t.textContent='Synced';}
  else if(m==='syncing'){b.classList.add('syncing');t.textContent='Syncing';}
  else{t.textContent='Offline';}}

// ===== AUTH (sign-in only) =====
function renderAuthMode(){if(!$('authTitle'))return;$('authTitle').textContent='Welcome back';$('authSubtitle').textContent='Sign in to your expense tracker.';if($('authName'))$('authName').style.display='none';$('authBtn').textContent='Sign in';$('authErr').textContent='';}
$('authBtn').onclick=async()=>{
  const email=$('authEmail').value.trim().toLowerCase();const pass=$('authPass').value;const err=$('authErr');err.textContent='';
  if(!email||!pass){err.textContent='Enter email and password.';return;}
  $('authBtn').disabled=true;
  try{await signInWithEmailAndPassword(auth,email,pass);}
  catch(e){const m={'auth/invalid-email':'That email looks wrong.','auth/user-not-found':'No account with that email. Contact the admin.','auth/wrong-password':'Wrong password.','auth/invalid-credential':'Wrong email or password.'};err.textContent=m[e.code]||'Something went wrong. Try again.';}
  $('authBtn').disabled=false;
};
$('signOutBtn').onclick=async()=>{if(unsub){unsub();unsub=null;}await signOut(auth);};

onAuthStateChanged(auth,user=>{
  if($('boot'))$('boot').classList.add('hide');
  if(user){
    currentUser={uid:user.uid,name:user.displayName||user.email,email:user.email};
    txCol=SHARED_COL;
    $('authScreen').classList.add('hide');$('app').classList.remove('hide');
    if($('setUser'))$('setUser').textContent=currentUser.name+' · '+currentUser.email;
    startSync();buildCats();buildSrc();buildFilters();buildRepFilters();
  }else{
    currentUser=null;data=[];
    $('app').classList.add('hide');$('authScreen').classList.remove('hide');
    renderAuthMode();if($('authEmail'))$('authEmail').value='';if($('authPass'))$('authPass').value='';
  }
});

// ===== SYNC =====
function startSync(){
  if(!txCol)return;setSync('syncing');if(unsub)unsub();
  unsub=onSnapshot(txCol,snap=>{data=snap.docs.map(d=>({id:d.id,...d.data()}));setSync('on');renderAll();},
    err=>{setSync('off');toast('Sync error. Check Firestore rules.');console.error(err);});
}
async function saveExpense(rec){const{id,...body}=rec;await setDoc(doc(txCol,id),body,{merge:true});}
async function removeExpense(id){await deleteDoc(doc(txCol,id));}
async function uploadBill(id,blob){const r=sref(storage,`workspaces/${SHARED}/bills/${id}.jpg`);await uploadBytes(r,blob);return await getDownloadURL(r);}
async function deleteBillFile(id){try{await deleteObject(sref(storage,`workspaces/${SHARED}/bills/${id}.jpg`));}catch(e){}}

// ===== NAV =====
function switchTab(t){
  state.tab=t;
  document.querySelectorAll('#tabbar .tab').forEach(x=>x.classList.toggle('active',x.dataset.t===t));
  document.querySelectorAll('#sidenav .snav').forEach(x=>x.classList.toggle('active',x.dataset.t===t));
  ['overview','transactions','reports','reimburse','settings'].forEach(k=>{$('tab-'+k).classList.toggle('hide',k!==t);});
  window.scrollTo(0,0);
  if(t==='transactions')renderTxList();
  if(t==='reports')renderReports();
  if(t==='reimburse')renderReimburse();
  const fab=$('fab');if(fab)fab.style.display=(t==='reports'||t==='settings'||t==='reimburse')?'none':'flex';
}
document.querySelectorAll('#tabbar .tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.t));
document.querySelectorAll('#sidenav .snav').forEach(b=>{if(b.dataset.t)b.onclick=()=>switchTab(b.dataset.t);});
if($('fabDesktop'))$('fabDesktop').onclick=()=>openSheet();

// ===== OVERVIEW =====
function renderOverview(){
  const items=data.filter(t=>inPeriod(t.date)).sort((a,b)=>b.date.localeCompare(a.date)||(b.ts||0)-(a.ts||0));
  const total=items.reduce((s,t)=>s+t.amount,0);
  $('heroAmount').textContent=fmt(total);
  $('heroLabel').textContent={day:'Today',week:'This week',month:'This month'}[state.period];
  const count=items.length;
  let sub=count?(count+(count===1?' expense':' expenses')):'Nothing tracked yet';
  if(state.period==='month'&&count)sub+=' · ₹'+fmt(total/new Date().getDate())+'/day avg';
  $('heroSub').innerHTML=count?'<b>'+sub+'</b>':sub;
  $('persAmt').textContent='₹'+fmt(items.filter(t=>t.type==='personal').reduce((s,t)=>s+t.amount,0));
  $('compAmt').textContent='₹'+fmt(items.filter(t=>t.type==='company').reduce((s,t)=>s+t.amount,0));
  renderCatBars('ovCatBreakdown',items,true);
  renderSrcGrid('ovSrcGrid',items);
  renderFoodInsight('ovFoodTitle','ovFoodInsight',items);
}
function renderCatBars(elId,items,showEmpty){
  const el=$(elId);if(!items.length){el.innerHTML=showEmpty?'<div class="empty">No expenses in this period.<br>Tap + to add your first one.</div>':'';return;}
  const by={};items.forEach(t=>by[t.cat]=(by[t.cat]||0)+t.amount);
  const sorted=Object.entries(by).sort((a,b)=>b[1]-a[1]);const max=sorted[0][1];
  el.innerHTML=sorted.map(([k,v])=>{const c=catObj(k);const pct=(v/max*100).toFixed(0);
    return `<div class="bd-row"><span class="bd-dot" style="background:${c.c}"></span><span class="bd-name">${c.n}</span><span class="bd-bar-track"><span class="bd-bar-fill" style="width:${pct}%;background:${c.c}"></span></span><span class="bd-amt">₹${fmt(v)}</span></div>`;}).join('');
}
function renderSrcGrid(elId,items){
  const el=$(elId);if(!items.length){el.innerHTML='';return;}
  const bySrc={},cntSrc={};items.forEach(t=>{bySrc[t.src]=(bySrc[t.src]||0)+t.amount;cntSrc[t.src]=(cntSrc[t.src]||0)+1;});
  el.innerHTML=SOURCES.filter(s=>bySrc[s.k]).sort((a,b)=>bySrc[b.k]-bySrc[a.k]).map(s=>
    `<div class="src-card" style="border-left-color:${s.c}"><div class="nm">${s.n}</div><div class="am">₹${fmt(bySrc[s.k])}</div><div class="ct">${cntSrc[s.k]} txn</div></div>`).join('');
}
function renderFoodInsight(titleId,elId,items){
  const f=items.filter(t=>(CAT_ALIAS[t.cat]||t.cat)==='food');
  const ft=$(titleId),fi=$(elId);
  if(f.length){ft.style.display='block';const tot=f.reduce((s,t)=>s+t.amount,0);const ppl=f.reduce((s,t)=>s+(t.people||1),0);const ph=ppl?tot/ppl:0;
    fi.innerHTML=`<div class="food-card"><div class="food-stat"><div class="v">${f.length}</div><div class="l">MEALS</div></div><div class="food-stat"><div class="v">${ppl}</div><div class="l">PEOPLE FED</div></div><div class="food-stat"><div class="v">₹${fmt(ph)}</div><div class="l">PER HEAD</div></div></div>`;
  }else{ft.style.display='none';fi.innerHTML='';}
}

// ===== TRANSACTIONS =====
function buildFilters(){
  const cf=$('catFilter');
  cf.innerHTML='<button class="fchip sel" data-c="all">All</button>'+CATS.map(c=>`<button class="fchip" data-c="${c.k}">${c.em} ${c.n}</button>`).join('');
  cf.querySelectorAll('.fchip').forEach(el=>el.onclick=()=>{state.txCatFilter=el.dataset.c;cf.querySelectorAll('.fchip').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');renderTxList();});
  const sf=$('srcFilter');
  sf.innerHTML='<button class="fchip sel" data-s="all">All sources</button>'+SOURCES.map(s=>`<button class="fchip" data-s="${s.k}">${s.n}</button>`).join('');
  sf.querySelectorAll('.fchip').forEach(el=>el.onclick=()=>{state.txSrcFilter=el.dataset.s;sf.querySelectorAll('.fchip').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');renderTxList();});
  $('txSearch').oninput=e=>{state.txSearch=e.target.value.toLowerCase();renderTxList();};
}
function subLabel(t){
  const ck=CAT_ALIAS[t.cat]||t.cat;
  if(ck==='food'&&t.meal)return MEALS[t.meal]||'';
  if(ck==='mobile'&&t.forWhom)return MOBILE_FOR[t.forWhom]||'';
  if(ck==='internet'&&t.forWhom)return NET_FOR[t.forWhom]||'';
  return '';
}
function txName(t){const c=catObj(t.cat);const sl=subLabel(t);return sl?c.n.split(' ')[0]+' · '+sl:c.n;}
function renderTxList(){
  let items=data.slice().sort((a,b)=>b.date.localeCompare(a.date)||(b.ts||0)-(a.ts||0));
  if(state.txCatFilter!=='all')items=items.filter(t=>(CAT_ALIAS[t.cat]||t.cat)===state.txCatFilter);
  if(state.txSrcFilter!=='all')items=items.filter(t=>t.src===state.txSrcFilter);
  if(state.txSearch)items=items.filter(t=>(t.note||'').toLowerCase().includes(state.txSearch));
  const list=$('txListFull');
  if(!items.length){list.innerHTML='<div class="empty">No matching expenses.</div>';return;}
  list.innerHTML=buildTxHtml(items);
  list.querySelectorAll('.tx').forEach(el=>el.onclick=()=>openSheet(el.dataset.id));
}
function buildTxHtml(items){
  const groups={};items.forEach(t=>(groups[t.date]=groups[t.date]||[]).push(t));
  let html='';
  Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(date=>{
    const dt=groups[date].reduce((s,t)=>s+t.amount,0);
    html+=`<div class="day-head"><span>${niceDate(date)}</span><b>₹${fmt(dt)}</b></div>`;
    groups[date].forEach(t=>{
      const c=catObj(t.cat);const s=srcMap[t.src]||srcMap.cash;
      const tag=t.type==='company'?'<span class="chip-mini chip-co">Company</span>':'<span class="chip-mini chip-pe">Personal</span>';
      const rtag=t.reimburse?'<span class="chip-mini chip-rb">Claim</span>':'';
      let note=t.note?escapeHtml(t.note):'';
      const ck=CAT_ALIAS[t.cat]||t.cat;
      if(ck==='food'&&t.people)note=(note?note+' · ':'')+t.people+' pax';
      if(t.by)note=(note?note+' · ':'')+escapeHtml(t.by);
      const clip=t.billUrl?'<span class="tx-clip">📎</span>':'';
      html+=`<div class="tx" data-id="${t.id}"><div class="tx-icon" style="background:${c.c}22">${c.em}${clip}</div><div class="tx-mid"><div class="tx-cat">${txName(t)} ${tag}${rtag}</div>${note?`<div class="tx-note">${note}</div>`:''}</div><div class="tx-right"><div class="tx-amt">₹${fmt(t.amount)}</div><div class="tx-src">${s.n}</div></div></div>`;
    });
  });
  return html;
}

// ===== REPORTS + EXPORT =====
function buildRepFilters(){
  const cf=$('repCatFilter');
  cf.innerHTML='<button class="fchip sel" data-c="all">All</button>'+CATS.map(c=>`<button class="fchip" data-c="${c.k}">${c.em} ${c.n}</button>`).join('');
  cf.querySelectorAll('.fchip').forEach(el=>el.onclick=()=>{state.repCat=el.dataset.c;cf.querySelectorAll('.fchip').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');renderReports();});
  const sf=$('repSrcFilter');
  sf.innerHTML='<button class="fchip sel" data-s="all">All</button>'+SOURCES.map(s=>`<button class="fchip" data-s="${s.k}">${s.n}</button>`).join('');
  sf.querySelectorAll('.fchip').forEach(el=>el.onclick=()=>{state.repSrc=el.dataset.s;sf.querySelectorAll('.fchip').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');renderReports();});
  const tf=$('repTypeFilter');
  tf.innerHTML='<button class="fchip sel" data-y="all">All</button><button class="fchip" data-y="personal">Personal</button><button class="fchip" data-y="company">Company</button><button class="fchip" data-y="reimburse">Reimbursable</button>';
  tf.querySelectorAll('.fchip').forEach(el=>el.onclick=()=>{state.repType=el.dataset.y;tf.querySelectorAll('.fchip').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');renderReports();});
}
$('repRange').querySelectorAll('.fchip').forEach(el=>el.onclick=()=>{state.repRange=el.dataset.r;document.querySelectorAll('#repRange .fchip').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');$('customRange').classList.toggle('hide',state.repRange!=='custom');renderReports();});
$('repFrom').onchange=e=>{state.repFrom=e.target.value;renderReports();};
$('repTo').onchange=e=>{state.repTo=e.target.value;renderReports();};
function reportItems(){
  const{s,e}=rangeBounds(state.repRange,state.repFrom,state.repTo);
  let items=data.filter(t=>{const d=new Date(t.date+'T00:00:00');return d>=s&&d<=e;});
  if(state.repCat!=='all')items=items.filter(t=>(CAT_ALIAS[t.cat]||t.cat)===state.repCat);
  if(state.repSrc!=='all')items=items.filter(t=>t.src===state.repSrc);
  if(state.repType==='personal')items=items.filter(t=>t.type==='personal');
  else if(state.repType==='company')items=items.filter(t=>t.type==='company');
  else if(state.repType==='reimburse')items=items.filter(t=>t.reimburse);
  return items.sort((a,b)=>b.date.localeCompare(a.date)||(b.ts||0)-(a.ts||0));
}
function rangeLabel(r){return{month:'This month',last_month:'Last month',year:'This year',all:'All time',custom:'Custom range'}[r]||'';}
function renderReports(){
  const items=reportItems();const total=items.reduce((s,t)=>s+t.amount,0);
  $('repTotal').textContent='₹'+fmt(total);
  $('repMeta').textContent=items.length+' expenses · '+rangeLabel(state.repRange);
  renderCatBars('repCat',items,false);renderSrcGrid('repSrc',items);renderFoodInsight('repFoodTitle','repFood',items);
}

// export
function downloadFile(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csvEsc(v){v=(v==null?'':String(v));if(/[",\n]/.test(v))return '"'+v.replace(/"/g,'""')+'"';return v;}
function fullCatName(t){const c=catObj(t.cat);const sl=subLabel(t);return sl?c.n+' - '+sl:c.n;}
$('dlCsv').onclick=()=>{
  const items=reportItems();if(!items.length)return toast('Nothing in this view');
  const hdr=['Date','Category','Amount','Payment Source','Type','Reimbursable','Claim Type','Claim Status','People','Added By','Note'];
  const rows=items.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(t=>[t.date,fullCatName(t),t.amount,(srcMap[t.src]||{n:t.src}).n,t.type==='company'?'Company':'Personal',t.reimburse?'Yes':'',t.reimburse?(REIM_TYPE[t.reimType]||''):'',t.reimburse?(t.reimDone?'Reimbursed':'Pending'):'',((CAT_ALIAS[t.cat]||t.cat)==='food'?(t.people||''):''),t.by||'',t.note||''].map(csvEsc).join(','));
  downloadFile('spend_report_'+state.repRange+'.csv',hdr.join(',')+'\n'+rows.join('\n'),'text/csv');toast('CSV downloaded');
};
$('dlPdf').onclick=()=>{
  const items=reportItems();if(!items.length)return toast('Nothing in this view');
  const{jsPDF}=window.jspdf;const doc=new jsPDF();const total=items.reduce((s,t)=>s+t.amount,0);
  doc.setFillColor(11,11,15);doc.rect(0,0,210,297,'F');
  doc.setTextColor(198,255,74);doc.setFont('helvetica','bold');doc.setFontSize(22);doc.text('Spend Report',14,22);
  doc.setTextColor(242,242,245);doc.setFontSize(13);doc.text('Transactions · '+rangeLabel(state.repRange),14,32);
  doc.setTextColor(138,138,152);doc.setFontSize(9);
  let flt=[];if(state.repCat!=='all')flt.push(catObj(state.repCat).n);if(state.repSrc!=='all')flt.push((srcMap[state.repSrc]||{n:''}).n);if(state.repType!=='all')flt.push(state.repType);
  doc.text('Generated '+new Date().toLocaleDateString('en-IN')+(flt.length?'  ·  Filters: '+flt.join(', '):''),14,39);
  doc.setDrawColor(42,42,54);doc.line(14,43,196,43);
  let y=52;doc.setFontSize(10);doc.setFont('helvetica','bold');doc.setTextColor(138,138,152);
  const colX=[14,44,120,196];['Date','Category','Source','Amount'].forEach((h,i)=>doc.text(h,colX[i],y,{align:i===0?'left':i===3?'right':'left'}));
  y+=6;doc.line(14,y-3,196,y-3);doc.setFont('helvetica','normal');doc.setTextColor(242,242,245);
  items.slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{
    if(y>280){doc.addPage();doc.setFillColor(11,11,15);doc.rect(0,0,210,297,'F');y=20;doc.setTextColor(242,242,245);}
    doc.text(t.date,colX[0],y);doc.text(fullCatName(t).slice(0,34),colX[1],y);doc.text((srcMap[t.src]||{n:t.src}).n,colX[2],y);doc.text('Rs '+fmt(t.amount),colX[3],y,{align:'right'});y+=6.5;
  });
  doc.setFont('helvetica','bold');doc.setTextColor(198,255,74);doc.text('Total: Rs '+fmt(total),196,y+4,{align:'right'});
  doc.save('spend_report_'+state.repRange+'.pdf');toast('PDF downloaded');
};

// ===== REIMBURSEMENTS =====
$('reimFilter').querySelectorAll('.fchip').forEach(el=>el.onclick=()=>{state.reimFilter=el.dataset.f;document.querySelectorAll('#reimFilter .fchip').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');renderReimburse();});
function renderReimburse(){
  const claims=data.filter(t=>t.reimburse);
  const pending=claims.filter(t=>!t.reimDone);
  const done=claims.filter(t=>t.reimDone);
  $('reimPending').textContent='₹'+fmt(pending.reduce((s,t)=>s+t.amount,0));
  $('reimDone').textContent='₹'+fmt(done.reduce((s,t)=>s+t.amount,0));
  $('reimCompany').textContent='₹'+fmt(claims.filter(t=>t.reimType==='company_expense'&&!t.reimDone).reduce((s,t)=>s+t.amount,0));
  $('reimCeo').textContent='₹'+fmt(claims.filter(t=>t.reimType==='ceo_expense'&&!t.reimDone).reduce((s,t)=>s+t.amount,0));
  let list=state.reimFilter==='pending'?pending:state.reimFilter==='done'?done:claims;
  list=list.slice().sort((a,b)=>b.date.localeCompare(a.date)||(b.ts||0)-(a.ts||0));
  const el=$('reimList');
  if(!list.length){el.innerHTML='<div class="empty">No '+(state.reimFilter==='all'?'':state.reimFilter+' ')+'claims.<br>Flag an expense as reimbursement to see it here.</div>';return;}
  el.innerHTML=list.map(t=>{
    const c=catObj(t.cat);
    return `<div class="reim-item">
      <div class="tx-icon" style="background:${c.c}22">${c.em}</div>
      <div class="reim-mid"><div class="reim-title">${txName(t)}</div>
        <div class="reim-meta">${REIM_TYPE[t.reimType]||''} · ${niceDate(t.date)}${t.note?' · '+escapeHtml(t.note):''}</div>
        <span class="reim-status ${t.reimDone?'done':'pending'}">${t.reimDone?'Reimbursed':'Pending'}</span></div>
      <div><div class="reim-amt">₹${fmt(t.amount)}</div>
      <button class="reim-toggle-btn" data-id="${t.id}">${t.reimDone?'Mark pending':'Mark paid'}</button></div>
    </div>`;
  }).join('');
  el.querySelectorAll('.reim-toggle-btn').forEach(b=>b.onclick=async(ev)=>{ev.stopPropagation();const t=data.find(x=>x.id===b.dataset.id);if(!t)return;await setDoc(doc(txCol,t.id),{reimDone:!t.reimDone},{merge:true});toast(!t.reimDone?'Marked reimbursed':'Marked pending');});
}

// ===== SHEET =====
function buildCats(){
  const g=$('catGrid');
  g.innerHTML=CATS.map(c=>`<button class="cat-chip" data-k="${c.k}"><span class="em">${c.em}</span><span class="lb">${c.n}</span></button>`).join('');
  g.querySelectorAll('.cat-chip').forEach(el=>el.onclick=()=>{state.selCat=el.dataset.k;markCat();toggleSubs();});
}
function buildSrc(){
  const g=$('srcSelect');
  g.innerHTML=SOURCES.map(s=>`<button class="pill" data-s="${s.k}">${s.n}</button>`).join('');
  g.querySelectorAll('.pill').forEach(el=>el.onclick=()=>{state.src=el.dataset.s;markSrc();});
}
function markCat(){document.querySelectorAll('.cat-chip').forEach(el=>el.classList.toggle('sel',el.dataset.k===state.selCat));}
function markSrc(){document.querySelectorAll('#srcSelect .pill').forEach(el=>el.classList.toggle('sel',el.dataset.s===state.src));}
function markMeal(){document.querySelectorAll('#mealRow .pill').forEach(el=>el.classList.toggle('sel',el.dataset.m===state.meal));}
function markMobile(){document.querySelectorAll('#mobileRow .pill').forEach(el=>el.classList.toggle('sel',el.dataset.w===state.mobileFor));}
function markNet(){document.querySelectorAll('#netRow .pill').forEach(el=>el.classList.toggle('sel',el.dataset.w===state.netFor));}
function markType(){document.querySelectorAll('#typeRow .pill').forEach(el=>{const on=el.dataset.t===state.type;el.classList.toggle('sel',on);el.classList.toggle('blue',on&&state.type==='company');});}
function markReimType(){document.querySelectorAll('#reimTypeRow .pill').forEach(el=>{const on=el.dataset.rt===state.reimType;el.classList.toggle('sel',on);el.classList.toggle('amber',on);});}
function toggleSubs(){
  const ck=state.selCat;
  $('foodExtra').style.display=ck==='food'?'block':'none';
  $('mobileExtra').style.display=ck==='mobile'?'block':'none';
  $('netExtra').style.display=ck==='internet'?'block':'none';
}
document.querySelectorAll('#mealRow .pill').forEach(el=>el.onclick=()=>{state.meal=el.dataset.m;markMeal();});
document.querySelectorAll('#mobileRow .pill').forEach(el=>el.onclick=()=>{state.mobileFor=el.dataset.w;markMobile();});
document.querySelectorAll('#netRow .pill').forEach(el=>el.onclick=()=>{state.netFor=el.dataset.w;markNet();});
document.querySelectorAll('#typeRow .pill').forEach(el=>el.onclick=()=>{state.type=el.dataset.t;markType();});
document.querySelectorAll('#reimTypeRow .pill').forEach(el=>el.onclick=()=>{state.reimType=el.dataset.rt;markReimType();});
$('peopleMinus').onclick=()=>{state.people=Math.max(1,state.people-1);$('peopleVal').textContent=state.people;};
$('peoplePlus').onclick=()=>{state.people++;$('peopleVal').textContent=state.people;};
$('reimSwitch').onclick=()=>{state.reimOn=!state.reimOn;$('reimSwitch').classList.toggle('on',state.reimOn);$('reimDetail').style.display=state.reimOn?'block':'none';};

// bill
function compress(file){return new Promise((res)=>{const img=new Image();const url=URL.createObjectURL(file);
  img.onload=()=>{const max=1600;let{width:w,height:h}=img;if(w>h&&w>max){h=h*max/w;w=max;}else if(h>max){w=w*max/h;h=max;}
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
    c.toBlob(b=>{URL.revokeObjectURL(url);res(b);},'image/jpeg',0.72);};img.src=url;});}
const camInput=$('camInput'),galInput=$('galInput');
function renderBillArea(){
  const area=$('billArea');
  if(state.billObjUrl){area.innerHTML=`<div class="bill-preview"><img src="${state.billObjUrl}" id="billThumb"><div class="bill-actions"><button class="bill-act" id="billCam">📷</button><button class="bill-act" id="billGal">🖼️</button><button class="bill-act" id="billRemove">🗑️</button></div></div>`;
    $('billThumb').onclick=()=>openViewer(state.billObjUrl);$('billCam').onclick=()=>camInput.click();$('billGal').onclick=()=>galInput.click();
    $('billRemove').onclick=()=>{clearPendingBill();state.removeBill=true;state.billIsRemote=false;renderBillArea();};
  }else{area.innerHTML=`<div class="bill-choice"><button class="bill-btn" id="billCam">📷 Camera</button><button class="bill-btn" id="billGal">🖼️ Gallery</button></div>`;
    $('billCam').onclick=()=>camInput.click();$('billGal').onclick=()=>galInput.click();}
}
function clearPendingBill(){if(state.billObjUrl&&!state.billIsRemote){URL.revokeObjectURL(state.billObjUrl);}state.billObjUrl=null;state.pendingBill=null;}
async function handleBillFile(e){const file=e.target.files[0];if(!file)return;$('billArea').innerHTML='<div class="bill-processing">Processing photo…</div>';const blob=await compress(file);clearPendingBill();state.pendingBill=blob;state.removeBill=false;state.billIsRemote=false;state.billObjUrl=URL.createObjectURL(blob);renderBillArea();e.target.value='';}
camInput.onchange=handleBillFile;galInput.onchange=handleBillFile;
const viewer=$('viewer');
function openViewer(url){$('viewerImg').src=url;viewer.classList.add('open');}
$('viewerClose').onclick=()=>viewer.classList.remove('open');
viewer.onclick=e=>{if(e.target===viewer)viewer.classList.remove('open');};

const sheet=$('sheet'),overlay=$('overlay');
function openSheet(id){
  state.editId=id||null;state.removeBill=false;clearPendingBill();state.billIsRemote=false;
  const del=$('delBtn');
  if(id){const t=data.find(x=>x.id===id);
    $('sheetTitle').textContent='Edit expense';
    $('amtInput').value=t.amount;$('noteInput').value=t.note||'';$('dateInput').value=t.date;
    state.selCat=CAT_ALIAS[t.cat]||t.cat;state.src=t.src;state.type=t.type||'personal';
    state.meal=t.meal||'lunch';state.people=t.people||1;
    state.mobileFor=(state.selCat==='mobile'&&t.forWhom)?t.forWhom:'me';
    state.netFor=(state.selCat==='internet'&&t.forWhom)?t.forWhom:'flat';
    state.reimOn=!!t.reimburse;state.reimType=t.reimType||'company_expense';
    del.style.display='block';
    if(t.billUrl){state.billObjUrl=t.billUrl;state.billIsRemote=true;}
  }else{
    $('sheetTitle').textContent='Add expense';
    $('amtInput').value='';$('noteInput').value='';$('dateInput').value=todayStr();
    state.selCat='food';state.src='upi';state.type='personal';state.meal='lunch';state.people=1;
    state.mobileFor='me';state.netFor='flat';state.reimOn=false;state.reimType='company_expense';
    del.style.display='none';
  }
  $('peopleVal').textContent=state.people;
  $('reimSwitch').classList.toggle('on',state.reimOn);$('reimDetail').style.display=state.reimOn?'block':'none';
  markCat();markSrc();markMeal();markMobile();markNet();markType();markReimType();toggleSubs();renderBillArea();
  overlay.classList.add('open');sheet.classList.add('open');
  setTimeout(()=>$('amtInput').focus(),300);
}
function closeSheet(){overlay.classList.remove('open');sheet.classList.remove('open');clearPendingBill();if(document.activeElement)document.activeElement.blur();}
if($('fab'))$('fab').onclick=()=>openSheet();
overlay.onclick=closeSheet;

$('saveBtn').onclick=async()=>{
  const amt=parseFloat($('amtInput').value);if(!amt||amt<=0){$('amtInput').focus();return;}
  const btn=$('saveBtn');btn.disabled=true;btn.textContent='Saving…';
  const note=$('noteInput').value.trim();const date=$('dateInput').value||todayStr();
  const isNew=!state.editId;const existing=isNew?null:data.find(x=>x.id===state.editId);
  const id=isNew?('e'+Date.now()+Math.random().toString(36).slice(2,6)):state.editId;
  const rec={id,amount:amt,note,date,cat:state.selCat,src:state.src,type:state.type,
    ts:existing?existing.ts:Date.now(),by:existing?existing.by:(currentUser?currentUser.name:'')};
  // sub fields
  if(state.selCat==='food'){rec.meal=state.meal;rec.people=state.people;}
  if(state.selCat==='mobile')rec.forWhom=state.mobileFor;
  if(state.selCat==='internet')rec.forWhom=state.netFor;
  // reimbursement
  if(state.reimOn){rec.reimburse=true;rec.reimType=state.reimType;rec.reimDone=existing?(existing.reimDone||false):false;}
  else{rec.reimburse=false;rec.reimType='';rec.reimDone=false;}
  rec.billUrl=existing?existing.billUrl||'':'';
  try{
    if(state.pendingBill){try{rec.billUrl=await uploadBill(id,state.pendingBill);}catch(err){toast('Saved, photo upload failed.');}}
    else if(state.removeBill){await deleteBillFile(id);rec.billUrl='';}
    await saveExpense(rec);closeSheet();
  }catch(e){toast('Save failed. Check connection.');console.error(e);}
  btn.disabled=false;btn.textContent='Save';
};
$('delBtn').onclick=async()=>{if(!state.editId)return;const btn=$('delBtn');btn.disabled=true;btn.textContent='Deleting…';try{await deleteBillFile(state.editId);await removeExpense(state.editId);closeSheet();}catch(e){toast('Delete failed.');}btn.disabled=false;btn.textContent='Delete expense';};

$('periodSwitch').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.period=b.dataset.p;document.querySelectorAll('#periodSwitch button').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderOverview();});

function renderAll(){renderOverview();if(state.tab==='transactions')renderTxList();if(state.tab==='reports')renderReports();if(state.tab==='reimburse')renderReimburse();}

renderAuthMode();
