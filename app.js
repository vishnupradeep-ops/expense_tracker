// ===== Firebase SDK (v11 modular, from CDN) =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
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

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const fdb = getFirestore(fbApp);
const storage = getStorage(fbApp);

// Per-user private data: each signed-in user reads and writes only their own expenses.
// txColFor(uid) returns that user's private expense collection.
function txColFor(uid){ return collection(fdb, "users", uid, "expenses"); }
let txCol = null; // set once the user is known

// ===== CONFIG =====
const CATS=[
  {k:'food',n:'Food',em:'🍽️',c:'#FF8A4A'},
  {k:'groceries',n:'Groceries',em:'🛒',c:'#C6FF4A'},
  {k:'office_consumables',n:'Office Consumables',em:'📎',c:'#B48AFF'},
  {k:'dress',n:'Dress Shopping',em:'👔',c:'#FF6FB5'},
  {k:'elec_personal',n:'Electronics Personal',em:'📱',c:'#4AA8FF'},
  {k:'home_appliances',n:'Home Appliances',em:'🏠',c:'#4AE3C0'},
  {k:'elec_office',n:'Electronics Office',em:'🖥️',c:'#FFD24A'},
];
const catMap=Object.fromEntries(CATS.map(c=>[c.k,c]));
const SOURCES=[
  {k:'cash',n:'Cash',c:'#4AE3C0'},{k:'upi',n:'UPI',c:'#C6FF4A'},
  {k:'canara_debit',n:'Canara Debit',c:'#4AA8FF'},
  {k:'canara_mapl',n:'Canara MAPL',c:'#FFD24A'},
  {k:'canara_msllp',n:'Canara MSLLP',c:'#FF6FB5'},
];
const srcMap=Object.fromEntries(SOURCES.map(s=>[s.k,s]));
const MEALS={breakfast:'Breakfast',lunch:'Lunch',dinner:'Dinner'};

// ===== STATE =====
let state={period:'month',tab:'overview',editId:null,selCat:'food',meal:'lunch',people:1,type:'personal',src:'upi',
  pendingBill:null,billObjUrl:null,billIsRemote:false,removeBill:false,
  txCatFilter:'all',txSrcFilter:'all',txSearch:'',repRange:'month',repFrom:'',repTo:'',expRange:'month'};
let data=[]; let currentUser=null; let unsub=null; let photoSyncOK=true;

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
  return {s,e};}
function itemsInRange(r,from,to){const{s,e}=rangeBounds(r,from,to);return data.filter(t=>{const d=new Date(t.date+'T00:00:00');return d>=s&&d<=e;}).sort((a,b)=>b.date.localeCompare(a.date)||b.ts-a.ts);}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400);}
function setSync(mode){const b=$('syncBadge'),t=$('syncText');b.className='sync-badge';
  if(mode==='on'){b.classList.add('on');t.textContent='Synced';}
  else if(mode==='syncing'){b.classList.add('syncing');t.textContent='Syncing';}
  else{t.textContent='Offline';}}

// ===== AUTH ===== (sign-in only; accounts are created by admin in Firebase)
let authMode='signin';
function renderAuthMode(){
  if(!$('authTitle'))return;
  $('authTitle').textContent='Welcome back';
  $('authSubtitle').textContent='Sign in to your expense tracker.';
  if($('authName'))$('authName').style.display='none';
  $('authBtn').textContent='Sign in';
  $('authErr').textContent='';
}
// signup toggle intentionally disabled
$('authBtn').onclick=async()=>{
  const email=$('authEmail').value.trim().toLowerCase();
  const pass=$('authPass').value;
  const err=$('authErr');err.textContent='';
  if(!email||!pass){err.textContent='Enter email and password.';return;}
  $('authBtn').disabled=true;
  try{
    await signInWithEmailAndPassword(auth,email,pass);
  }catch(e){
    const m={'auth/invalid-email':'That email looks wrong.','auth/user-not-found':'No account with that email. Contact the admin.',
      'auth/wrong-password':'Wrong password.','auth/invalid-credential':'Wrong email or password.'};
    err.textContent=m[e.code]||'Something went wrong. Try again.';
  }
  $('authBtn').disabled=false;
};
$('signOutBtn').onclick=async()=>{if(unsub){unsub();unsub=null;}await signOut(auth);};

onAuthStateChanged(auth,user=>{
  if($('boot'))$('boot').classList.add('hide');
  if(user){
    currentUser={uid:user.uid,name:user.displayName||user.email,email:user.email};
    txCol=txColFor(user.uid); // this user's private collection
    $('authScreen').classList.add('hide');
    $('app').classList.remove('hide');
    if($('setUser'))$('setUser').textContent=currentUser.name+' · '+currentUser.email;
    startSync();
    buildCats();buildSrc();buildFilters();
  }else{
    currentUser=null;data=[];txCol=null;
    $('app').classList.add('hide');
    $('authScreen').classList.remove('hide');
    renderAuthMode();
    if($('authEmail'))$('authEmail').value='';
    if($('authPass'))$('authPass').value='';
  }
});

// ===== FIRESTORE realtime sync =====
function startSync(){
  if(!txCol)return;
  setSync('syncing');
  if(unsub)unsub();
  unsub=onSnapshot(txCol,snap=>{
    data=snap.docs.map(d=>({id:d.id,...d.data()}));
    setSync('on');
    renderAll();
  },err=>{
    setSync('off');
    toast('Sync error. Check Firestore is enabled.');
    console.error(err);
  });
}
async function saveExpense(rec){
  const{id,...body}=rec;
  await setDoc(doc(txCol,id),body,{merge:true});
}
async function removeExpense(id){await deleteDoc(doc(txCol,id));}

// ===== photos (Firebase Storage) =====
async function uploadBill(id,blob){
  const uid=currentUser?currentUser.uid:'anon';
  const r=sref(storage,`users/${uid}/bills/${id}.jpg`);
  await uploadBytes(r,blob);
  return await getDownloadURL(r);
}
async function deleteBill(id){
  const uid=currentUser?currentUser.uid:'anon';
  try{await deleteObject(sref(storage,`users/${uid}/bills/${id}.jpg`));}catch(e){}
}

// ===== TAB NAV =====
$('tabbar').querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
  state.tab=b.dataset.t;
  document.querySelectorAll('#tabbar .tab').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  ['overview','transactions','reports','export','settings'].forEach(t=>{
    $('tab-'+t).classList.toggle('hide',t!==state.tab);
  });
  window.scrollTo(0,0);
  if(state.tab==='transactions')renderTxList();
  if(state.tab==='reports')renderReports();
  $('fab').style.display=(state.tab==='export'||state.tab==='settings')?'none':'flex';
});

// ===== RENDER OVERVIEW =====
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
  const el=$(elId);
  if(!items.length){el.innerHTML=showEmpty?'<div class="empty">No expenses in this period.<br>Tap + to add your first one.</div>':'';return;}
  const by={};items.forEach(t=>by[t.cat]=(by[t.cat]||0)+t.amount);
  const sorted=Object.entries(by).sort((a,b)=>b[1]-a[1]);const max=sorted[0][1];
  el.innerHTML=sorted.map(([k,v])=>{const c=catMap[k]||catMap.food;const pct=(v/max*100).toFixed(0);
    return `<div class="bd-row"><span class="bd-dot" style="background:${c.c}"></span><span class="bd-name">${c.n}</span><span class="bd-bar-track"><span class="bd-bar-fill" style="width:${pct}%;background:${c.c}"></span></span><span class="bd-amt">₹${fmt(v)}</span></div>`;}).join('');
}
function renderSrcGrid(elId,items){
  const el=$(elId);if(!items.length){el.innerHTML='';return;}
  const bySrc={},cntSrc={};items.forEach(t=>{bySrc[t.src]=(bySrc[t.src]||0)+t.amount;cntSrc[t.src]=(cntSrc[t.src]||0)+1;});
  el.innerHTML=SOURCES.filter(s=>bySrc[s.k]).sort((a,b)=>bySrc[b.k]-bySrc[a.k]).map(s=>
    `<div class="src-card" style="border-left-color:${s.c}"><div class="nm">${s.n}</div><div class="am">₹${fmt(bySrc[s.k])}</div><div class="ct">${cntSrc[s.k]} txn</div></div>`).join('');
}
function renderFoodInsight(titleId,elId,items){
  const foodItems=items.filter(t=>t.cat==='food');
  const ft=$(titleId),fi=$(elId);
  if(foodItems.length){ft.style.display='block';
    const ftotal=foodItems.reduce((s,t)=>s+t.amount,0);
    const people=foodItems.reduce((s,t)=>s+(t.people||1),0);
    const perHead=people?ftotal/people:0;
    fi.innerHTML=`<div class="food-card">
      <div class="food-stat"><div class="v">${foodItems.length}</div><div class="l">MEALS</div></div>
      <div class="food-stat"><div class="v">${people}</div><div class="l">PEOPLE FED</div></div>
      <div class="food-stat"><div class="v">₹${fmt(perHead)}</div><div class="l">PER HEAD</div></div></div>`;
  }else{ft.style.display='none';fi.innerHTML='';}
}

// ===== TRANSACTIONS =====
function buildFilters(){
  const cf=$('catFilter');
  cf.innerHTML='<button class="fchip sel" data-c="all">All categories</button>'+CATS.map(c=>`<button class="fchip" data-c="${c.k}">${c.em} ${c.n}</button>`).join('');
  cf.querySelectorAll('.fchip').forEach(el=>el.onclick=()=>{state.txCatFilter=el.dataset.c;cf.querySelectorAll('.fchip').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');renderTxList();});
  const sf=$('srcFilter');
  sf.innerHTML='<button class="fchip sel" data-s="all">All sources</button>'+SOURCES.map(s=>`<button class="fchip" data-s="${s.k}">${s.n}</button>`).join('');
  sf.querySelectorAll('.fchip').forEach(el=>el.onclick=()=>{state.txSrcFilter=el.dataset.s;sf.querySelectorAll('.fchip').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');renderTxList();});
  $('txSearch').oninput=e=>{state.txSearch=e.target.value.toLowerCase();renderTxList();};
}
function renderTxList(){
  let items=data.slice().sort((a,b)=>b.date.localeCompare(a.date)||(b.ts||0)-(a.ts||0));
  if(state.txCatFilter!=='all')items=items.filter(t=>t.cat===state.txCatFilter);
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
      const c=catMap[t.cat]||catMap.food;const s=srcMap[t.src]||srcMap.cash;
      let name=c.n;if(t.cat==='food'&&t.meal)name=MEALS[t.meal]||'Food';
      const tag=t.type==='company'?'<span class="chip-mini chip-co">Company</span>':'<span class="chip-mini chip-pe">Personal</span>';
      let note=t.note?escapeHtml(t.note):'';
      if(t.cat==='food'&&t.people)note=(note?note+' · ':'')+t.people+' pax';
      if(t.by)note=(note?note+' · ':'')+escapeHtml(t.by);
      const clip=t.billUrl?'<span class="tx-clip">📎</span>':'';
      html+=`<div class="tx" data-id="${t.id}">
        <div class="tx-icon" style="background:${c.c}22">${c.em}${clip}</div>
        <div class="tx-mid"><div class="tx-cat">${name} ${tag}</div>${note?`<div class="tx-note">${note}</div>`:''}</div>
        <div class="tx-right"><div class="tx-amt">₹${fmt(t.amount)}</div><div class="tx-src">${s.n}</div></div></div>`;
    });
  });
  return html;
}

// ===== REPORTS =====
$('repRange').querySelectorAll('.fchip').forEach(el=>el.onclick=()=>{
  state.repRange=el.dataset.r;
  document.querySelectorAll('#repRange .fchip').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');
  $('customRange').classList.toggle('hide',state.repRange!=='custom');renderReports();
});
$('repFrom').onchange=e=>{state.repFrom=e.target.value;renderReports();};
$('repTo').onchange=e=>{state.repTo=e.target.value;renderReports();};
function renderReports(){
  const items=itemsInRange(state.repRange,state.repFrom,state.repTo);
  const total=items.reduce((s,t)=>s+t.amount,0);
  $('repTotal').textContent='₹'+fmt(total);
  $('repMeta').textContent=items.length+' expenses · '+rangeLabel(state.repRange);
  $('repPers').textContent='₹'+fmt(items.filter(t=>t.type==='personal').reduce((s,t)=>s+t.amount,0));
  $('repComp').textContent='₹'+fmt(items.filter(t=>t.type==='company').reduce((s,t)=>s+t.amount,0));
  renderCatBars('repCat',items,false);renderSrcGrid('repSrc',items);renderFoodInsight('repFoodTitle','repFood',items);
}
function rangeLabel(r){return{month:'This month',last_month:'Last month',year:'This year',all:'All time',custom:'Custom range'}[r]||'';}

// ===== EXPORTS =====
function expItems(){return itemsInRange(state.expRange,'','');}
$('expRange').querySelectorAll('.fchip').forEach(el=>el.onclick=()=>{
  state.expRange=el.dataset.r;document.querySelectorAll('#expRange .fchip').forEach(x=>x.classList.remove('sel'));el.classList.add('sel');
});
function downloadFile(name,content,type){
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();
  document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function csvEsc(v){v=(v==null?'':String(v));if(/[",\n]/.test(v))return '"'+v.replace(/"/g,'""')+'"';return v;}
function catName(t){if(t.cat==='food'&&t.meal)return 'Food - '+MEALS[t.meal];return (catMap[t.cat]||{n:t.cat}).n;}
$('expTxCsv').onclick=()=>{
  const items=expItems();if(!items.length)return toast('Nothing in this range');
  const hdr=['Date','Category','Amount','Payment Source','Type','People','Added By','Note'];
  const rows=items.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(t=>[t.date,catName(t),t.amount,(srcMap[t.src]||{n:t.src}).n,t.type==='company'?'Company Meeting':'Personal',t.cat==='food'?(t.people||''):'',t.by||'',t.note||''].map(csvEsc).join(','));
  downloadFile('transactions_'+state.expRange+'.csv',hdr.join(',')+'\n'+rows.join('\n'),'text/csv');toast('CSV downloaded');
};
function summaryCsv(kind){
  const items=expItems();if(!items.length)return toast('Nothing in this range');
  const total=items.reduce((s,t)=>s+t.amount,0);let hdr,rows;
  if(kind==='cat'){const by={};items.forEach(t=>by[t.cat]=(by[t.cat]||0)+t.amount);hdr=['Category','Amount','Share %'];
    rows=Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[(catMap[k]||{n:k}).n,v,(v/total*100).toFixed(1)]);}
  else if(kind==='src'){const by={};items.forEach(t=>by[t.src]=(by[t.src]||0)+t.amount);hdr=['Payment Source','Amount','Share %'];
    rows=Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[(srcMap[k]||{n:k}).n,v,(v/total*100).toFixed(1)]);}
  else{const p=items.filter(t=>t.type==='personal').reduce((s,t)=>s+t.amount,0),c=total-p;hdr=['Type','Amount','Share %'];
    rows=[['Personal',p,(p/total*100).toFixed(1)],['Company Meeting',c,(c/total*100).toFixed(1)]];}
  const body=rows.map(r=>r.map(csvEsc).join(',')).join('\n');
  downloadFile(kind+'_summary_'+state.expRange+'.csv',hdr.join(',')+'\n'+body+'\nTotal,'+total+',100','text/csv');toast('CSV downloaded');
}
$('expCatCsv').onclick=()=>summaryCsv('cat');
$('expSrcCsv').onclick=()=>summaryCsv('src');
$('expTypeCsv').onclick=()=>summaryCsv('type');
function pdfHeader(doc,title){
  doc.setFillColor(11,11,15);doc.rect(0,0,210,297,'F');
  doc.setTextColor(198,255,74);doc.setFont('helvetica','bold');doc.setFontSize(22);doc.text('Spend Report',14,22);
  doc.setTextColor(242,242,245);doc.setFontSize(14);doc.text(title,14,32);
  doc.setTextColor(138,138,152);doc.setFontSize(9);
  doc.text(rangeLabel(state.expRange)+'  ·  Generated '+new Date().toLocaleDateString('en-IN')+(currentUser?'  ·  '+currentUser.name:''),14,39);
  doc.setDrawColor(42,42,54);doc.line(14,43,196,43);
}
function pdfTable(doc,startY,headers,rows,colX){
  let y=startY;doc.setFontSize(10);doc.setFont('helvetica','bold');doc.setTextColor(138,138,152);
  headers.forEach((h,i)=>doc.text(h,colX[i],y,{align:i===0?'left':'right'}));y+=6;
  doc.setDrawColor(42,42,54);doc.line(14,y-3,196,y-3);
  doc.setFont('helvetica','normal');doc.setTextColor(242,242,245);
  rows.forEach(r=>{if(y>280){doc.addPage();doc.setFillColor(11,11,15);doc.rect(0,0,210,297,'F');y=20;}
    r.forEach((c,i)=>doc.text(String(c),colX[i],y,{align:i===0?'left':'right'}));y+=6.5;});
  return y;
}
function makePdf(kind){
  const items=expItems();if(!items.length)return toast('Nothing in this range');
  const{jsPDF}=window.jspdf;const doc=new jsPDF();const total=items.reduce((s,t)=>s+t.amount,0);
  if(kind==='tx'){
    pdfHeader(doc,'Transaction Register');
    const rows=items.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(t=>[t.date,catName(t).slice(0,22),(srcMap[t.src]||{n:t.src}).n,'Rs '+fmt(t.amount)]);
    let y=pdfTable(doc,52,['Date','Category','Source','Amount'],rows,[14,45,120,196]);
    doc.setFont('helvetica','bold');doc.setTextColor(198,255,74);doc.text('Total: Rs '+fmt(total),196,y+4,{align:'right'});
  }else{
    let title,rows;
    if(kind==='cat'){title='Category Summary';const by={};items.forEach(t=>by[t.cat]=(by[t.cat]||0)+t.amount);
      rows=Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[(catMap[k]||{n:k}).n,'Rs '+fmt(v),(v/total*100).toFixed(1)+'%']);}
    else if(kind==='src'){title='Payment Source Summary';const by={};items.forEach(t=>by[t.src]=(by[t.src]||0)+t.amount);
      rows=Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[(srcMap[k]||{n:k}).n,'Rs '+fmt(v),(v/total*100).toFixed(1)+'%']);}
    else{title='Personal vs Company';const p=items.filter(t=>t.type==='personal').reduce((s,t)=>s+t.amount,0),c=total-p;
      rows=[['Personal','Rs '+fmt(p),(p/total*100).toFixed(1)+'%'],['Company Meeting','Rs '+fmt(c),(c/total*100).toFixed(1)+'%']];}
    pdfHeader(doc,title);
    let y=pdfTable(doc,52,['Name','Amount','Share'],rows,[14,150,196]);
    doc.setFont('helvetica','bold');doc.setTextColor(198,255,74);doc.text('Total: Rs '+fmt(total),196,y+4,{align:'right'});
  }
  doc.save('spend_'+kind+'_'+state.expRange+'.pdf');toast('PDF downloaded');
}
$('expTxPdf').onclick=()=>makePdf('tx');
$('expCatPdf').onclick=()=>makePdf('cat');
$('expSrcPdf').onclick=()=>makePdf('src');
$('expTypePdf').onclick=()=>makePdf('type');

// ===== SHEET =====
function buildCats(){
  const g=$('catGrid');
  g.innerHTML=CATS.map(c=>`<button class="cat-chip" data-k="${c.k}"><span class="em">${c.em}</span><span class="lb">${c.n}</span></button>`).join('');
  g.querySelectorAll('.cat-chip').forEach(el=>el.onclick=()=>{state.selCat=el.dataset.k;markCat();toggleFood();});
}
function buildSrc(){
  const g=$('srcSelect');
  g.innerHTML=SOURCES.map(s=>`<button class="pill" data-s="${s.k}">${s.n}</button>`).join('');
  g.querySelectorAll('.pill').forEach(el=>el.onclick=()=>{state.src=el.dataset.s;markSrc();});
}
function markCat(){document.querySelectorAll('.cat-chip').forEach(el=>el.classList.toggle('sel',el.dataset.k===state.selCat));}
function markSrc(){document.querySelectorAll('#srcSelect .pill').forEach(el=>el.classList.toggle('sel',el.dataset.s===state.src));}
function markMeal(){document.querySelectorAll('#mealRow .pill').forEach(el=>el.classList.toggle('sel',el.dataset.m===state.meal));}
function markType(){document.querySelectorAll('#typeRow .pill').forEach(el=>{const on=el.dataset.t===state.type;el.classList.toggle('sel',on);el.classList.toggle('blue',on&&state.type==='company');});}
function toggleFood(){$('foodExtra').style.display=state.selCat==='food'?'block':'none';}
document.querySelectorAll('#mealRow .pill').forEach(el=>el.onclick=()=>{state.meal=el.dataset.m;markMeal();});
document.querySelectorAll('#typeRow .pill').forEach(el=>el.onclick=()=>{state.type=el.dataset.t;markType();});
$('peopleMinus').onclick=()=>{state.people=Math.max(1,state.people-1);$('peopleVal').textContent=state.people;};
$('peoplePlus').onclick=()=>{state.people++;$('peopleVal').textContent=state.people;};

function compress(file){return new Promise((res)=>{const img=new Image();const url=URL.createObjectURL(file);
  img.onload=()=>{const max=1600;let{width:w,height:h}=img;if(w>h&&w>max){h=h*max/w;w=max;}else if(h>max){w=w*max/h;h=max;}
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
    c.toBlob(b=>{URL.revokeObjectURL(url);res(b);},'image/jpeg',0.72);};img.src=url;});}
const camInput=$('camInput');
const galInput=$('galInput');
function renderBillArea(){
  const area=$('billArea');
  if(state.billObjUrl){area.innerHTML=`<div class="bill-preview"><img src="${state.billObjUrl}" id="billThumb"><div class="bill-actions"><button class="bill-act" id="billCam">📷</button><button class="bill-act" id="billGal">🖼️</button><button class="bill-act" id="billRemove">🗑️</button></div></div>`;
    $('billThumb').onclick=()=>openViewer(state.billObjUrl);
    $('billCam').onclick=()=>camInput.click();
    $('billGal').onclick=()=>galInput.click();
    $('billRemove').onclick=()=>{clearPendingBill();state.removeBill=true;state.billIsRemote=false;renderBillArea();};
  }else{
    area.innerHTML=`<div class="bill-choice"><button class="bill-btn" id="billCam">📷 Camera</button><button class="bill-btn" id="billGal">🖼️ Gallery</button></div>`;
    $('billCam').onclick=()=>camInput.click();
    $('billGal').onclick=()=>galInput.click();
  }
}
function clearPendingBill(){if(state.billObjUrl&&!state.billIsRemote){URL.revokeObjectURL(state.billObjUrl);}state.billObjUrl=null;state.pendingBill=null;}
async function handleBillFile(e){const file=e.target.files[0];if(!file)return;
  $('billArea').innerHTML='<div class="bill-processing">Processing photo…</div>';
  const blob=await compress(file);clearPendingBill();state.pendingBill=blob;state.removeBill=false;state.billIsRemote=false;
  state.billObjUrl=URL.createObjectURL(blob);renderBillArea();e.target.value='';}
camInput.onchange=handleBillFile;
galInput.onchange=handleBillFile;
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
    state.selCat=t.cat;state.src=t.src;state.type=t.type||'personal';state.meal=t.meal||'lunch';state.people=t.people||1;
    del.style.display='block';
    if(t.billUrl){state.billObjUrl=t.billUrl;state.billIsRemote=true;}
  }else{
    $('sheetTitle').textContent='Add expense';
    $('amtInput').value='';$('noteInput').value='';$('dateInput').value=todayStr();
    state.selCat='food';state.src='upi';state.type='personal';state.meal='lunch';state.people=1;del.style.display='none';
  }
  $('peopleVal').textContent=state.people;
  markCat();markSrc();markMeal();markType();toggleFood();renderBillArea();
  overlay.classList.add('open');sheet.classList.add('open');
  setTimeout(()=>$('amtInput').focus(),300);
}
function closeSheet(){overlay.classList.remove('open');sheet.classList.remove('open');clearPendingBill();if(document.activeElement)document.activeElement.blur();}
$('fab').onclick=()=>openSheet();
overlay.onclick=closeSheet;

$('saveBtn').onclick=async()=>{
  const amt=parseFloat($('amtInput').value);
  if(!amt||amt<=0){$('amtInput').focus();return;}
  const btn=$('saveBtn');btn.disabled=true;btn.textContent='Saving…';
  const note=$('noteInput').value.trim();
  const date=$('dateInput').value||todayStr();
  const isNew=!state.editId;
  const existing=isNew?null:data.find(x=>x.id===state.editId);
  const id=isNew?('e'+Date.now()+Math.random().toString(36).slice(2,6)):state.editId;
  const rec={id,amount:amt,note,date,cat:state.selCat,src:state.src,type:state.type,
    ts:existing?existing.ts:Date.now(),by:existing?existing.by:(currentUser?currentUser.name:'')};
  if(state.selCat==='food'){rec.meal=state.meal;rec.people=state.people;}
  rec.billUrl=existing?existing.billUrl||'':'';
  try{
    if(state.pendingBill){
      try{rec.billUrl=await uploadBill(id,state.pendingBill);}
      catch(err){toast('Saved, but photo upload failed. Check Storage is enabled.');}
    }else if(state.removeBill){await deleteBill(id);rec.billUrl='';}
    await saveExpense(rec);
    closeSheet();
  }catch(e){toast('Save failed. Check your connection.');console.error(e);}
  btn.disabled=false;btn.textContent='Save';
};
$('delBtn').onclick=async()=>{
  if(!state.editId)return;
  const btn=$('delBtn');btn.disabled=true;btn.textContent='Deleting…';
  try{await deleteBill(state.editId);await removeExpense(state.editId);closeSheet();}
  catch(e){toast('Delete failed.');}
  btn.disabled=false;btn.textContent='Delete expense';
};

$('periodSwitch').querySelectorAll('button').forEach(b=>b.onclick=()=>{
  state.period=b.dataset.p;document.querySelectorAll('#periodSwitch button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');renderOverview();
});

function renderAll(){renderOverview();if(state.tab==='transactions')renderTxList();if(state.tab==='reports')renderReports();}

renderAuthMode();
