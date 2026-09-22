

var DATA=null, current='dashboard';
/* Crew accounts (API 20+): employees sign in with Google too; the backend marks their session
   role 'crew' and only serves Time Clock, Purchase Orders, Bench Stock and CTK. A session with
   no role (minted before API 20) is an admin one. */
var VIEW_AS_CREW=false; try{ VIEW_AS_CREW=(localStorage.getItem('cj_viewas')==='crew'); }catch(e){}
window.CJ_VIEW_AS_CREW=VIEW_AS_CREW;   // api.js sends asCrew:true with every call while this is on
function isCrew(){ var s=CJ.session()||{}; return s.role==='crew' || (VIEW_AS_CREW && s.role!=='crew'); }
function isRealAdmin(){ var s=CJ.session()||{}; return !!s.session && s.role!=='crew'; }
/* "View as crew": an admin sees exactly what the crew sees — the backend serves the session as
   crew too (asCrew), so it is a real test, not just a hidden menu. Reload applies it. */
function setViewAs(crew){ try{ if(crew) localStorage.setItem('cj_viewas','crew'); else localStorage.removeItem('cj_viewas'); }catch(e){} location.reload(); }
var CREW_VIEWS={clock:1,po:1,bench:1,cal:1};
function homeView(){ return isCrew()?'clock':'dashboard'; }
var COA_CACHE=null, COA_EDIT_ROW=null, COA_MSG=null, COA_SHOW_ARCH=false, COA_PANEL=null;
var LEDGER_CACHE=null, VR_CACHE=null, LOGO_URI='';
var VIEW_HIST=[], RENDER_BACK=false;


function $(s){return document.querySelector(s);}
function money(n){ if(n==null||n===''||isNaN(n)) return ''; n=Number(n); return (n<0?'-':'')+'$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function findVal(arr,label){ for(var i=0;i<arr.length;i++){ if(arr[i].label.replace(/\s+/g,' ').trim()===label) return arr[i].value; } return null; }
function startsAny(s,arr){ s=s.replace(/\s+/g,' ').trim(); for(var i=0;i<arr.length;i++) if(s.indexOf(arr[i])===0) return true; return false; }


function isStandalone(){ try{ return (window.navigator.standalone===true) || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); }catch(e){ return false; } }
function pwaBarHtml(){
  return '<div class="pwabar" id="pwabar">'
    +'<button class="pwabtn" id="pwa-back" aria-label="Back" title="Back">\u2039</button>'
    +'<div class="pwabar-label" id="pwa-label"></div>'
    +'<button class="pwabtn" id="pwa-reload" aria-label="Reload" title="Reload">\u21bb</button>'
    +'<button class="pwabtn" id="pwa-share" aria-label="Share" title="Share">'
    +'<svg viewBox="0 0 16 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1v11M4.5 4.5L8 1l3.5 3.5"/><path d="M3 8H2v9h12V8h-1"/></svg>'
    +'</button></div>';
}
function wirePwaBar(){
  var b=document.getElementById('pwa-back'); if(b) b.onclick=viewBack;
  var r=document.getElementById('pwa-reload'); if(r) r.onclick=function(){ location.reload(); };
  var sh=document.getElementById('pwa-share'); if(sh) sh.onclick=shareApp;
  updateBar();
}
function viewBack(){ if(VIEW_HIST.length){ RENDER_BACK=true; var v=VIEW_HIST.pop(); render(v); RENDER_BACK=false; } }
function shareApp(){
  var url=location.href, title='C&J Aviation \u2014 '+(VIEW_TITLE[current]||'Admin');
  if(navigator.share){ navigator.share({title:title, url:url}).catch(function(){}); return; }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(function(){
      var lbl=document.getElementById('pwa-label'); if(lbl){ lbl.textContent='Link copied'; setTimeout(updateBar,1400); }
    }, function(){});
  }
}
function updateBar(){
  var lbl=document.getElementById('pwa-label');
  if(lbl){ var vt=verStampText(); lbl.textContent=(VIEW_TITLE[current]||'')+' \u00b7 '+vt.site+(vt.api?' \u00b7 '+vt.api:''); }
  var bk=document.getElementById('pwa-back'); if(bk) bk.disabled=!VIEW_HIST.length;
}
function boot(){
  $('#root').innerHTML='<div class="loading"><div><div class="spin"></div>'+(isCrew()?'Loading…':'Loading your books…')+'</div></div>';
  NAV = isCrew() ? NAV_CREW : NAV_ADMIN;
  var run=google.script.run
    .withSuccessHandler(function(d){ DATA=d; buildShell(); render(viewFromHash()); })
    .withFailureHandler(function(e){
      if(e && e.code==='AUTH'){ showSignIn(''); return; }
      $('#root').innerHTML='<div class="loading"><div>Could not load the sheet.<br><span class="hint">'+esc(e.message||e)+'</span><br><br><button class="btn ghost sm" onclick="boot()">Try again</button></div></div>'; });
  if(isCrew()) run.getCrewBootstrap(); else run.getBootstrap();
}

/* ---- sign-in ------------------------------------------------------- */
function viewFromHash(){ var h=(location.hash||'').replace('#','').split('?')[0]; if(isCrew() && !CREW_VIEWS[h]) return 'clock'; return VIEWS[h]?h:homeView(); }
function showSignIn(msg){
  $('#root').innerHTML=
    '<div class="signin"><div class="signin-card">'
    +'<div class="logo-badge"></div>'
    +'<h1>C&amp;J AVIATION</h1><div class="tagline">Aircraft Mechanics</div>'
    +'<div class="subtag">Accounting/Admin</div>'
    +'<p class="hint">Sign in with your Google account.</p>'
    +'<div id="gsi-btn"></div>'
    +'<div id="signin-msg" class="signin-msg">'+esc(msg||'')+'</div>'
    +'</div><div class="signin-foot">cjaviationtn.org · '+esc(CJ_CONFIG.siteVersion)+'</div></div>';
  renderGsiButton();
}
function renderGsiButton(){
  if(!(window.google && google.accounts && google.accounts.id)){ setTimeout(renderGsiButton,150); return; }
  google.accounts.id.initialize({ client_id: CJ_CONFIG.googleClientId, callback: onGoogleCredential, auto_select: true, itp_support: true });
  google.accounts.id.renderButton(document.getElementById('gsi-btn'), { theme:'filled_blue', size:'large', text:'signin_with', shape:'pill', width: 260 });
}
function onGoogleCredential(resp){
  var m=document.getElementById('signin-msg'); if(m) m.textContent='Checking…';
  CJ.login(resp.credential).then(function(){ boot(); }, function(e){ if(m) m.textContent=(e.message||String(e)); });
}
function signOut(){ CJ.logout(); DATA=null; LEDGER_CACHE=null; VR_CACHE=null; COA_CACHE=null; showSignIn('Signed out.'); }
window.addEventListener('cj:signedout', function(){ showSignIn('Your session expired — sign in again.'); });
window.addEventListener('hashchange', function(){ if(DATA && (viewFromHash()!==current || /[?&]p=/.test(location.hash))) render(viewFromHash()); });
function startApp(){
  if(CJ.session()) boot(); else showSignIn('');
}

var NAV_ADMIN=[
  ['dashboard','◧','Dashboard'],
  ['entry','＋','New Transaction'],
  ['ledger','≣','General Ledger'],
  ['tbx','⧉','TBX'],
  ['coa','☰','Chart of Accounts'],
  ['vendors','⚑','Vendor Rules'],
  ['po','◨','Purchase Orders'],
  ['bench','⬢','Bench Stock'],
  ['pay','$','Payroll'],
  ['cal','🔧','CTK'],
  ['venmo','％','Venmo Fee'],
  ['mileage','⛟','Mileage'],
  ['mr','✎','Missing Receipt']
];
var NAV_CREW=[
  ['clock','⏱','Time Clock'],
  ['po','◨','Purchase Orders'],
  ['bench','⬢','Bench Stock'],
  ['cal','🔧','CTK']
];
var NAV=NAV_ADMIN;
var VIEW_TITLE={dashboard:'Dashboard',entry:'New Transaction',ledger:'General Ledger',tbx:'TBX Invoice Summary',pl:'Income Statement (P&L)',bs:'Balance Sheet',equity:'Member Equity',coa:'Chart of Accounts',vendors:'Vendor Rules',po:'Purchase Orders',bench:'Bench Stock',clock:'Time Clock',pay:'Payroll',cal:'CTK — Calibrated Tool Kit',venmo:'Venmo Fee Calculator',mileage:'Mileage Log',mr:'Missing Receipt Affidavit'};

var SIDE_NARROW=false;
try{ SIDE_NARROW = (localStorage.getItem('cj_side')==='1'); }catch(e){}
function applySide(){
  var app=document.querySelector('.app'); if(app) app.classList.toggle('narrow', SIDE_NARROW);
  var t=document.getElementById('side-toggle');
  if(t){
    t.innerHTML='<span class="tg">'+(SIDE_NARROW?'\u00bb':'\u00ab')+'</span><span class="lbl">Collapse menu</span>';
    t.title=SIDE_NARROW?'Expand menu':'Collapse menu';
  }
}
function buildShell(){
  var navHtml='';
  for(var i=0;i<NAV.length;i++) navHtml+='<button data-view="'+NAV[i][0]+'" title="'+esc(NAV[i][2])+'"><span class="ico">'+NAV[i][1]+'</span> <span class="lbl">'+NAV[i][2]+'</span></button>';
  $('#root').innerHTML =
    '<div class="app'+(isStandalone()?' standalone':'')+'"><aside class="side">'
    +'<button class="side-toggle" id="side-toggle"></button>'
    +'<div class="brand"><div class="logo-badge"></div><div class="btxt"><h1>C&J AVIATION</h1><span class="tagline">Aircraft Mechanics</span><span class="subtag">'+(isCrew()?'Crew Page':'Accounting/Admin Page')+'</span></div></div>'
    +'<nav class="nav" id="nav">'+navHtml+'</nav>'
    +'<div class="foot">Reads &amp; writes your Google Sheet live.<br>Loaded '+esc(DATA.generatedAt)+'.'
    +'<div class="verstamp" id="verstamp"></div>'
    +'<div class="who">'+esc((CJ.session()||{}).email||'')+' · <a href="#" id="signout">Sign out</a>'+(isRealAdmin()?'<br><a href="#" id="viewas">'+(VIEW_AS_CREW?'\u2190 Back to admin view':'View as crew \u2192')+'</a>':'')+'</div></div>'
    +'</aside><div class="drawer-bg" id="drawer-bg"></div>'
    +'<main class="main"><div class="mbar" id="mbar"><button class="mbar-btn" id="mbar-menu" aria-label="Menu" title="Menu">\u2630</button><div class="mbar-title" id="mbar-title"></div><div class="logo-badge"></div></div>'
    +'<div class="mobile-nav" id="mnav"></div><div id="content"></div></main>'+pwaBarHtml()+'</div>';
  var btns=document.querySelectorAll('#nav button');
  for(var j=0;j<btns.length;j++) btns[j].onclick=function(){ render(this.getAttribute('data-view')); };
  var mb=document.getElementById('mbar-menu'), bg=document.getElementById('drawer-bg');
  if(mb) mb.onclick=drawerToggle;
  if(bg) bg.onclick=function(){ drawerToggle(false); };

  var so=document.getElementById('signout'); if(so) so.onclick=function(ev){ ev.preventDefault(); signOut(); };
  var va=document.getElementById('viewas'); if(va) va.onclick=function(ev){ ev.preventDefault(); setViewAs(!VIEW_AS_CREW); };
  var tog=document.getElementById('side-toggle');
  if(tog) tog.onclick=function(){ SIDE_NARROW=!SIDE_NARROW;
    try{ localStorage.setItem('cj_side', SIDE_NARROW?'1':'0'); }catch(e){}
    applySide(); };
  applySide();
  wirePwaBar();
  paintVerStamp();

  try{ var bg=getComputedStyle(document.querySelector('.brand .logo-badge')).backgroundImage;
       var mm=bg.match(/url\((['"]?)(.*?)\1\)/); if(mm) LOGO_URI=mm[2]; }catch(e){}
}


var VIEWS={dashboard:vDashboard,entry:vEntry,ledger:vLedger,tbx:vTBX,pl:vPL,bs:vBS,equity:vEquity,coa:vCOA,vendors:vVendors,po:vPO,bench:vBench,clock:vClock,pay:vPay,cal:vCal,venmo:vVenmo,mileage:vMileage,mr:vMR};
function render(v){
  if(isCrew() && !CREW_VIEWS[v]) v='clock';
  if(current && current!==v && !RENDER_BACK) VIEW_HIST.push(current);
  if(v==='ledger' && current!=='ledger') glDefaultSort();
  current=v;
  if(v==='bench'){ var bm=/[?&]p=([^&#]*)/.exec(location.hash||''); BENCH_P=bm?decodeURIComponent(bm[1].replace(/\+/g,' ')):''; }
  if(location.hash!=='#'+v){ try{ history.replaceState(null,'','#'+v); }catch(e){ location.hash=v; } }
  var mainEl=document.querySelector('.main');
  if(mainEl) mainEl.classList.toggle('wide', v==='ledger'||v==='bench');
  $('#content').innerHTML=printHead(VIEW_TITLE[v])+VIEWS[v]();
  var btns=document.querySelectorAll('#nav button');
  for(var i=0;i<btns.length;i++) btns[i].classList.toggle('active',btns[i].getAttribute('data-view')===v);
  renderMnav(); if(v!=='bench' && v!=='clock') injectPrintControls();  /* nothing to print on Bench Stock (own print) or the Time Clock */
  if(v==='dashboard') loadDash();
  if(v==='entry') wireEntry();
  if(v==='ledger') loadLedger();
  if(v==='tbx') wireTBX();
  if(v==='vendors') loadVendors();
  if(v==='coa') loadCOA();
  if(v==='cal') loadCal();
  if(v==='po') loadPO();
  if(v==='pay') loadPay();
  if(v==='mileage') loadMileage();
  if(v==='venmo') wireVenmo();
  if(v==='mr') wireMR();
  if(v==='clock') loadClock();
  if(v==='bench'){ if(window.BS) BS.mount(BENCH_P); else $('#view').innerHTML='<div class="bs-spin">Bench Stock script did not load \u2014 reload the page.</div>'; }
  updateBar();
}
/* phone: the sidebar becomes a slide-in drawer behind the ☰ in the top bar */
function drawerToggle(open){
  var app=document.querySelector('.app'); if(!app) return;
  if(open==null) open=!app.classList.contains('drawer-open');
  app.classList.toggle('drawer-open',open);
  document.body.classList.toggle('no-scroll',open);
}
function renderMnav(){
  drawerToggle(false);
  var mt=document.getElementById('mbar-title'); if(mt) mt.textContent=VIEW_TITLE[current]||'';
  var html='';
  for(var i=0;i<NAV.length;i++) html+='<button data-view="'+NAV[i][0]+'" class="'+(NAV[i][0]===current?'active':'')+'">'+NAV[i][2]+'</button>';
  $('#mnav').innerHTML=html;
  var btns=$('#mnav').querySelectorAll('button');
  for(var j=0;j<btns.length;j++) btns[j].onclick=function(){ render(this.getAttribute('data-view')); };
}
function printHead(title){
  var d=new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  var logo = LOGO_URI ? '<img class="plogo" src="'+LOGO_URI+'">' : '<div class="logo-badge"></div>';
  return '<div class="print-head">'+logo+'<div><div class="co">C&J AVIATION LLC — '+esc(title)+'</div><div class="meta">Fiscal Year 2026 · printed '+d+'</div></div></div>';
}
function topbar(title,sub,tag){ return '<div class="topbar"><div><h2>'+title+'</h2><div class="sub">'+sub+'</div></div><div><span class="pill">'+(tag||'live · from your sheet')+'</span></div></div>'; }


function injectPrintControls(){
  var tb=$('#content .topbar'); if(!tb) return;
  var wrap=document.createElement('div'); wrap.className='print-controls';
  wrap.innerHTML='<button class="btn sm ghost" id="printOne">🖨 Print / PDF this page</button><button class="btn sm gold" id="printAll">📄 Export all</button>';
  tb.lastElementChild.appendChild(wrap);
  $('#printOne').onclick=function(){ window.print(); };
  $('#printAll').onclick=printAll;
}
function printAll(){
  var prev=current;
  ensureLedger(function(){
    var parts=[['Dashboard',vDashboard],['Income Statement (P&L)',vPL],['Balance Sheet',vBS],['Member Equity',vEquity],['General Ledger',vLedger],['Chart of Accounts',vCOA]];
    var html='';
    for(var i=0;i<parts.length;i++) html+='<div class="'+(i>0?'page-break':'')+'">'+printHead(parts[i][0])+parts[i][1]()+'</div>';
    $('#content').innerHTML=html;
    window.print();
    setTimeout(function(){ render(prev); },500);
  });
}


function vDashboard(){
  var F=finBuild();
  return topbar('Dashboard','Shop operations · financial statements · Fiscal Year 2026 · pulled live from your General Ledger'+(DATA.ledgerUpdated?'  ·  <span class="lupd">Ledger last updated: '+esc(DATA.ledgerUpdated)+'</span>':''))
  +'<div class="fin-tools"><label class="fin-chk"><input type="checkbox" id="fin-zero"'+(FIN_SHOW_ZERO?' checked':'')+'> Show $0 accounts</label>'
  +'<span class="hint">Each statement has its own Print button. "Print / PDF this page" prints the summary and all three statements, one per page.</span></div>'
  +'<div class="fin-page'+(FIN_SHOW_ZERO?' show-zero':'')+'" id="fin-page">'
  +'<div id="fin-ops">'+opsSection()+'</div>'
  +'<div class="section-title" style="margin-top:0">Money at a glance</div>'+F.kpis
  +'<div class="section-title">Financial statements</div>'+F.statements
  +'</div>';
}
/* ---------- SHOP OPERATIONS (dashboard summary of PO / Pay / CTK) ---------- */
/* Reads the same caches the Purchase Orders, Employee Pay and CTK pages use.
   No new server functions — poGetData, payGetData and getCalibration already
   exist. Tool calibration reuses calBucket()/calDays() so this card and the
   CTK page can never disagree about what "due" means. */

function opsSection(){
  return '<div class="section-title">Shop operations</div>'
       + '<div id="ops-cards" class="grid g3" style="margin-bottom:26px">'+opsCards()+'</div>';
}

function opsCards(){ return opsPOCard()+opsPayCard()+opsCalCard(); }

/* Fetch only what is not cached yet, then repaint just the card row.
   loadPO/loadPay/loadCal can't be reused — they paint their own views. */
function loadDash(){
  var need=[];
  if(!PO_CACHE)  need.push(['poGetData',      function(d){ PO_CACHE=d;  }]);
  if(!PAY_CACHE) need.push(['payGetData',     function(d){ PAY_CACHE=d; }]);
  if(!CAL_CACHE) need.push(['getCalibration', function(d){ CAL_CACHE=d; }]);
  wireOps(); wireFin(); finOwedRefresh();
  if(!need.length) return;
  for(var i=0;i<need.length;i++)(function(fn,set){
    google.script.run
      .withSuccessHandler(function(d){ set(d); if(current==='dashboard') paintOps(); })
      .withFailureHandler(function(e){ if(current==='dashboard') paintOps(e); })
      [fn]();
  })(need[i][0],need[i][1]);
}

function paintOps(err){
  var el=document.getElementById('ops-cards'); if(!el) return;
  el.innerHTML=opsCards()
    +(err?'<div class="flash err" style="grid-column:1/-1;margin:0">'+esc(err.message||err)+'</div>':'');
  wireOps(); finOwedRefresh();
}

/* whole card is a shortcut to its full page */
function wireOps(){
  var cs=document.querySelectorAll('#ops-cards .ops-card');
  for(var i=0;i<cs.length;i++) cs[i].onclick=function(){
    var v=this.getAttribute('data-goto'); if(v) render(v);
  };
}
/* --- shared card chrome --- */
function opsWait(title){
  return '<div class="card pad"><div class="section-title" style="margin:0 0 6px">'+esc(title)+'</div>'
       + '<div class="miniload" style="padding:22px 10px"><div class="spin"></div>Loading…</div></div>';
}
function opsShell(view,title,big,bigCls,foot,body){
  return '<div class="card pad ops-card" data-goto="'+view+'" title="Open '+esc(title)+'" style="cursor:pointer;padding:16px">'
       + '<div class="section-title" style="margin:0 0 7px">'+esc(title)+'</div>'
       + '<div class="'+(bigCls||'')+'" style="font-size:23px;font-weight:800;line-height:1.05;color:var(--navy-d)">'+big+'</div>'
       + (foot?'<div style="font-size:11px;color:var(--muted);margin-top:5px">'+foot+'</div>':'')
       + (body||'')+'</div>';
}
function opsNote(msg){
  return '<div style="margin-top:11px;padding:11px;background:#f7fbf8;border:1px solid #cfe6d8;'
       + 'border-radius:9px;font-size:11.5px;color:#2c7a4b;font-weight:600">'+esc(msg)+'</div>';
}
function opsRows(rows){
  return '<div style="margin-top:11px;max-height:176px;overflow:auto;border-top:1px solid var(--line)">'
       + '<table style="font-size:11.5px"><tbody>'+rows+'</tbody></table></div>';
}
function opsLine(main,sub,right,rsub){
  return '<tr><td style="padding:6px 7px">'
       + '<div style="font-weight:700;color:var(--navy-d)">'+main+'</div>'
       + (sub?'<div style="font-size:10.5px;color:var(--muted)">'+sub+'</div>':'')
       + '</td><td class="num" style="padding:6px 7px;white-space:nowrap">'+right
       + (rsub?'<div style="font-size:10.5px;color:var(--muted);font-weight:500">'+rsub+'</div>':'')
       + '</td></tr>';
}
function opsAge(iso){
  if(!iso) return null;
  var d=new Date(String(iso)+'T00:00:00'); if(isNaN(d)) return null;
  var t=new Date(); t=new Date(t.getFullYear(),t.getMonth(),t.getDate());
  return Math.round((t-d)/86400000);
}

/* --- 1. open purchase orders (poGetData) --- */
function opsPOCard(){
  if(!PO_CACHE) return opsWait('Open Purchase Orders');

  var all=PO_CACHE.rows||[];
  var open=[];
  for(var i=0;i<all.length;i++){
    var s=String(all[i].status||'').trim();
    if(s==='Closed/Paid'||s==='Cancelled') continue;
    open.push(all[i]);
  }
  var count=(PO_CACHE.openCount!=null)?PO_CACHE.openCount:open.length;
  var out=(PO_CACHE.outstanding!=null)?PO_CACHE.outstanding:0;

  if(!count) return opsShell('po','Open Purchase Orders','0','','Nothing outstanding',
    opsNote('Every PO is closed or cancelled.'));

  open.sort(function(a,b){ return String(a.date||'').localeCompare(String(b.date||'')); });

  var rows='';
  for(var j=0;j<open.length;j++){
    var r=open[j], age=opsAge(r.date);
    var sub=[r.vendor, (r.wo&&r.wo.toLowerCase()!=='none')?'WO '+r.wo:''].filter(Boolean).join(' · ');
    var agetxt = age==null ? '<span style="color:var(--muted)">no date</span>'
               : (age>=30 ? '<span class="neg">'+age+'d open</span>' : age+'d open');
    rows+=opsLine(esc(r.po), esc(sub||r.desc||''), money(r.total), agetxt);
  }
  return opsShell('po','Open Purchase Orders',String(count),'warnc',
    money(out)+' outstanding', opsRows(rows));
}

/* --- 2. owed to employees (payGetData.summary) --- */
function opsPayCard(){
  if(!PAY_CACHE) return opsWait('Owed to Employees');

  var sum=PAY_CACHE.summary||[], owed=[], total=0;
  for(var i=0;i<sum.length;i++){
    var b=Number(sum[i].balance)||0;
    if(b>0.005){ owed.push(sum[i]); total+=b; }
  }

  if(!owed.length) return opsShell('pay','Owed to Employees',money(0),'pos','Everyone is current',
    opsNote('No unpaid labor logged.'));

  owed.sort(function(a,b){ return (Number(b.balance)||0)-(Number(a.balance)||0); });

  var rows='';
  for(var j=0;j<owed.length;j++){
    var e=owed[j];
      rows+=opsLine(esc(e.name),
        '',
        '<span class="neg">'+money(Number(e.balance)||0)+'</span>',
        '');
  }
  return opsShell('pay','Owed to Employees','<span class="neg">'+money(total)+'</span>','',
    'Across '+owed.length+(owed.length===1?' employee':' employees'), opsRows(rows));
}

/* --- 3. tool calibration due (getCalibration + calBucket/calDays) --- */
function opsCalCard(){
  if(!CAL_CACHE) return opsWait('Tool Calibration Due');

  var all=CAL_CACHE||[], due=[], over=0, outcal=0, nodate=0;
  for(var i=0;i<all.length;i++){
    var b=calBucket(all[i]);
    if(b==='outcal'){ outcal++; continue; }
    if(b==='nodate'){ nodate++; continue; }
    if(b==='over'||b==='soon'){ if(b==='over') over++; due.push(all[i]); }
  }

  var extra='';
  if(outcal) extra+='<div style="margin-top:10px;font-size:10.5px;color:var(--muted)">'+outcal+' out for calibration</div>';
  if(nodate) extra+='<div style="margin-top:6px;font-size:10.5px" class="warnc">'+nodate+' with no due date</div>';

  if(!due.length) return opsShell('cal','Tool Calibration Due','0','pos','Nothing due in 30 days',
    opsNote('No calibrations coming up.')+extra);

  due.sort(function(a,b){ return calDays(a)-calDays(b); });

  var rows='';
  for(var j=0;j<due.length;j++){
    var r=due[j], d=calDays(r);
    var when = d<0  ? '<span class="neg">'+Math.abs(d)+'d overdue</span>'
             : d===0? '<span class="neg">due today</span>'
             :        '<span class="warnc">in '+d+'d</span>';
    rows+=opsLine(esc(r.name), esc([r.pn?'PN '+r.pn:'', r.sn?'SN '+r.sn:''].filter(Boolean).join(' · ')||r.notes||''), when, esc(calPretty(r.due)));
  }
  return opsShell('cal','Tool Calibration Due',String(due.length),(over?'neg':'warnc'),
    (over?'<span class="neg">'+over+' overdue</span> · next 30 days':'Within the next 30 days'),
    opsRows(rows)+extra);
}

function tile(cls,label,val,foot){ return '<div class="tile '+cls+'"><div class="accent"></div><div class="label">'+label+'</div><div class="val small">'+val+'</div>'+(foot?'<div class="foot">'+foot+'</div>':'')+'</div>'; }
function row2(a,b){ return '<tr><td>'+a+'</td><td class="num">'+b+'</td></tr>'; }


function actionsBar(){
  var A=DATA.dashboardActions||[];
  var h='<div id="act-flash"></div>';
  if(!A.length) return h;
  h+='<div class="actions">';
  for(var k=0;k<A.length;k++) h+='<button class="'+A[k].style+'" data-fn="'+esc(A[k].fn)+'" data-confirm="'+(A[k].confirm?'1':'')+'" data-prompt="'+esc(A[k].promptText||'')+'" data-label="'+esc(A[k].label)+'">'+esc(A[k].label)+'</button>';
  return h+'</div>';
}
function wireActions(){
  var wrap=document.querySelector('#content .actions'); if(!wrap) return;
  var btns=wrap.querySelectorAll('button');
  for(var i=0;i<btns.length;i++){ btns[i].onclick=function(){
    var fn=this.getAttribute('data-fn'), label=this.getAttribute('data-label'),
        needsConfirm=this.getAttribute('data-confirm')==='1', promptText=this.getAttribute('data-prompt')||'';
    var arg=null;
    if(promptText){ arg=window.prompt(promptText); if(arg===null || String(arg).trim()==='') return; }
    else if(needsConfirm && !window.confirm('Run "'+label+'" now? This runs the same macro as the button on your sheet.')){ return; }
    var self=this; self.disabled=true; var old=self.textContent; self.textContent=label+'…';
    var flash=document.getElementById('act-flash'); if(flash) flash.innerHTML='<div class="flash busy">Running "'+esc(label)+'"…</div>';
    google.script.run
      .withSuccessHandler(function(res){ self.disabled=false; self.textContent=old;
        if(flash) flash.innerHTML='<div class="flash ok">✓ '+esc((res&&res.message)||('Ran '+label))+'</div>';
        google.script.run.withSuccessHandler(function(s){ if(s) DATA.ledgerUpdated=s; }).getLedgerUpdated();
        LEDGER_CACHE=null; reloadLedgerData();
      })
      .withFailureHandler(function(e){ self.disabled=false; self.textContent=old;
        if(flash) flash.innerHTML='<div class="flash err">'+esc(e.message||e)+'</div>'; })
      .runDashboardAction(fn, arg);
  }; }
}
function reloadLedgerData(){
  google.script.run.withSuccessHandler(function(d){ LEDGER_CACHE=d; if(current==='ledger') repaintLedger(); }).withFailureHandler(function(){}).getLedgerFull();
}


function acctMoney(n){
  if(n==null||n===''||isNaN(n)) return '';
  n=Number(n);
  if(Math.abs(n)<0.005) return '<span class="acct-zero">-</span>';
  if(n<0) return '<span class="acct-neg">($'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+')</span>';
  return '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
var RPT_GREEN={'Total Assets':1,'Total Liabilities':1,'Total Revenue':1,'Gross Profit':1};
var RPT_BLUE={'Total Equity':1,'Total Liabilities + Equity':1};
function sheetReport(arr,title,subtitle,amountLabel){
  var rows='';
  for(var i=0;i<arr.length;i++){ var r=arr[i]; var lab=r.label.replace(/\s+/g,' ').trim();
    if(r.value==null){ rows+='<tr class="s-sec"><td colspan="2">'+esc(lab)+'</td></tr>'; continue; }
    var cls='s-data';
    if(RPT_GREEN[lab]) cls='s-green';
    else if(RPT_BLUE[lab]) cls='s-blue';
    else if(lab==='Total Operating Expenses' || lab.charAt(0)==='⚖') cls='s-pink';
    else if(lab.indexOf('NET INCOME')===0) cls='s-net';
    rows+='<tr class="'+cls+'"><td>'+esc(lab)+'</td><td class="num">'+acctMoney(r.value)+'</td></tr>';
  }
  return '<div class="card sheet-rpt">'
    +'<div class="s-title">'+esc(title)+'</div>'
    +'<div class="s-sub">'+esc(subtitle)+'</div>'
    +'<table><thead><tr class="s-head"><th>Account</th><th class="num">'+esc(amountLabel)+'</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function vPL(){ return topbar('Income Statement','Profit &amp; Loss · Fiscal Year 2026')
  +sheetReport(DATA.incomeStatement,'C&J AVIATION LLC — Income Statement (P&L)','For the Period Ending: Fiscal Year 2026 (Jan - Dec) · auto-calculated from the General Ledger','Amount (USD)'); }
function vBS(){ return topbar('Balance Sheet','Assets = Liabilities + Equity · Fiscal Year 2026')
  +sheetReport(DATA.balanceSheet,'C&J AVIATION LLC — Balance Sheet','As of: Fiscal Year 2026 (Jan - Dec) · Assets = Liabilities + Equity · Balance Check must equal $0.00','Balance (USD)'); }

/* ---------- DASHBOARD FINANCIALS (Income Statement + Balance Sheet + Member Equity) ---------- */
/* Rendered inside vDashboard. Reads the same DATA.incomeStatement / DATA.balanceSheet /
   DATA.memberEquity arrays the sheet-style views (vPL/vBS/vEquity) use, so nothing changes in
   the spreadsheet. Each statement has its own Print button that prints just that statement on
   one page (body.fin-print-*), and a collapse chevron remembered in localStorage. */
var FIN_SHOW_ZERO=false, FIN_COLLAPSED={};
try{ FIN_SHOW_ZERO=(localStorage.getItem('cj_fin_zero')==='1'); FIN_COLLAPSED=JSON.parse(localStorage.getItem('cj_fin_collapsed')||'{}')||{}; }catch(e){}

function finSections(arr){
  var secs=[], cur=null;
  for(var i=0;i<arr.length;i++){
    var r=arr[i], lab=String(r.label||'').replace(/\s+/g,' ').trim();
    if(r.value==null){ cur={name:lab,items:[],totals:[]}; secs.push(cur); continue; }
    if(!cur){ cur={name:'',items:[],totals:[]}; secs.push(cur); }
    if(/^(Total |Gross Profit|NET INCOME|Net Income \/|⚖)/.test(lab)) cur.totals.push({label:lab,value:Number(r.value)||0});
    else cur.items.push({label:lab,value:Number(r.value)||0});
  }
  return secs;
}
function finSec(secs,re,idx){ for(var i=0;i<secs.length;i++) if(re.test(secs[i].name)) return secs[i]; return secs[idx]||{name:'',items:[],totals:[]}; }
function finSum(items){ var t=0; for(var i=0;i<items.length;i++) t+=items[i].value; return t; }
function finPct(n,d){ return d?((n/d*100).toFixed(1)+'%'):''; }
function finRows(items,opts){
  opts=opts||{};
  var list=items.slice();
  if(opts.sort) list.sort(function(a,b){ return Math.abs(b.value)-Math.abs(a.value); });
  var max=0; for(var i=0;i<list.length;i++) if(Math.abs(list[i].value)>max) max=Math.abs(list[i].value);
  var html='';
  for(var j=0;j<list.length;j++){
    var it=list[j], zero=Math.abs(it.value)<0.005;
    var w=max?Math.round(Math.abs(it.value)/max*100):0;
    var bc=it.value<0?' r':(opts.bar||'');
    html+='<div class="fin-row'+(zero?' zero':'')+(opts.nobar?' nb':'')+'"><div class="n">'+esc(it.label)+(opts.note&&opts.note[it.label]?'<span class="fin-pct">'+esc(opts.note[it.label])+'</span>':'')+'</div>'
        +'<div class="fin-track">'+(zero||opts.nobar?'':'<i class="'+bc.trim()+'" style="width:'+w+'%"></i>')+'</div>'
        +'<div class="v">'+acctMoney(it.value)+'</div></div>';
  }
  return html;
}
function finSecHead(name,total,note){ return '<div class="fin-sec"><h3>'+esc(name)+(note?'<span class="fin-pct">'+esc(note)+'</span>':'')+'</h3><div class="t">'+(total==null?'':acctMoney(total))+'</div></div>'; }
function finSum2(label,val,cls,note){ return '<div class="fin-row '+(cls||'sum')+'"><div class="n">'+esc(label)+(note?'<span class="fin-pct">'+esc(note)+'</span>':'')+'</div><div></div><div class="v">'+acctMoney(val)+'</div></div>'; }
/* footers read as one sentence: lower-case account words, keep proper nouns/acronyms */
function finLc(s){ return String(s).replace(/[A-Za-z]+/g,function(w){ return /^(AMEX|Venmo|VolFed|OpEx|YTD|A\/R|PayPal|Zelle|USAA|Chase|TBX)$/i.test(w)?w:w.toLowerCase(); }); }
function finCap(s){ s=String(s); return s.charAt(0).toUpperCase()+s.slice(1); }
function finK(n){ n=Number(n)||0; var s='$'+Math.abs(Math.round(n)).toLocaleString('en-US'); return n<0?'('+s+')':s; }

function finBridge(rev,cogs,gp,opex,net){
  var top=Math.max(rev,gp,net,0), bot=Math.min(net,0), range=(top-bot)||1;
  function y(v){ return ((v-bot)/range*100); }
  function bar(cls,lo,hi){ return '<div class="fin-bar '+cls+'" style="bottom:'+y(lo).toFixed(1)+'%;height:'+Math.max(0.5,(y(hi)-y(lo))).toFixed(1)+'%"></div>'; }
  function step(cap,amt,neg,inner){ return '<div class="fin-step"><div class="col">'+inner+'</div><div class="cap">'+cap+'</div><div class="amt'+(neg?' neg':'')+'">'+amt+'</div></div>'; }
  return '<div class="fin-bridge" style="--fin-base:'+y(0).toFixed(1)+'%">'
    +step('Revenue',finK(rev),false,bar('tot',0,rev))
    +step('COGS','−'+finK(cogs),true,bar('minus',Math.min(rev,gp),Math.max(rev,gp)))
    +step('Gross Profit',finK(gp),gp<0,bar(gp<0?'minus':'tot',Math.min(0,gp),Math.max(0,gp)))
    +step('Op. Expenses','−'+finK(opex),true,bar('minus',Math.min(gp,net),Math.max(gp,net)))
    +step('Net Income',finK(net),net<0,bar(net<0?'minus':'tot',Math.min(0,net),Math.max(0,net)))
    +'</div>';
}

/* "Owed out" = AMEX + sales tax payable (+ unpaid labor once payGetData has loaded) */
function finOwedFoot(amex,sales,pay){ var p=[]; if(amex>0) p.push('AMEX '+finK(amex)); if(sales>0) p.push('sales tax '+finK(sales)); if(pay>0) p.push('payroll '+finK(pay)); return esc(p.join(' · ')||'nothing outstanding'); }
function finOwedRefresh(){
  var el=document.getElementById('fin-owed'); if(!el||!PAY_CACHE) return;
  var BS=DATA.balanceSheet||[], amex=findVal(BS,'AMEX Credit Card'), sales=findVal(BS,'Sales Tax Payable');
  var sum=PAY_CACHE.summary||[], pay=0; for(var i=0;i<sum.length;i++){ var b=Number(sum[i].balance)||0; if(b>0.005) pay+=b; }
  el.textContent=money((amex>0?amex:0)+(sales>0?sales:0)+pay);
  var f=document.getElementById('fin-owed-foot'); if(f) f.innerHTML=finOwedFoot(amex,sales,pay);
}
function finCardHead(title,meta,key){
  return '<div class="fin-head"><div><h3>'+title+'</h3><div class="meta">'+meta+'</div></div>'
    +'<div class="fin-hb"><button class="btn sm ghost fin-print" data-fin="'+key+'" title="Print just this statement">🖨 Print</button>'
    +'<button class="btn sm ghost fin-tog" data-fin="'+key+'" title="Show / hide">\u25be</button></div></div>';
}

function finBuild(){
  var IS=DATA.incomeStatement||[], BS=DATA.balanceSheet||[];
  var isS=finSections(IS), bsS=finSections(BS);
  var sRev=finSec(isS,/REVENUE/i,0), sCogs=finSec(isS,/COST OF GOODS/i,1), sOpx=finSec(isS,/OPERATING/i,2);
  var rev=findVal(IS,'Total Revenue'); if(rev==null) rev=finSum(sRev.items);
  var cogs=finSum(sCogs.items);
  var gp=findVal(IS,'Gross Profit'); if(gp==null) gp=rev-cogs;
  var opex=findVal(IS,'Total Operating Expenses'); if(opex==null) opex=finSum(sOpx.items);
  var net=findVal(IS,'NET INCOME / (LOSS)'); if(net==null) net=findVal(IS,'Net Income / (Loss)'); if(net==null) net=gp-opex;

  var sAss=finSec(bsS,/ASSET/i,0), sLia=finSec(bsS,/LIABILIT/i,1), sEq=finSec(bsS,/EQUITY/i,2);
  var assets=findVal(BS,'Total Assets'); if(assets==null) assets=finSum(sAss.items);
  var liab=findVal(BS,'Total Liabilities'); if(liab==null) liab=finSum(sLia.items);
  var eq=findVal(BS,'Total Equity'); if(eq==null) eq=finSum(sEq.items);
  var le=findVal(BS,'Total Liabilities + Equity'); if(le==null) le=liab+eq;
  var chk=findVal(BS,'⚖ Balance Check (must equal $0.00)'); if(chk==null) chk=assets-le;
  var balanced=Math.abs(chk)<0.005;

  /* asset groups for the stacked bar */
  var cash=0, ar=0, other=0, cashItems=[];
  for(var a=0;a<sAss.items.length;a++){ var it=sAss.items[a];
    if(/cash|checking|savings|venmo/i.test(it.label)){ cash+=it.value; cashItems.push(finLc(it.label.replace(/^Cash \/ /,'').replace(/VolFed |Business |Account/g,'').trim())); }
    else if(/receivable/i.test(it.label)) ar+=it.value; else other+=it.value; }
  var amex=findVal(BS,'AMEX Credit Card');
  var sales=findVal(BS,'Sales Tax Payable');

  /* revenue mix for the KPI foot */
  var mix=[]; for(var m=0;m<sRev.items.length;m++){ var ri=sRev.items[m]; if(rev&&ri.value/rev>=0.05) mix.push(finLc(ri.label.replace(/ Income$/,'').replace(/^Maintenance /,'').replace(/ Sales$/,''))+' '+Math.round(ri.value/rev*100)+'%'); }

  var owedOut=(amex>0?amex:0)+(sales>0?sales:0);
  var kpis='<div class="grid fin-kpis" id="fin-kpis">'
    +tile('navy','Revenue',money(rev),esc(finCap(mix.slice(0,2).join(' · '))))
    +tile('ok','Gross Profit',money(gp),finPct(gp,rev)+' margin · OpEx '+finPct(opex,rev)+' of revenue')
    +tile(net<0?'red':'ok','Net Income','<span class="'+(net<0?'neg':'pos')+'">'+money(net)+'</span>',net<0?'Loss YTD':'Profit YTD')
    +tile('navy','Cash on hand',money(cash),esc(finCap(cashItems.join(' + '))))
    +tile('','Owed to us',money(ar),'Accounts receivable')
    +tile(owedOut>0?'warn':'','Owed out','<span class="neg" id="fin-owed">'+money(owedOut)+'</span>','<span id="fin-owed-foot">'+finOwedFoot(amex,sales,null)+'</span>')
    +'</div>';

  /* ---- Income Statement card ---- */
  var cogsNote={}; if(sCogs.items.length===1){ var ps=0; for(var p=0;p<sRev.items.length;p++) if(/parts/i.test(sRev.items[p].label)) ps+=sRev.items[p].value; if(ps) cogsNote[sCogs.items[0].label]=finPct(cogs,ps)+' of parts sales'; }
  var pl='<section class="card fin-card'+(FIN_COLLAPSED['pl']?' collapsed':'')+'" id="fin-pl">'
    +'<div class="fin-phead">'+printHead('Income Statement (P&L)')+'</div>'
    +finCardHead('Income Statement','Profit &amp; Loss · Fiscal Year 2026 (Jan – Dec) · from the General Ledger','pl')
    +'<div class="fin-body">'
    +finBridge(rev,cogs,gp,opex,net)
    +finSecHead(sRev.name||'Revenue',rev)+finRows(sRev.items)
    +finSecHead(sCogs.name||'Cost of Goods Sold',cogs)+finRows(sCogs.items,{bar:'g',note:cogsNote})
    +finSum2('Gross Profit',gp,'sum',finPct(gp,rev))
    +finSecHead(sOpx.name||'Operating Expenses',opex,'sorted by size')+finRows(sOpx.items,{sort:true})
    +finSum2('Total Operating Expenses',opex,'sum')
    +finSum2('Net Income / (Loss)',net,'net')
    +'</div></section>';

  /* ---- Balance Sheet card ---- */
  function segs(list,cls){ var h=''; for(var i=0;i<list.length;i++){ if(list[i][1]<=0.005) continue; h+='<div class="fin-seg '+cls+(list[i][2]||'')+'" style="flex:'+Math.max(1,Math.round(list[i][1]))+'"><span>'+esc(list[i][0])+'</span><span class="num">'+finK(list[i][1])+'</span></div>'; } return h; }
  var liabList=[]; for(var l=0;l<sLia.items.length;l++) liabList.push([sLia.items[l].label.replace(/ Credit Card$/,''),sLia.items[l].value,'']);
  var bs='<section class="card fin-card'+(FIN_COLLAPSED['bs']?' collapsed':'')+'" id="fin-bs">'
    +'<div class="fin-phead">'+printHead('Balance Sheet')+'</div>'
    +finCardHead('Balance Sheet','As of today · what we own vs. what we owe','bs')
    +'<div class="fin-body">'
    +'<div class="fin-bsviz"><div class="fin-stack"><div class="lbl">Assets · '+finK(assets)+'</div>'+segs([['Equipment & other',other,' s-fixed'],['A/R',ar,' s-ar'],['Cash',cash,' s-cash']],'')+'</div>'
    +'<div class="fin-stack"><div class="lbl">Liabilities + Equity · '+finK(le)+'</div>'+segs([['Equity',eq,' s-eq']].concat(liabList.map(function(x){ return [x[0],x[1],' s-liab']; })),'')+'</div></div>'
    +'<div class="fin-balance'+(balanced?'':' bad')+'"><span>'+(balanced?'⚖ Books balance':'⚖ Books do NOT balance')+'</span><span class="num">Check = '+money(balanced?0:chk)+'</span></div>'
    +finSecHead(sAss.name||'Assets',assets)+finRows(sAss.items,{bar:'g'})
    +finSecHead(sLia.name||'Liabilities',liab)+finRows(sLia.items,{bar:'r'})
    +finSecHead(sEq.name||"Owner's Equity",eq)+finRows(sEq.items,{nobar:true})
    +finSum2('Total Liabilities + Equity',le,'sum')
    +'</div></section>';

  /* ---- Member Equity card (the LLC Member Equity schedule) ---- */
  var g=DATA.memberEquity||[], head=-1;
  for(var i=0;i<g.length;i++){ if(String(g[i][0]).indexOf('Equity Component')===0){ head=i; break; } }
  var eqRows='', names=['Member A','Member B','Total'];
  if(head>=0){ for(var c=1;c<4;c++){ names[c-1]=String(g[head][c]||'').replace(/\s*\n\s*/g,' ').replace(/^Member [AB]\s*\((.*)\)$/,'$1'); } }
  for(var r=head+1;r<g.length;r++){
    var row=g[r], l0=String(row[0]||''); if(!l0||l0.indexOf('Note:')===0) continue;
    var isEnd=l0.indexOf('Ending')===0;
    eqRows+='<div class="fin-eqrow'+(isEnd?' end':'')+'"><div>'+esc(l0)+'</div>';
    for(var c2=1;c2<4;c2++){ var v=row[c2]; eqRows+='<div class="num">'+(v===''||v==null?'':acctMoney(v))+'</div>'; }
    eqRows+='</div>';
  }
  var me='<section class="card fin-card'+(FIN_COLLAPSED['eq']?' collapsed':'')+'" id="fin-eq">'
    +'<div class="fin-phead">'+printHead('Member Equity')+'</div>'
    +finCardHead('LLC Member Equity','50 / 50 ownership · net income allocated equally per the Operating Agreement','eq')
    +'<div class="fin-body">'
    +(head>=0
      ? '<div class="fin-eqhead"><div>Equity component</div><div>'+esc(names[0])+'</div><div>'+esc(names[1])+'</div><div>'+esc(names[2])+'</div></div>'+eqRows
      : '<div class="hint">The LLC Member Equity tab has no schedule to show.</div>')
    +'</div></section>';

  return { kpis:kpis, statements:'<div class="fin-cols">'+pl+bs+'</div>'+me };
}
function finClearPrint(){ document.body.classList.remove('fin-print-pl','fin-print-bs','fin-print-eq'); }
function wireFin(){
  finClearPrint();
  var cb=$('#fin-zero');
  if(cb) cb.onchange=function(){ FIN_SHOW_ZERO=cb.checked; try{ localStorage.setItem('cj_fin_zero',cb.checked?'1':'0'); }catch(e){}
    var pg=$('#fin-page'); if(pg) pg.classList.toggle('show-zero',cb.checked); };
  var btns=document.querySelectorAll('.fin-print');
  for(var i=0;i<btns.length;i++) btns[i].onclick=function(){
    finClearPrint(); document.body.classList.add('fin-print-'+this.getAttribute('data-fin'));
    setTimeout(function(){ window.print(); },30);
  };
  var togs=document.querySelectorAll('.fin-tog');
  for(var t=0;t<togs.length;t++) togs[t].onclick=function(){
    var k=this.getAttribute('data-fin'), card=document.getElementById('fin-'+k); if(!card) return;
    card.classList.toggle('collapsed'); FIN_COLLAPSED[k]=card.classList.contains('collapsed');
    try{ localStorage.setItem('cj_fin_collapsed',JSON.stringify(FIN_COLLAPSED)); }catch(e){}
  };
  if(!window.__finAfterPrint){ window.__finAfterPrint=true; window.addEventListener('afterprint',finClearPrint); }
}


function vEquity(){
  var g=DATA.memberEquity||[];

  var head=-1;
  for(var i=0;i<g.length;i++){ if(String(g[i][0]).indexOf('Equity Component')===0){ head=i; break; } }
  var html=topbar('LLC Member Equity','50 / 50 ownership · auto-calculated from the ledger')+'<div class="card"><table class="rpt"><thead><tr>';
  if(head>=0){ for(var c=0;c<4;c++) html+='<th'+(c>0?' class="num"':'')+'>'+esc(String(g[head][c]).replace(/\n/g,' '))+'</th>'; }
  html+='</tr></thead><tbody>';
  for(var r=head+1;r<g.length;r++){
    var row=g[r]; var l0=String(row[0]);
    if(l0.indexOf('Note:')===0) continue;
    var isEnd=l0.indexOf('Ending')===0;
    html+='<tr class="'+(isEnd?'tot':'')+'"><td>'+esc(l0)+'</td>';
    for(var c2=1;c2<4;c2++){ var v=row[c2]; var neg=(typeof v==='number'&&v<0)?' neg':''; html+='<td class="num'+neg+'">'+(v===''||v==null?'':money(v))+'</td>'; }
    html+='</tr>';
  }
  html+='</tbody></table></div><div class="hint" style="margin:10px 4px">Net income/loss is allocated 50/50 per the Operating Agreement.</div>';
  return html;
}


var TBX_SEL=null, TBX_SEL_DATA=null, TBX_NOTE='';
function monthName(m){return ['','January','February','March','April','May','June','July','August','September','October','November','December'][m]||('Month '+m);}
/* Default = previous month. getMonth() is 0-based, so it already equals the
   previous month 1-based (Aug -> 7 -> July). January is the exception:
   December belongs to the prior year's workbook (see yearEndClose), so fall
   back to January and say so. */
function tbxDefaultMonth(){
  var now=new Date(), m=now.getMonth();
  if(m===0){ var py=now.getFullYear()-1; return { month:1, note:'Showing January. December '+py+' figures are in the '+py+' workbook.' }; }
  return { month:m, note:'' };
}
function tbxTiles(d){
  return '<div class="grid g3 tbx-tiles">'
    +tile('red','Sales Tax Owed','<span class="neg">'+money(d.tax)+'</span>','owed to the state')
    +tile('navy','Labor Income',money(d.labor),'')
    +tile('','Parts Income',money(d.parts),'')
    +tile('','Other Income',money(d.other),'')
    +tile('','Shipping Recovered',money(d.shipping),'')
    +tile('ok','Total Invoiced',money(d.total),'')
    +'</div>';
}
function vTBX(){
  var T=DATA.tbx;
  if(TBX_SEL==null){
    var d=tbxDefaultMonth();
    TBX_SEL=d.month; TBX_NOTE=d.note;
    TBX_SEL_DATA=(TBX_SEL===(T.monthNum||0)) ? T.month : null;
  }
  var opts=''; for(var m=1;m<=12;m++) opts+='<option value="'+m+'"'+(m===TBX_SEL?' selected':'')+'>'+monthName(m)+'</option>';
  return topbar('TBX Invoice Summary','Accrual invoicing \u00b7 sales tax you owe the state')
    +'<div class="section-title" style="display:flex;align-items:center;gap:12px;margin-top:6px">Current month'
      +'<select id="tbx-month" style="width:auto;padding:6px 12px;font-weight:600">'+opts+'</select></div>'
    +'<div id="tbx-current">'+(TBX_SEL_DATA?tbxTiles(TBX_SEL_DATA):'<div class="miniload"><div class="spin"></div>Loading '+monthName(TBX_SEL)+'\u2026</div>')+'</div>'
    +'<div id="tbx-note" class="hint" style="margin:8px 4px">'+esc(TBX_NOTE)+'</div>'
    +'<div class="section-title">Year to date</div>'+tbxTiles(T.ytd)
    +'<div class="hint" style="margin:14px 4px">"Sales Tax Owed" is what you collected and owe the state. When you remit it, categorize that checking payment to Sales Tax Payable to reduce the balance. Picking a month here does not change your sheet.</div>';
}
function wireTBX(){
  var sel=$('#tbx-month'); if(!sel) return;
  function load(m){
    $('#tbx-current').innerHTML='<div class="miniload"><div class="spin"></div>Loading '+monthName(m)+'\u2026</div>';
    google.script.run
      .withSuccessHandler(function(d){
        TBX_SEL=m; TBX_SEL_DATA=d;
        if(current!=='tbx') return;
        $('#tbx-current').innerHTML=tbxTiles(d);
        var nb=$('#tbx-note'); if(nb) nb.textContent=TBX_NOTE;
      })
      .withFailureHandler(function(e){ if(current==='tbx') $('#tbx-current').innerHTML='<div class="hint">Could not load: '+esc(e.message||e)+'</div>'; })
      .getTBXForMonth(m);
  }
  sel.onchange=function(){ TBX_NOTE=''; load(Number(this.value)); };
  if(TBX_SEL_DATA==null) load(TBX_SEL);
}


var GL_DEF=[
  {key:'source',label:'Source'},
  {key:'date',label:'Date'},
  {key:'desc',label:'Description'},
  {key:'ref',label:'Reference #'},
  {key:'debit',label:'Debit (+)',num:true},
  {key:'credit',label:'Credit (−)',num:true},
  {key:'notes',label:'Notes / Tail #'},
  {key:'account',label:'Account'},
  {key:'lineType',label:'Line Type'},
  {key:'entryCheck',label:'Entry Check'},
  {key:'status',label:'Status'}
];
var GL_FILTERS={}, GL_SORT={key:'date',dir:-1};
/* The ledger always opens sorted by date (newest first), no matter how it was last sorted
   or where a late-added row sits in the sheet. Column sorts still work within a visit. */
function glDefaultSort(){ GL_SORT={key:'date',dir:-1}; }
function glDef(k){ for(var i=0;i<GL_DEF.length;i++) if(GL_DEF[i].key===k) return GL_DEF[i]; return null; }
function cellStr(r,k){ var d=glDef(k); var v=r[k]; if(d&&d.num) return (v!=null?money(v):''); return String(v==null?'':v); }
function isReview(r){ return r.account==='REVIEW' && r.lineType==='Category'; }
function allAccountOptions(sel){
  /* Archived accounts drop out of the picker, EXCEPT the one already saved on this row.
     Hiding a row's own value would make the select fall back to its first option, which
     looks exactly like the transaction was silently recategorised. archivedButSelected. */
  var A=DATA.accounts, byType={}, order=[];
  for(var i=0;i<A.length;i++){
    if(A[i].archived && A[i].name!==sel) continue;
    var t=A[i].type||'Other'; if(!byType[t]){byType[t]=[];order.push(t);} byType[t].push(A[i]);
  }
  var h='';
  for(var g=0;g<order.length;g++){ h+='<optgroup label="'+esc(order[g])+'">'; var it=byType[order[g]];
    for(var k=0;k<it.length;k++){ var nm=it[k].name;
      h+='<option value="'+esc(nm)+'"'+(nm===sel?' selected':'')+'>'+esc(nm)+(it[k].archived?' (archived)':'')+'</option>'; }
    h+='</optgroup>'; }
  return h;
}
function accountCell(r){

  if(r.lineType!=='Category') return esc(r.account);
  var rev=r.account==='REVIEW';
  var opts=(rev?'<option value="">⚠ choose account…</option>':'')+allAccountOptions(rev?'':r.account);
  return '<select class="acct-sel'+(rev?' rev-sel':'')+'" data-row="'+r.rowNum+'">'+opts+'</select>';
}
function reviewCount(){ var c=0; for(var i=0;i<LEDGER_CACHE.length;i++) if(isReview(LEDGER_CACHE[i])) c++; return c; }
function statusCell(r){
  if(r.lineType!=='Category') return esc(r.status==null?'':r.status);
  return '<select class="stat-sel" data-row="'+r.rowNum+'" style="width:110px;padding:4px 6px;font-size:12px" title="Status applies to every row of this transaction">'+glOptsWith(GL_STATUSES,String(r.status==null?'':r.status))+'</select>';
}
function cellHtml(r,k){ var d=glDef(k);
  if(k==='account') return accountCell(r);
  if(k==='status') return statusCell(r);
  if(d&&d.num) return r[k]!=null?money(r[k]):'';
  if(k==='date') return '<span style="white-space:nowrap">'+esc(r.date)+'</span>';
  return esc(r[k]);
}
function ledgerRows(){
  var rows=LEDGER_CACHE.slice();
  rows=rows.filter(function(r){ for(var k in GL_FILTERS){ var a=GL_FILTERS[k]; if(!a) continue; if(!a[cellStr(r,k)]) return false; } return true; });
  if(GL_SORT.key){ var k=GL_SORT.key,dir=GL_SORT.dir,d=glDef(k);
    rows.sort(function(a,b){
      var c=0;
      if(k==='date'){ var ad=glDateISO(a.date), bd=glDateISO(b.date); if(!ad!==!bd) return ad?-1:1; c=ad<bd?-1:ad>bd?1:0; } /* blank/odd dates always sink */
      else if(d&&d.num){ var av=a[k]==null?-Infinity:a[k], bv=b[k]==null?-Infinity:b[k]; c=av<bv?-1:av>bv?1:0; }
      else { var as=cellStr(a,k).toLowerCase(), bs=cellStr(b,k).toLowerCase(); c=as<bs?-1:as>bs?1:0; }
      if(c) return c*dir;
      return (a.rowNum||0)-(b.rowNum||0); /* tie: keep sheet order so a transaction's lines stay together */
    });
  }
  return rows;
}
function glHeadRow(){
  var h='<tr>';
  for(var i=0;i<GL_DEF.length;i++){ var d=GL_DEF[i]; var sorted=GL_SORT.key===d.key; var filt=!!GL_FILTERS[d.key];
    var arrow=sorted?(GL_SORT.dir>0?' ▲':' ▼'):'';
    h+='<th class="'+(d.num?'num ':'')+(filt?'filtered ':'')+(d.key==='entryCheck'?'gl-noprint':'')+'">'+esc(d.label)+arrow+'<button class="fbtn'+((sorted||filt)?' active':'')+'" data-key="'+d.key+'">▾</button></th>';
  }
  return h+'<th class="gl-act" style="width:104px">Actions</th></tr>';
}
function glBody(){
  var rows=ledgerRows(); if(!rows.length) return '<tr><td colspan="12" style="text-align:center;padding:20px;color:var(--muted)">No rows match the current filters. <a href="#" id="gl-clearall">Clear all filters</a></td></tr>';
  var rh='';
  for(var r=0;r<rows.length;r++){ var x=rows[r];
    if(GL_EDIT_ROW===x.rowNum){ rh+=glEditRow(x); continue; }
    rh+='<tr'+(isReview(x)?' class="rev-row"':'')+'>';
    for(var c=0;c<GL_DEF.length;c++){ var k=GL_DEF[c].key; rh+='<td'+(GL_DEF[c].num?' class="num"':(k==='entryCheck'?' class="gl-noprint"':''))+'>'+cellHtml(x,k)+'</td>'; }
    rh+='<td class="gl-act" style="white-space:nowrap"><button class="btn ghost" style="padding:3px 8px;font-size:11px" data-gledit="'+x.rowNum+'">Edit</button> <button class="btn ghost" style="padding:3px 8px;font-size:11px" data-gldel="'+x.rowNum+'" title="Delete this transaction">\u2715</button></td>';
    rh+='</tr>';
  }
  return rh;
}

var GL_EDIT_ROW=null;
var GL_LINE_TYPES=['Financial','Category','Transfer'];
var GL_STATUSES=['','Pending','Cleared','Reconciled','Void'];
function glDateISO(s){ var p=String(s==null?'':s).split('/'); if(p.length!==3) return ''; return p[2]+'-'+('0'+p[0]).slice(-2)+'-'+('0'+p[1]).slice(-2); }
function glSourceList(){ var seen={},h=''; for(var i=0;i<LEDGER_CACHE.length;i++){ var s=String(LEDGER_CACHE[i].source==null?'':LEDGER_CACHE[i].source).trim(); if(s&&!seen[s]){ seen[s]=1; h+='<option value="'+esc(s)+'">'; } } return h; }
function glOpts(arr,sel){ var h=''; for(var i=0;i<arr.length;i++){ var v=arr[i]; h+='<option value="'+esc(v)+'"'+(v===sel?' selected':'')+'>'+esc(v===''?'\u2014':v)+'</option>'; } return h; }
function glOptsWith(arr,sel){ var a=arr.slice(); if(a.indexOf(sel)===-1) a.unshift(sel); return glOpts(a,sel); }
function glFld(label,inner,w){ return '<div style="'+(w?('width:'+w+'px'):'min-width:170px;flex:1')+'"><label>'+label+'</label>'+inner+'</div>'; }
function glEditRow(r){
  return '<tr class="rev-row gl-edit"><td colspan="12"><div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end">'
    +glFld('Source','<input class="gle-source" list="gl-srclist" value="'+esc(r.source)+'">',112)
    +'<datalist id="gl-srclist">'+glSourceList()+'</datalist>'
    +glFld('Date','<input class="gle-date" type="date" value="'+glDateISO(r.date)+'">',146)
    +glFld('Description','<input class="gle-desc" value="'+esc(r.desc)+'">',0)
    +glFld('Reference #','<input class="gle-ref" value="'+esc(r.ref)+'">',112)
    +glFld('Debit (+)','<input class="gle-debit" type="number" step="0.01" min="0" value="'+(r.debit!=null?r.debit:'')+'">',104)
    +glFld('Credit (\u2212)','<input class="gle-credit" type="number" step="0.01" min="0" value="'+(r.credit!=null?r.credit:'')+'">',104)
    +glFld('Notes / Tail #','<input class="gle-notes" value="'+esc(r.notes)+'">',0)
    +glFld('Account','<select class="gle-account">'+allAccountOptions(String(r.account==null?'':r.account))+'</select>',215)
    +glFld('Line Type','<select class="gle-linetype">'+glOptsWith(GL_LINE_TYPES,String(r.lineType==null?'':r.lineType))+'</select>',126)
    +glFld('Status','<select class="gle-status">'+glOptsWith(GL_STATUSES,String(r.status==null?'':r.status))+'</select>',126)
    +'<div style="display:flex;gap:8px"><button class="btn sm" data-glsave="'+r.rowNum+'">Save</button>'
    +'<button class="btn sm ghost" data-glcancel="1">Cancel</button></div>'
    +'<div class="hint" style="width:100%;margin:2px 0 0">Entry Check recalculates from Line Type + Account. The Transaction ID is preserved, so this row stays paired with its other half.</div>'
    +'</div></td></tr>';
}
function glSave(rowNum, btn){
  var tr=btn.closest('tr');
  var payload={
    source: tr.querySelector('.gle-source').value.trim(),
    date: tr.querySelector('.gle-date').value,
    desc: tr.querySelector('.gle-desc').value,
    ref: tr.querySelector('.gle-ref').value,
    debit: tr.querySelector('.gle-debit').value,
    credit: tr.querySelector('.gle-credit').value,
    notes: tr.querySelector('.gle-notes').value,
    account: tr.querySelector('.gle-account').value,
    lineType: tr.querySelector('.gle-linetype').value,
    status: tr.querySelector('.gle-status').value
  };
  btn.disabled=true; btn.textContent='Saving\u2026';
  google.script.run
    .withSuccessHandler(function(d){ LEDGER_CACHE=d; GL_EDIT_ROW=null; if(current==='ledger') glRepaintKeepScroll(); glRefreshReports(); })
    .withFailureHandler(function(e){ btn.disabled=false; btn.textContent='Save'; alert('Could not save: '+(e.message||e)); })
    .updateLedgerRow(rowNum, payload);
}
function glDelete(rowNum){
  var r=null; for(var i=0;i<LEDGER_CACHE.length;i++){ if(LEDGER_CACHE[i].rowNum===rowNum){ r=LEDGER_CACHE[i]; break; } }
  if(!r) return;
  var txn=String(r.txnId==null?'':r.txnId).trim();
  if(!txn){ alert('This row has no Transaction ID, so its matching half cannot be identified. Delete it directly on the sheet.'); return; }
  var mates=[]; for(var j=0;j<LEDGER_CACHE.length;j++){ if(String(LEDGER_CACHE[j].txnId==null?'':LEDGER_CACHE[j].txnId).trim()===txn) mates.push(LEDGER_CACHE[j]); }
  var lines='';
  for(var k=0;k<mates.length;k++){ var m=mates[k];
    var amt=(m.debit!=null?'Debit '+money(m.debit):(m.credit!=null?'Credit '+money(m.credit):''));
    lines+='\n  \u2022 '+m.date+'   '+String(m.account==null?'':m.account)+'   '+amt+'   '+String(m.desc==null?'':m.desc);
  }
  if(!confirm('Delete this entire transaction?\n\n'+mates.length+' row'+(mates.length>1?'s':'')+' will be permanently removed:\n'+lines+'\n\nThis cannot be undone.')) return;
  google.script.run
    .withSuccessHandler(function(d){ LEDGER_CACHE=d; GL_EDIT_ROW=null; if(current==='ledger') glRepaintKeepScroll(); glRefreshReports(); })
    .withFailureHandler(function(e){ alert('Could not delete: '+(e.message||e)); })
    .deleteTransactionAndReload(txn);
}
function glRefreshReports(){
  google.script.run.withSuccessHandler(function(rep){
    if(!rep||!DATA) return;
    DATA.incomeStatement=rep.incomeStatement; DATA.balanceSheet=rep.balanceSheet;
    DATA.tbx=rep.tbx; DATA.salesTax=rep.salesTax; DATA.memberEquity=rep.memberEquity;
    DATA.ledgerUpdated=rep.ledgerUpdated; TBX_SEL=null; TBX_SEL_DATA=null;
  }).withFailureHandler(function(){}).getReports();
}
function bannerHtml(){
  if(!LEDGER_CACHE) return '';
  var rc=reviewCount();
  return rc ? '<div class="rev-banner">⚠ '+rc+' transaction'+(rc>1?'s':'')+' need a category account — pick one in the highlighted Account cells below. <button class="btn sm" id="rev-only">Show only these</button> <button class="btn sm ghost" id="rev-all">Show all</button></div>' : '';
}
function vLedger(){
  var top=topbar('General Ledger', LEDGER_CACHE ? (LEDGER_CACHE.length+' lines · click ▾ on any column to sort &amp; filter'+(Object.keys(GL_FILTERS).length?(' · '+Object.keys(GL_FILTERS).length+' filter'+(Object.keys(GL_FILTERS).length>1?'s':'')+' active'):'')) : 'Loading…')+actionsBar();
  if(!LEDGER_CACHE) return top+'<div id="gl-banner"></div><div class="card"><div class="miniload"><div class="spin"></div>Loading the full ledger…</div></div>';
  return top+'<div id="gl-banner">'+bannerHtml()+'</div>'
    +'<div class="ledger-box"><table class="tb" style="font-size:12px"><thead id="gl-head">'+glHeadRow()+'</thead><tbody id="gl-body">'+glBody()+'</tbody></table></div>';
}
/* Repaint the ledger in place and put the scroll back where it was, so saving a
   row or fixing a REVIEW account doesn't throw the user back to the top. */
function glRepaintKeepScroll(){
  var box=document.querySelector('.ledger-box'), boxTop=box?box.scrollTop:0, boxLeft=box?box.scrollLeft:0, winY=window.pageYOffset||0;
  repaintLedger();
  box=document.querySelector('.ledger-box'); if(box){ box.scrollTop=boxTop; box.scrollLeft=boxLeft; }
  window.scrollTo(0, winY);
}
function repaintLedger(){
  var head=document.getElementById('gl-head'), body=document.getElementById('gl-body');
  if(!head||!body){ if(current==='ledger') render('ledger'); return; }
  var bn=document.getElementById('gl-banner'); if(bn) bn.innerHTML=bannerHtml();
  head.innerHTML=glHeadRow(); body.innerHTML=glBody(); wireLedger();
  var sub=$('#content .topbar .sub'); if(sub){ var active=Object.keys(GL_FILTERS).length; sub.innerHTML=LEDGER_CACHE.length+' lines · click ▾ on any column to sort &amp; filter'+(active?(' · '+active+' filter'+(active>1?'s':'')+' active'):''); }
}
function wireLedger(){
  var btns=document.querySelectorAll('#gl-head .fbtn');
  for(var b=0;b<btns.length;b++) btns[b].onclick=function(e){ e.stopPropagation(); openFilter(this.getAttribute('data-key'), this); };
  var ca=document.getElementById('gl-clearall'); if(ca) ca.onclick=function(e){ e.preventDefault(); GL_FILTERS={}; repaintLedger(); };
  var rs=document.querySelectorAll('#gl-body .acct-sel');
  for(var i=0;i<rs.length;i++) rs[i].onchange=function(){ var row=parseInt(this.getAttribute('data-row'),10); var acct=this.value; if(!acct) return; setLedgerAccount(row,acct,this); };
  var ss=document.querySelectorAll('#gl-body .stat-sel');
  for(var s1=0;s1<ss.length;s1++) ss[s1].onchange=function(){ setLedgerStatus(parseInt(this.getAttribute('data-row'),10), this.value, this); };
  var ro=document.getElementById('rev-only'); if(ro) ro.onclick=function(){ GL_FILTERS={account:{'REVIEW':true}}; repaintLedger(); };
  var ra=document.getElementById('rev-all'); if(ra) ra.onclick=function(){ GL_FILTERS={}; repaintLedger(); };
  var eds=document.querySelectorAll('[data-gledit]');
  for(var e1=0;e1<eds.length;e1++) eds[e1].onclick=function(){ GL_EDIT_ROW=parseInt(this.getAttribute('data-gledit'),10); repaintLedger(); };
  var dls=document.querySelectorAll('[data-gldel]');
  for(var d1=0;d1<dls.length;d1++) dls[d1].onclick=function(){ glDelete(parseInt(this.getAttribute('data-gldel'),10)); };
  var glc=document.querySelector('[data-glcancel]'); if(glc) glc.onclick=function(){ GL_EDIT_ROW=null; repaintLedger(); };
  var gls=document.querySelector('[data-glsave]'); if(gls) gls.onclick=function(){ glSave(parseInt(this.getAttribute('data-glsave'),10), this); };
}
function setLedgerStatus(rowNum, status, selEl){
  selEl.disabled=true; selEl.style.opacity='.6';
  google.script.run
    .withSuccessHandler(function(res){
      var rows=res.rows||[res.rowNum];
      for(var i=0;i<LEDGER_CACHE.length;i++){ if(rows.indexOf(LEDGER_CACHE[i].rowNum)>=0) LEDGER_CACHE[i].status=res.status; }
      repaintLedger();
    })
    .withFailureHandler(function(e){ selEl.disabled=false; selEl.style.opacity='1'; alert('Could not save status: '+(e.message||e)); })
    .setLedgerStatus(rowNum, status);
}
function setLedgerAccount(rowNum, acct, selEl){
  var wasReview=false;
  for(var i=0;i<LEDGER_CACHE.length;i++){ if(LEDGER_CACHE[i].rowNum===rowNum){ wasReview=(LEDGER_CACHE[i].account==='REVIEW'); break; } }
  selEl.disabled=true; selEl.style.opacity='.6';
  google.script.run
    .withSuccessHandler(function(res){
      for(var i=0;i<LEDGER_CACHE.length;i++){ if(LEDGER_CACHE[i].rowNum===res.rowNum){ LEDGER_CACHE[i].account=res.account; LEDGER_CACHE[i].entryCheck=res.entryCheck; break; } }
      if(wasReview && current==='ledger'){ glRepaintKeepScroll(); return; }
      selEl.disabled=false; selEl.style.opacity='1';
      var tr=selEl.closest && selEl.closest('tr'); if(tr){ tr.style.transition='background .3s'; tr.style.background='#dff0e4'; setTimeout(function(){ tr.style.background=''; },600); }
    })
    .withFailureHandler(function(e){ selEl.disabled=false; selEl.style.opacity='1'; alert('Could not save: '+(e.message||e)); })
    .setLedgerAccount(rowNum, acct);
}
function openFilter(key, anchor){
  closeFilter();
  var d=glDef(key), seen={}, vals=[];
  for(var i=0;i<LEDGER_CACHE.length;i++){ var s=cellStr(LEDGER_CACHE[i],key); if(!(s in seen)){ seen[s]=1; vals.push(s); } }
  if(d.num) vals.sort(function(a,b){ return (parseFloat(a.replace(/[^0-9.-]/g,''))||0)-(parseFloat(b.replace(/[^0-9.-]/g,''))||0); });
  else vals.sort(function(a,b){ return a.toLowerCase()<b.toLowerCase()?-1:(a.toLowerCase()>b.toLowerCase()?1:0); });
  var cur=GL_FILTERS[key], items='';
  for(var v=0;v<vals.length;v++){ var val=vals[v]; var checked=cur?!!cur[val]:true;
    items+='<label class="fitem"><input type="checkbox" class="fchk" data-val="'+esc(val)+'"'+(checked?' checked':'')+'> <span>'+(val===''?'(Blanks)':esc(val))+'</span></label>';
  }
  var pop=document.createElement('div'); pop.className='fpop'; pop.id='gl-fpop';
  pop.innerHTML=
    '<div class="fsort"><button class="flink" data-sort="1">↑ Sort A → Z</button><button class="flink" data-sort="-1">↓ Sort Z → A</button></div>'
    +'<input class="fsearch" placeholder="Search values…">'
    +'<div class="frow"><a href="#" class="fselall">Select all</a> · <a href="#" class="fclr">Clear</a></div>'
    +'<div class="flist">'+items+'</div>'
    +'<div class="factions"><button class="btn ghost sm" data-act="cancel">Cancel</button><button class="btn sm" data-act="ok">Apply</button></div>';
  document.body.appendChild(pop);
  var rect=anchor.getBoundingClientRect(), pw=270;
  pop.style.left=Math.max(8,Math.min(rect.left, window.innerWidth-pw-12))+'px';
  pop.style.top=Math.min(rect.bottom+4, window.innerHeight-360)+'px';
  var sorts=pop.querySelectorAll('[data-sort]'); for(var s=0;s<sorts.length;s++) sorts[s].onclick=function(){ GL_SORT={key:key,dir:parseInt(this.getAttribute('data-sort'),10)}; closeFilter(); repaintLedger(); };
  pop.querySelector('.fsearch').oninput=function(){ var q=this.value.toLowerCase(); var its=pop.querySelectorAll('.fitem'); for(var i=0;i<its.length;i++) its[i].style.display=its[i].textContent.toLowerCase().indexOf(q)>=0?'':'none'; };
  pop.querySelector('.fselall').onclick=function(e){ e.preventDefault(); var cs=pop.querySelectorAll('.fchk'); for(var i=0;i<cs.length;i++){ if(cs[i].parentNode.style.display!=='none') cs[i].checked=true; } };
  pop.querySelector('.fclr').onclick=function(e){ e.preventDefault(); var cs=pop.querySelectorAll('.fchk'); for(var i=0;i<cs.length;i++){ if(cs[i].parentNode.style.display!=='none') cs[i].checked=false; } };
  pop.querySelector('[data-act=cancel]').onclick=closeFilter;
  pop.querySelector('[data-act=ok]').onclick=function(){
    var allowed={}, all=true; var cs=pop.querySelectorAll('.fchk');
    for(var i=0;i<cs.length;i++){ if(cs[i].checked){ allowed[cs[i].getAttribute('data-val')]=true; } else { all=false; } }
    if(all){ delete GL_FILTERS[key]; } else { GL_FILTERS[key]=allowed; }
    closeFilter(); repaintLedger();
  };
  setTimeout(function(){ document.addEventListener('mousedown', outsideFilter); },0);
}
function outsideFilter(e){ var pop=document.getElementById('gl-fpop'); if(pop && !pop.contains(e.target)) closeFilter(); }
function closeFilter(){ var pop=document.getElementById('gl-fpop'); if(pop) pop.remove(); document.removeEventListener('mousedown', outsideFilter); }
function ensureLedger(cb){ if(LEDGER_CACHE){cb();return;} google.script.run.withSuccessHandler(function(d){LEDGER_CACHE=d;cb();}).withFailureHandler(function(){cb();}).getLedgerFull(); }
function loadLedger(){ wireActions(); if(LEDGER_CACHE){ wireLedger(); return; } google.script.run.withSuccessHandler(function(d){LEDGER_CACHE=d; if(current==='ledger') render('ledger');}).withFailureHandler(function(e){ if(current==='ledger'){ var ml=$('#content .miniload'); if(ml) ml.innerHTML='Could not load ledger: '+esc(e.message||e);} }).getLedgerFull(); }


var COA_TYPES=['Asset','Liability','Equity','Income','Expense'];
var COA_NORMALS=['Debit','Credit'];
var COA_STMTS=['Balance Sheet','Income Statement'];
var COA_SECTION={Asset:'ASSETS',Liability:'LIABILITIES',Equity:"OWNER'S EQUITY",Income:'REVENUE',Expense:'OPERATING EXPENSES'};

function coaOpts(list,sel){ var h=''; for(var i=0;i<list.length;i++){ h+='<option value="'+esc(list[i])+'"'+(list[i]===sel?' selected':'')+'>'+esc(list[i])+'</option>'; } return h; }
function coaDefaultsFor(t){ var k=String(t||'').toLowerCase();
  return { normal:(k==='asset'||k==='expense')?'Debit':'Credit', stmt:(k==='income'||k==='expense')?'Income Statement':'Balance Sheet' }; }

function coaAddPanel(){
  var d=coaDefaultsFor('Expense');
  return '<div class="card pad" style="margin-bottom:16px">'
   +'<div class="section-title" style="margin:0 0 12px">Add an account</div>'
   +'<div style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:16px;margin-bottom:16px">'
   +'<div><label>Acct code</label><input id="coa-code" placeholder="4400"></div>'
   +'<div><label>Account name</label><input id="coa-name" placeholder="e.g. Avionics Labor Income"></div>'
   +'<div><label>Type</label><select id="coa-type">'+coaOpts(COA_TYPES,'Expense')+'</select></div>'
   +'</div>'
   +'<div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:16px;margin-bottom:16px">'
   +'<div><label>Normal balance</label><select id="coa-normal">'+coaOpts(COA_NORMALS,d.normal)+'</select></div>'
   +'<div><label>Statement</label><select id="coa-stmt">'+coaOpts(COA_STMTS,d.stmt)+'</select></div>'
   +'<div><label>Description</label><input id="coa-desc" placeholder="optional"></div>'
   +'</div>'
   +'<div class="preview" id="coa-route" style="margin-bottom:14px"></div>'
   +'<button class="btn" id="coa-add">Add account</button> <button class="btn ghost" id="coa-cancel">Cancel</button>'
   +'</div>';
}

function vCOA(){
  if(!COA_CACHE) return topbar('Chart of Accounts','Loading…')+'<div class="card"><div class="miniload"><div class="spin"></div>Loading accounts…</div></div>';
  var A=COA_CACHE.accounts||[]; var live=0,arch=0;
  for(var n=0;n<A.length;n++){ if(A[n].archived) arch++; else live++; }
  var actions='<div class="actions">'
   +'<button class="btn gold" id="coa-addbtn">＋ Add Account</button>'
   +(arch?('<button class="btn ghost" id="coa-togglearch">'+(COA_SHOW_ARCH?'Hide':'Show')+' '+arch+' archived</button>'):'')
   +'</div>';
  var panel=(COA_PANEL==='add')?coaAddPanel():'';
  var groups={},order=[];
  for(var g=0;g<A.length;g++){ var t=A[g].type||'Other'; if(!groups[t]){groups[t]=[];order.push(t);} groups[t].push(A[g]); }
  var rows='';
  for(var o=0;o<order.length;o++){
    var items=groups[order[o]],shown=[];
    for(var s=0;s<items.length;s++){ if(items[s].archived && !COA_SHOW_ARCH) continue; shown.push(items[s]); }
    if(!shown.length) continue;
    rows+='<tr class="grp"><td colspan="5">'+esc(order[o])+' accounts</td></tr>';
    for(var k=0;k<shown.length;k++) rows+=coaRowHtml(shown[k]);
  }
  return topbar('Chart of Accounts','C&amp;J Aviation LLC · '+live+' active'+(arch?(' · '+arch+' archived'):''))
    +actions
    +'<div id="coa-flash"></div>'
    +panel
    +'<div class="card scroll"><table class="tb"><thead><tr><th style="width:90px">Code</th><th>Account name</th><th style="width:110px">Type</th><th style="width:120px">Normal</th><th style="width:170px">Actions</th></tr></thead><tbody id="coa-body">'+rows+'</tbody></table></div>'
    +'<div class="hint" style="margin:10px 4px">Adding an account also writes its row into the Income Statement or Balance Sheet and rewrites that section total. Type is fixed after creation — changing it would mean moving the row to another report section.</div>';
}

function coaRowHtml(a){
  if(a.rowNum===COA_EDIT_ROW){
    return '<tr class="coa-edit" data-row="'+a.rowNum+'">'
     +'<td><input class="ce-code" value="'+esc(a.code)+'" style="padding:6px 8px;font-size:12px"></td>'
     +'<td><input class="ce-name" value="'+esc(a.name)+'" style="padding:6px 8px;font-size:12px"></td>'
     +'<td>'+esc(a.type)+'</td>'
     +'<td><select class="ce-normal" style="padding:6px 8px;font-size:12px">'+coaOpts(COA_NORMALS,a.normal)+'</select></td>'
     +'<td><button class="btn sm" data-cact="save" data-row="'+a.rowNum+'">Save</button> <button class="btn sm ghost" data-cact="cancel">Cancel</button></td>'
     +'</tr>';
  }
  var badge=a.archived?' <span class="chip">Archived</span>':'';
  return '<tr'+(a.archived?' style="opacity:.6"':'')+'>'
   +'<td><span class="chip">'+esc(a.code)+'</span></td>'
   +'<td>'+esc(a.name)+badge+'</td>'
   +'<td>'+esc(a.type)+'</td>'
   +'<td>'+esc(a.normal)+'</td>'
   +'<td><button class="btn sm ghost" data-cact="edit" data-row="'+a.rowNum+'">Edit</button> '
   +'<button class="btn sm ghost" data-cact="arch" data-row="'+a.rowNum+'" data-on="'+(a.archived?'0':'1')+'">'+(a.archived?'Restore':'Archive')+'</button></td>'
   +'</tr>';
}

function loadCOA(){
  if(COA_CACHE){ wireCOA(); return; }
  google.script.run.withSuccessHandler(function(d){ COA_CACHE=d; if(current==='coa') render('coa'); })
    .withFailureHandler(function(e){ if(current==='coa'){ var ml=$('#content .miniload'); if(ml) ml.innerHTML='Could not load accounts: '+esc(e.message||e); } })
    .getAccountsAdmin();
}

function coaRoute(){
  var el=$('#coa-route'); if(!el) return;
  var t=$('#coa-type').value, stmt=$('#coa-stmt').value, sec=COA_SECTION[t]||'?';
  el.innerHTML='<div style="font-size:13px">Will insert into <strong>'+esc(stmt)+'</strong> under '+esc(sec)+', above that section total, and rewrite the total to include it.</div>';
}

function wireCOA(){
  if(COA_MSG){ var f=$('#coa-flash'); if(f) f.innerHTML='<div class="flash ok">'+esc(COA_MSG)+'</div>'; COA_MSG=null; }
  var ab=$('#coa-addbtn');
  if(ab) ab.onclick=function(){ COA_PANEL=(COA_PANEL==='add')?null:'add'; render('coa'); };
  var cb=$('#coa-cancel'); if(cb) cb.onclick=function(){ COA_PANEL=null; render('coa'); };
  var ty=$('#coa-type');
  if(ty){ ty.onchange=function(){ var d=coaDefaultsFor(this.value); $('#coa-normal').value=d.normal; $('#coa-stmt').value=d.stmt; coaRoute(); }; }
  var st=$('#coa-stmt'); if(st) st.onchange=coaRoute;
  coaRoute();
  var add=$('#coa-add'); if(add) add.onclick=coaAdd;
  var tg=$('#coa-togglearch'); if(tg) tg.onclick=function(){ COA_SHOW_ARCH=!COA_SHOW_ARCH; render('coa'); };
  var body=document.getElementById('coa-body'); if(!body) return;
  var btns=body.querySelectorAll('button[data-cact]');
  for(var i=0;i<btns.length;i++) btns[i].onclick=function(){
    var act=this.getAttribute('data-cact'), row=parseInt(this.getAttribute('data-row'),10);
    if(act==='edit'){ COA_EDIT_ROW=row; render('coa'); }
    else if(act==='cancel'){ COA_EDIT_ROW=null; render('coa'); }
    else if(act==='save'){ coaSave(row); }
    else if(act==='arch'){ coaArchive(row, this.getAttribute('data-on')==='1'); }
  };
}

function coaBusy(msg){ var f=$('#coa-flash'); if(f) f.innerHTML='<div class="flash busy">'+esc(msg)+'</div>'; }
function coaErr(e){ var f=$('#coa-flash'); if(f) f.innerHTML='<div class="flash err">'+esc(e.message||e)+'</div>'; }

function coaAdd(){
  var name=$('#coa-name').value.replace(/^\s+|\s+$/g,'');
  if(!name){ coaErr('Enter an account name.'); return; }
  var payload={ code:$('#coa-code').value.replace(/^\s+|\s+$/g,''), name:name, type:$('#coa-type').value,
                normal:$('#coa-normal').value, stmt:$('#coa-stmt').value, desc:$('#coa-desc').value };
  var btn=$('#coa-add'); btn.disabled=true; btn.textContent='Adding…'; coaBusy('Adding "'+name+'" and inserting its report row…');
  google.script.run
   .withSuccessHandler(function(r){ COA_CACHE=null; COA_EDIT_ROW=null; COA_PANEL=null;
     COA_MSG='✓ Added '+r.name+' — row '+r.reportRow+' on the '+r.reportTab+', and its section total was rewritten.';
     LEDGER_CACHE=null; loadCOA(); })
   .withFailureHandler(function(e){ btn.disabled=false; btn.textContent='Add account'; coaErr(e); })
   .addAccount(payload);
}

function coaSave(rowNum){
  var tr=document.querySelector('.coa-edit[data-row="'+rowNum+'"]'); if(!tr) return;
  var newName=tr.querySelector('.ce-name').value.replace(/^\s+|\s+$/g,'');
  if(!newName){ alert('Account name is required.'); return; }
  var payload={ code:tr.querySelector('.ce-code').value.replace(/^\s+|\s+$/g,''), name:newName, normal:tr.querySelector('.ce-normal').value };
  var oldName='';
  var A=COA_CACHE.accounts||[];
  for(var i=0;i<A.length;i++) if(A[i].rowNum===rowNum) oldName=A[i].name;
  var go=function(){
    var sb=tr.querySelector('[data-cact=save]'); if(sb){ sb.disabled=true; sb.textContent='Saving…'; }
    google.script.run
     .withSuccessHandler(function(r){ COA_CACHE=null; COA_EDIT_ROW=null;
       COA_MSG='✓ Saved '+r.name+(r.ledgerRowsUpdated?(' — renamed on '+r.ledgerRowsUpdated+' ledger rows'):'')+'.';
       LEDGER_CACHE=null; loadCOA(); })
     .withFailureHandler(function(e){ if(sb){ sb.disabled=false; sb.textContent='Save'; } alert('Could not save: '+(e.message||e)); })
     .updateAccount(rowNum,payload);
  };
  if(newName.toLowerCase()===oldName.toLowerCase()){ go(); return; }
  google.script.run.withSuccessHandler(function(n){
    if(n>0 && !window.confirm('Renaming "'+oldName+'" to "'+newName+'" will update '+n+' ledger row'+(n>1?'s':'')+' and rewrite its report formula. Continue?')) return;
    go();
  }).withFailureHandler(function(){ go(); }).countLedgerUses(oldName);
}

function coaArchive(rowNum,on){
  google.script.run
   .withSuccessHandler(function(r){ COA_CACHE=null; COA_EDIT_ROW=null;
     COA_MSG=(r.archived?'✓ Archived ':'✓ Restored ')+r.name+'.'+(r.note?(' '+r.note):'');
     LEDGER_CACHE=null; loadCOA(); })
   .withFailureHandler(function(e){ alert('Could not update: '+(e.message||e)); })
   .setAccountArchived(rowNum,on);
}


var VR_EDIT_ROW=null;
function vVendors(){
  if(!VR_CACHE) return topbar('Vendor Rules','Loading…')+'<div class="card"><div class="miniload"><div class="spin"></div>Loading vendor rules…</div></div>';
  var rules=VR_CACHE.rules||[];
  var addForm=
    '<div class="card pad" style="margin-bottom:16px">'
    +'<div class="section-title" style="margin:0 0 12px">Add a vendor rule</div>'
    +'<div id="vr-flash"></div>'
    +'<div class="form-row"><div><label>Keyword / vendor fragment</label><input id="vr-kw" placeholder="e.g. SKYGEEK"></div>'
    +'<div><label>Suggested category</label><select id="vr-cat">'+allAccountOptions('')+'</select></div></div>'
    +'<div class="form-row"><div><label>Source override (optional)</label><input id="vr-src" placeholder="blank, or AMEX / Biz CKG / VENMO…"></div>'
    +'<div><label>Notes (optional)</label><input id="vr-notes" placeholder="optional"></div></div>'
    +'<button class="btn" id="vr-add">Add rule</button>'
    +'</div>';
  var thead='<tr><th>Keyword / Vendor Fragment</th><th>Suggested Category</th><th>Source Override</th><th>Notes</th><th style="width:130px">Actions</th></tr>';
  var rows='';
  for(var i=0;i<rules.length;i++){ var ru=rules[i];
    if(ru.rowNum===VR_EDIT_ROW){
      rows+='<tr class="vr-edit" data-row="'+ru.rowNum+'">'
        +'<td><input class="ve-kw" value="'+esc(ru.keyword)+'"></td>'
        +'<td><select class="ve-cat">'+allAccountOptions(ru.category)+'</select></td>'
        +'<td><input class="ve-src" value="'+esc(ru.source)+'"></td>'
        +'<td><input class="ve-notes" value="'+esc(ru.notes)+'"></td>'
        +'<td><button class="btn sm" data-act="save" data-row="'+ru.rowNum+'">Save</button> <button class="btn sm ghost" data-act="cancel">Cancel</button></td>'
        +'</tr>';
    } else {
      rows+='<tr class="vr-row">'
        +'<td>'+esc(ru.keyword)+'</td><td>'+esc(ru.category)+'</td><td>'+esc(ru.source)+'</td><td>'+esc(ru.notes)+'</td>'
        +'<td><button class="btn sm ghost" data-act="edit" data-row="'+ru.rowNum+'">Edit</button> <button class="btn sm danger" data-act="del" data-row="'+ru.rowNum+'" data-kw="'+esc(ru.keyword)+'">Delete</button></td>'
        +'</tr>';
    }
  }
  return topbar('Vendor Rules', rules.length+' auto-categorization rules')
    +addForm
    +'<div style="margin-bottom:12px"><input id="vr-search" placeholder="Search keyword or category…" style="max-width:340px"></div>'
    +'<div class="card scroll vr-wrap"><table class="tb vr-tbl"><thead>'+thead+'</thead><tbody id="vr-body">'+rows+'</tbody></table></div>';
}
function loadVendors(){
  if(VR_CACHE){ wireVendors(); return; }
  google.script.run.withSuccessHandler(function(d){VR_CACHE=d; if(current==='vendors'){ render('vendors'); }}).withFailureHandler(function(e){ if(current==='vendors'){ var ml=$('#content .miniload'); if(ml) ml.innerHTML='Could not load vendor rules: '+esc(e.message||e);} }).getVendorRules();
}
function wireVendors(){
  wireVendorSearch(); wireVendorAdd();
  var body=document.getElementById('vr-body'); if(!body) return;
  var btns=body.querySelectorAll('button[data-act]');
  for(var i=0;i<btns.length;i++) btns[i].onclick=function(){
    var act=this.getAttribute('data-act'), row=parseInt(this.getAttribute('data-row'),10);
    if(act==='edit'){ VR_EDIT_ROW=row; render('vendors'); }
    else if(act==='cancel'){ VR_EDIT_ROW=null; render('vendors'); }
    else if(act==='del'){ if(window.confirm('Delete rule "'+this.getAttribute('data-kw')+'"?')) deleteVR(row); }
    else if(act==='save'){ saveVR(row); }
  };
}
function wireVendorSearch(){
  var box=$('#vr-search'); if(!box) return;
  box.oninput=function(){ var q=this.value.toLowerCase(); var rows=document.querySelectorAll('#vr-body .vr-row');
    for(var i=0;i<rows.length;i++){ rows[i].style.display = rows[i].textContent.toLowerCase().indexOf(q)>=0 ? '' : 'none'; } };
}
var VR_ADDED_MSG=null;
function wireVendorAdd(){
  if(VR_ADDED_MSG){ var f=$('#vr-flash'); if(f){ f.innerHTML='<div class="flash ok">'+esc(VR_ADDED_MSG)+'</div>'; } VR_ADDED_MSG=null; }
  var btn=$('#vr-add'); if(!btn) return;
  btn.onclick=function(){
    var kw=$('#vr-kw').value.trim(), cat=$('#vr-cat').value, src=$('#vr-src').value.trim(), notes=$('#vr-notes').value.trim();
    if(!kw){ $('#vr-flash').innerHTML='<div class="flash err">Enter a keyword.</div>'; return; }
    btn.disabled=true; btn.textContent='Adding…';
    google.script.run
      .withSuccessHandler(function(d){ VR_CACHE=d; VR_EDIT_ROW=null; VR_ADDED_MSG='✓ Added rule: "'+kw+'" → '+cat; render('vendors'); })
      .withFailureHandler(function(e){ btn.disabled=false; btn.textContent='Add rule'; $('#vr-flash').innerHTML='<div class="flash err">'+esc(e.message||e)+'</div>'; })
      .addVendorRule({keyword:kw,category:cat,source:src,notes:notes});
  };
}
function deleteVR(row){
  google.script.run
    .withSuccessHandler(function(d){ VR_CACHE=d; VR_EDIT_ROW=null; VR_ADDED_MSG='✓ Rule deleted.'; render('vendors'); })
    .withFailureHandler(function(e){ alert('Could not delete: '+(e.message||e)); })
    .deleteVendorRule(row);
}
function saveVR(row){
  var tr=document.querySelector('.vr-edit[data-row="'+row+'"]'); if(!tr) return;
  var kw=tr.querySelector('.ve-kw').value.trim(), cat=tr.querySelector('.ve-cat').value, src=tr.querySelector('.ve-src').value.trim(), notes=tr.querySelector('.ve-notes').value.trim();
  if(!kw){ alert('Keyword is required.'); return; }
  var saveBtn=tr.querySelector('[data-act=save]'); if(saveBtn){ saveBtn.disabled=true; saveBtn.textContent='Saving…'; }
  google.script.run
    .withSuccessHandler(function(d){ VR_CACHE=d; VR_EDIT_ROW=null; VR_ADDED_MSG='✓ Rule updated.'; render('vendors'); })
    .withFailureHandler(function(e){ if(saveBtn){ saveBtn.disabled=false; saveBtn.textContent='Save'; } alert('Could not save: '+(e.message||e)); })
    .updateVendorRule(row, {keyword:kw,category:cat,source:src,notes:notes});
}


function moneyOptions(){ var A=DATA.accounts,h=''; for(var i=0;i<A.length;i++) if(A[i].isMoney && !A[i].archived) h+='<option value="'+esc(A[i].name)+'" data-code="'+esc(A[i].code)+'">'+esc(A[i].code)+' · '+esc(A[i].name)+'</option>'; return h; }
function catOptions(){
  var A=DATA.accounts, byType={}, order=[];
  for(var i=0;i<A.length;i++){ if(A[i].isMoney || A[i].archived || A[i].name==='REVIEW' || A[i].name==='UNCATEGORIZED') continue; var t=A[i].type||'Other'; if(!byType[t]){byType[t]=[];order.push(t);} byType[t].push(A[i]); }
  var h=''; for(var g=0;g<order.length;g++){ h+='<optgroup label="'+esc(order[g])+'">'; var it=byType[order[g]]; for(var k=0;k<it.length;k++) h+='<option value="'+esc(it[k].name)+'" data-code="'+esc(it[k].code)+'">'+esc(it[k].code)+' · '+esc(it[k].name)+'</option>'; h+='</optgroup>'; }
  return h;
}
function selCode(sel){ var o=sel.options[sel.selectedIndex]; return o?(o.getAttribute('data-code')||''):''; }
function vEntry(){
  var today=new Date().toISOString().slice(0,10);
  return topbar('New Transaction','Type once — it posts the balanced double-entry pair to your ledger')
  +'<div id="flash"></div><div class="grid g2">'
  +'<div class="card pad">'
    +'<div class="form-row"><div><label>Date</label><input type="date" id="f-date" value="'+today+'"></div><div><label>Amount (USD)</label><input type="number" id="f-amt" placeholder="0.00" step="0.01" min="0"></div></div>'
    +'<div style="margin-bottom:16px"><label>Type</label><select id="f-type"><option value="out">Expense — money out</option><option value="in">Income — money in</option><option value="transfer">Transfer — between your accounts</option></select></div>'
    +'<div style="margin-bottom:16px"><label>Description</label><input id="f-desc" placeholder="e.g. Aircraft Spruce — brake parts"></div>'
    +'<div class="form-row"><div><label>Reference #</label><input id="f-ref" placeholder="Invoice, PO, Venmo txn ID…"><div class="hint">Optional · ledger column D</div></div>'
    +'<div><label>Notes / Tail #</label><input id="f-notes" placeholder="e.g. N3115W / Invoice 1033"><div class="hint">Optional · ledger column G</div></div></div>'
    +'<div class="form-row"><div><label id="lab-a">Money account</label><select id="f-a"></select><div class="hint" id="hint-a">What the money moved through</div></div>'
    +'<div><label id="lab-b">Category account</label><select id="f-b"></select><div class="hint" id="hint-b">From your Chart of Accounts</div></div></div>'
  +'</div>'
  +'<div class="card pad"><div class="section-title" style="margin:0 0 10px">Entry preview</div>'
    +'<div class="preview" id="preview"><div class="hint">Enter an amount to see the double-entry it will post.</div></div>'
    +'<div class="balchk" id="balchk"></div>'
    +'<div style="margin-top:18px;display:flex;gap:10px"><button class="btn" id="postbtn" disabled>Post to ledger</button><button class="btn ghost" id="clearbtn">Clear</button></div>'
    +'<div class="hint" style="margin-top:14px" id="post-note">Writes two rows to your General Ledger with a shared Transaction ID, Source, and Pending status.</div>'
  +'</div></div>';
}
function wireEntry(){
  var amt=$('#f-amt'),type=$('#f-type'),selA=$('#f-a'),selB=$('#f-b'),desc=$('#f-desc'),ref=$('#f-ref'),notes=$('#f-notes'),date=$('#f-date'),
      prev=$('#preview'),chk=$('#balchk'),post=$('#postbtn'),labA=$('#lab-a'),labB=$('#lab-b'),hintA=$('#hint-a'),hintB=$('#hint-b'),note=$('#post-note');
  function populate(){
    var t=type.value; selA.innerHTML=moneyOptions();
    if(t==='transfer'){ labA.textContent='From account'; hintA.textContent='Money leaves here'; labB.textContent='To account'; hintB.textContent='Money arrives here';
      selB.innerHTML=moneyOptions(); if(selB.options.length>1) selB.selectedIndex=1;
      note.textContent='Writes two Transfer rows (Credit from · Debit to) with a shared Transaction ID and Pending status.';
    }else{ labA.textContent='Money account'; hintA.textContent='What the money moved through'; labB.textContent='Category account'; hintB.textContent='From your Chart of Accounts';
      selB.innerHTML=catOptions(); note.textContent='Writes two rows (Financial + Category) to your General Ledger with a shared Transaction ID, Source, and Pending status.'; }
  }
  function refresh(){
    var a=parseFloat(amt.value), t=type.value;
    if(!(a>0)){ prev.innerHTML='<div class="hint">Enter an amount to see the double-entry it will post.</div>'; chk.innerHTML=''; post.disabled=true; return; }
    var aName=selA.value, bName=selB.value, drAcct, crAcct;
    if(t==='transfer'){ if(aName===bName){ prev.innerHTML='<div class="hint">Choose two different accounts.</div>'; chk.innerHTML='<span class="neg">From and To must differ.</span>'; post.disabled=true; return; } drAcct=bName; crAcct=aName; }
    else if(t==='out'){ drAcct=bName; crAcct=aName; } else { drAcct=aName; crAcct=bName; }
    prev.innerHTML='<div class="ln"><span>'+esc(drAcct)+'</span><span class="dr">Debit '+money(a)+'</span></div><div class="ln"><span>'+esc(crAcct)+'</span><span class="cr">Credit '+money(a)+'</span></div>';
    chk.innerHTML='<span class="pos">⚖ Balanced — debits '+money(a)+' = credits '+money(a)+'</span>'; post.disabled=false;
  }
  type.addEventListener('change',function(){ populate(); refresh(); });
  [amt,selA,selB,desc].forEach(function(el){ el.addEventListener('input',refresh); });
  post.onclick=function(){
    var a=parseFloat(amt.value); if(!(a>0)) return; var t=type.value;
    if(t==='transfer' && selA.value===selB.value) return;
    post.disabled=true; post.textContent='Posting…';
    var payload = (t==='transfer')
      ? { date:date.value, amount:a, desc:desc.value, ref:ref.value, notes:notes.value, direction:'transfer', fromAccount:{code:selCode(selA),name:selA.value}, toAccount:{code:selCode(selB),name:selB.value} }
      : { date:date.value, amount:a, desc:desc.value, ref:ref.value, notes:notes.value, direction:t, moneyAccount:{code:selCode(selA),name:selA.value}, categoryAccount:{name:selB.value} };
    google.script.run
      .withSuccessHandler(function(res){ LEDGER_CACHE=null; render('entry');
        $('#flash').innerHTML='<div class="flash ok">✓ Posted '+esc(res.txnId)+' — balanced pair written to the ledger ('+money(a)+'). Open the General Ledger tab to see it.</div>'; })
      .withFailureHandler(function(e){ post.disabled=false; post.textContent='Post to ledger';
        $('#flash').innerHTML='<div class="flash err">Could not post: '+esc(e.message||e)+'</div>'; })
      .postTransaction(payload);
  };
  $('#clearbtn').onclick=function(){ render('entry'); };
  populate(); refresh();
}


var PO_CACHE=null, PO_FILTER='all', PO_EDIT_ROW=null, PO_MSG=null, PO_SHOW_NEW=false, PO_NEW_ITEMS=null;
var PO_PAGE=0, PO_PAGE_SIZE=25;   // the PO list is paged, 25 per page
var PO_TYPES=['Consumable','Customer Part','Bench Stock'];
var PO_STATUSES=['Open','Partially Received','Received','Closed/Paid','Cancelled'];
var PO_IMP=null, PO_IMP_BUSY=false, PO_IMP_ERR=null;   /* invoice PDF import */

function vPO(){
  return topbar('Purchase Orders','Create, track, receive and close POs — writes live to your PO System sheet','live · PO sheet')
   + '<div id="po-flash"></div>'
   + '<div id="po-wrap"><div class="miniload"><div class="spin"></div>Loading purchase orders…</div></div>';
}

function loadPO(){
  if(PO_CACHE){ paintPO(); return; }
  google.script.run
    .withSuccessHandler(function(d){ PO_CACHE=d; paintPO(); })
    .withFailureHandler(function(e){ var w=$('#po-wrap'); if(w) w.innerHTML='<div class="hint">Could not load POs: '+esc(e.message||e)+'</div>'; })
    .poGetData();
}

function poStatusLabel(status){ return status==='Closed/Paid'?'Closed':(status||'—'); }
function poPaidChip(p){
  if(p.status==='Cancelled') return '';
  if(p.paid) return '<span class="chip" style="background:#dcefe2;color:#256a3f;border-color:#256a3f33;font-weight:700;margin-left:6px">\u2713 Paid</span>'
    + '<button class="btn ghost" type="button" style="padding:2px 7px;font-size:11px;margin-left:4px" data-popaid="'+p.row+'" data-to="0" title="Mark unpaid">\u00d7</button>';
  return '<button class="btn ghost" type="button" style="padding:3px 9px;font-size:12px;margin-left:6px;border-color:#8a6d1e55;color:#8a6d1e" data-popaid="'+p.row+'" data-to="1">Mark paid</button>';
}
function poToday_(){ return new Date().toISOString().slice(0,10); }
function poChip(status){
  var map={
    'Open':['#8a6d1e','#fbf6e9'],
    'Partially Received':['#1c4e80','#dce7f2'],
    'Received':['#256a3f','#dcefe2'],
    'Closed/Paid':['#2B4865','#e7edf3'],
    'Cancelled':['#8a2f22','#f7e3df']
  };
  var c=map[status]||['#555','#eee'];
  return '<span class="chip" style="background:'+c[1]+';color:'+c[0]+';border-color:'+c[0]+'33;font-weight:700">'+esc(poStatusLabel(status))+'</span>';
}

function paintPO(){
  var d=PO_CACHE, w=$('#po-wrap'); if(!w) return;
  if(PO_MSG){ var f=$('#po-flash'); if(f) f.innerHTML='<div class="flash ok">'+esc(PO_MSG)+'</div>'; PO_MSG=null; }

  var tiles='<div class="grid g4" style="margin-bottom:6px">'
    + tile(d.openCount>0?'warn':'ok','Open POs',String(d.openCount),d.openCount>0?'awaiting parts / invoice':'all caught up')
    + tile((d.unpaid!=null?d.unpaid:d.outstanding)>0?'warn':'navy','Unpaid',money(d.unpaid!=null?d.unpaid:d.outstanding),(d.unpaid!=null)?'money still owed':'value of open POs')
    + tile('navy','POs This Year',String(d.ytdCount),'excludes cancelled')
    + tile('navy','YTD PO Spend',money(d.ytdSpend),'ordered to date')
    + '</div>';


  var newBtn='<div class="actions"><button class="btn gold" id="po-newtoggle">＋ New Purchase Order</button>'
    + '<button class="btn ghost" id="po-import">⤒ Import invoice PDF</button>'
    + '<input type="file" id="po-impfile" accept="application/pdf,.pdf" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">'
    + '<span class="pill">Next number: <b>'+esc(d.nextPO)+'</b></span></div>';

  var today=new Date().toISOString().slice(0,10);
  var typeOpts=''; for(var i=0;i<PO_TYPES.length;i++) typeOpts+='<option value="'+PO_TYPES[i]+'">'+PO_TYPES[i]+'</option>';
  var newForm = PO_SHOW_NEW ? (
      '<div class="card pad" id="po-newcard" style="margin-bottom:18px">'
      + '<div class="section-title" style="margin-top:0">New PO — '+esc(d.nextPO)+'</div>'
      + '<div class="form-row"><div><label>Vendor</label><input id="po-vendor" placeholder="e.g. Aircraft Spruce"></div>'
      + '<div><label>Type</label><select id="po-type">'+typeOpts+'</select></div></div>'
      + '<div class="form-row"><div><label>Work Order / Aircraft (N-Number)</label><input id="po-wo" placeholder="e.g. 1029 / N1234A  (or none)"></div>'
      + '<div><label>Date</label><input id="po-date" type="date" value="'+today+'"></div></div>'
      + '<label>Line items</label><div id="po-items"></div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0 4px">'
      +   '<button class="btn ghost" id="po-additem" type="button">＋ Add line</button>'
      +   '<div style="font-weight:800;font-size:16px">Total: <span id="po-grand">$0.00</span></div>'
      + '</div>'
      + '<div style="display:flex;gap:10px"><button class="btn" id="po-create">Create PO</button>'
      + '<button class="btn ghost" id="po-cancelnew">Cancel</button></div>'
      + '<div class="hint" style="margin-top:12px">Each line = Qty × Unit Price (or leave Qty blank and put a flat amount in Unit Price). The total and the PDF are built from these lines. Writes to the next open PO row, Status = Open.</div>'
      + '</div>'
    ) : '';


  var filters=[['all','All'],['open','Open / Partial'],['received','Received'],['closed','Closed / Cancelled']];
  var fbar='<div class="actions">';
  for(var g=0;g<filters.length;g++){
    fbar+='<button class="btn '+(PO_FILTER===filters[g][0]?'':'ghost')+'" data-pofilter="'+filters[g][0]+'">'+filters[g][1]+'</button>';
  }
  fbar+='</div>';


  var rows=d.rows.filter(poMatchesFilter);
  var poTotal=rows.length, poPages=Math.max(1,Math.ceil(poTotal/PO_PAGE_SIZE));
  if(PO_EDIT_ROW!=null){ for(var pe=0;pe<rows.length;pe++){ if(rows[pe].row===PO_EDIT_ROW){ PO_PAGE=Math.floor(pe/PO_PAGE_SIZE); break; } } }
  if(PO_PAGE>poPages-1) PO_PAGE=poPages-1; if(PO_PAGE<0) PO_PAGE=0;
  var poFrom=PO_PAGE*PO_PAGE_SIZE;
  rows=rows.slice(poFrom, poFrom+PO_PAGE_SIZE);
  var body='';
  if(!rows.length){
    body='<tr><td colspan="10" style="text-align:center;padding:22px;color:var(--muted)">No purchase orders match this filter.</td></tr>';
  } else {
    for(var r=0;r<rows.length;r++){
      var p=rows[r];
      if(PO_EDIT_ROW===p.row){ body+=poEditRow(p); continue; }
      body+='<tr>'
        + '<td style="font-weight:700;white-space:nowrap">'+esc(p.po)+'</td>'
        + '<td style="white-space:nowrap">'+esc(poFmtDate(p.date))+'</td>'
        + '<td>'+esc(p.vendor)+'</td>'
        + '<td>'+esc(p.wo)+'</td>'
        + '<td>'+esc(p.type)+'</td>'
        + '<td>'+esc(p.desc)+'</td>'
        + '<td style="white-space:nowrap">'+poChip(p.status)+poPaidChip(p)+'</td>'
        + '<td class="num">'+(p.total!=null?money(p.total):'')+'</td>'
        + '<td style="white-space:nowrap">'+esc(poFmtDate(p.received))+'</td>'
        + '<td style="white-space:nowrap">'+esc(p.invoice)+' <button class="btn ghost" style="padding:4px 10px;font-size:12px" data-popdf="'+p.row+'">PDF</button> <button class="btn ghost" style="padding:4px 10px;font-size:12px" data-poedit="'+p.row+'">Update</button></td>'
        + '</tr>';
    }
  }

  var table='<div class="card pad po-wrap"><div class="scroll"><table class="tb po-tbl"><thead><tr>'
    + '<th>PO #</th><th>Date</th><th>Vendor</th><th>WO / Aircraft</th><th>Type</th><th>Description</th>'
    + '<th>Status / Paid</th><th class="num">Total</th><th>Received</th><th>Invoice / Action</th>'
    + '</tr></thead><tbody>'+body+'</tbody></table></div></div>';

  var pager='';
  if(poTotal>PO_PAGE_SIZE){
    pager='<div class="po-pager"><button class="btn sm ghost" data-popage="-1"'+(PO_PAGE===0?' disabled':'')+'>‹ Prev</button>'
      +'<span>'+(poFrom+1)+'–'+Math.min(poFrom+PO_PAGE_SIZE,poTotal)+' of '+poTotal+'</span>'
      +'<button class="btn sm ghost" data-popage="1"'+(PO_PAGE>=poPages-1?' disabled':'')+'>Next ›</button></div>';
  }
  w.innerHTML=tiles+newBtn+poImpCard()+newForm+fbar+table+pager;
  wirePO();
}

function poMatchesFilter(p){
  if(PO_FILTER==='all') return true;
  if(PO_FILTER==='open') return p.status==='Open'||p.status==='Partially Received';
  if(PO_FILTER==='received') return p.status==='Received';
  if(PO_FILTER==='closed') return p.status==='Closed/Paid'||p.status==='Cancelled';
  return true;
}

function poFmtDate(iso){
  if(!iso) return '';
  var pt=String(iso).split('-'); if(pt.length!==3) return iso;
  return pt[1].replace(/^0/,'')+'/'+pt[2].replace(/^0/,'')+'/'+pt[0];
}

function poEditRow(p){
  var statusOpts=''; for(var i=0;i<PO_STATUSES.length;i++) statusOpts+='<option value="'+PO_STATUSES[i]+'"'+(p.status===PO_STATUSES[i]?' selected':'')+'>'+poStatusLabel(PO_STATUSES[i])+'</option>';
  return '<tr class="rev-row"><td style="font-weight:700">'+esc(p.po)+'</td>'
    + '<td colspan="9"><div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end">'
    + '<div style="min-width:150px"><label>Status</label><select class="poe-status">'+statusOpts+'</select></div>'
    + '<div style="min-width:140px"><label>Received date</label><input class="poe-received" type="date" value="'+esc(p.received||'')+'"></div>'
    + '<div style="min-width:90px"><label>Paid</label><label style="display:flex;align-items:center;gap:8px;text-transform:none;font-size:14px;font-weight:400;color:var(--ink);padding:9px 0"><input type="checkbox" class="poe-paid" style="width:auto;margin:0" data-paid="'+esc(p.paid||'')+'"'+(p.paid?' checked':'')+'> Paid</label></div>'
    + '<div style="min-width:130px"><label>Invoice #</label><input class="poe-invoice" value="'+esc(p.invoice||'')+'"></div>'
    + '<div style="min-width:120px"><label>Total</label><input class="poe-total" type="number" step="0.01" value="'+(p.total!=null?p.total:'')+'"></div>'
    + '<div style="display:flex;gap:8px"><button class="btn" data-posave="'+p.row+'">Save</button>'
    + '<button class="btn ghost" data-pocancel="1">Cancel</button>'
    + '<button class="btn" style="background:var(--bad)" data-podelete="'+p.row+'" data-ponum="'+esc(p.po)+'">Delete</button></div>'
    + '</div></td></tr>';
}


function poLineAmt(it){
  var q=parseFloat(it.qty), p=parseFloat(it.price);
  if(!isNaN(q)&&q!==0&&!isNaN(p)) return q*p;
  if(!isNaN(p)) return p;
  return 0;
}
function poGrandTotal(){ var t=0,a=PO_NEW_ITEMS||[]; for(var i=0;i<a.length;i++) t+=poLineAmt(a[i]); return t; }
function poUpdateGrand(){ var g=$('#po-grand'); if(g) g.innerHTML=money(poGrandTotal())||'$0.00'; }
function poRenderItems(){
  var box=$('#po-items'); if(!box) return;
  if(!PO_NEW_ITEMS) PO_NEW_ITEMS=[{qty:'',part:'',desc:'',price:''},{qty:'',part:'',desc:'',price:''},{qty:'',part:'',desc:'',price:''}];
  var h='<table class="tb" style="font-size:13px"><thead><tr>'
    +'<th style="width:60px">Qty</th><th style="width:120px">Part #</th><th>Description</th><th style="width:96px">Unit Price</th><th class="num" style="width:88px">Line</th><th style="width:32px"></th>'
    +'</tr></thead><tbody>';
  for(var i=0;i<PO_NEW_ITEMS.length;i++){ var it=PO_NEW_ITEMS[i];
    h+='<tr>'
      +'<td><input class="poi" data-i="'+i+'" data-f="qty" type="number" step="any" value="'+esc(it.qty)+'" style="padding:6px"></td>'
      +'<td><input class="poi" data-i="'+i+'" data-f="part" value="'+esc(it.part)+'" style="padding:6px"></td>'
      +'<td><input class="poi" data-i="'+i+'" data-f="desc" value="'+esc(it.desc)+'" style="padding:6px"></td>'
      +'<td><input class="poi" data-i="'+i+'" data-f="price" type="number" step="0.01" value="'+esc(it.price)+'" style="padding:6px"></td>'
      +'<td class="num" id="poi-amt-'+i+'">'+(money(poLineAmt(it))||'')+'</td>'
      +'<td><button class="btn ghost" type="button" data-poirm="'+i+'" style="padding:4px 9px">×</button></td>'
      +'</tr>';
  }
  h+='</tbody></table>';
  box.innerHTML=h;
  var ins=box.querySelectorAll('.poi');
  for(var k=0;k<ins.length;k++) ins[k].oninput=function(){
    var idx=parseInt(this.getAttribute('data-i'),10), f=this.getAttribute('data-f');
    PO_NEW_ITEMS[idx][f]=this.value;
    var c=$('#poi-amt-'+idx); if(c) c.innerHTML=money(poLineAmt(PO_NEW_ITEMS[idx]))||'';
    poUpdateGrand();
  };
  var rms=box.querySelectorAll('[data-poirm]');
  for(var m=0;m<rms.length;m++) rms[m].onclick=function(){
    var idx=parseInt(this.getAttribute('data-poirm'),10);
    PO_NEW_ITEMS.splice(idx,1);
    if(!PO_NEW_ITEMS.length) PO_NEW_ITEMS.push({qty:'',part:'',desc:'',price:''});
    poRenderItems();
  };
  poUpdateGrand();
}
function poIsIOS_(){ return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1); }
function poB64Blob_(b64, type){
  var bin=atob(b64), n=bin.length, u=new Uint8Array(n);
  for(var i=0;i<n;i++) u[i]=bin.charCodeAt(i);
  return new Blob([u],{type:type||'application/pdf'});
}
function poDownloadPdf(row, btn){
  if(btn){ btn.disabled=true; btn.textContent='…'; }
  /* iOS Safari ignores data: downloads and blocks window.open once the tap is over, so on
     iOS open the tab now, inside the tap, and drop the PDF into it when it comes back. */
  var win=null;
  if(poIsIOS_()){
    try{ win=window.open('','_blank'); }catch(e){ win=null; }
    if(win){ try{ win.document.write('<title>Building PDF…</title><p style="font-family:-apple-system,Helvetica,sans-serif;padding:24px;color:#2B4865">Building your PO PDF…</p>'); }catch(e){} }
  }
  google.script.run
    .withSuccessHandler(function(res){
      if(btn){ btn.disabled=false; btn.textContent='PDF'; }
      var url=URL.createObjectURL(poB64Blob_(res.b64,'application/pdf'));
      if(win){ win.location.href=url; return; }
      var a=document.createElement('a');
      a.href=url; a.download=res.filename||'PO.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); },60000);
    })
    .withFailureHandler(function(e){
      if(win){ try{ win.close(); }catch(x){} }
      if(btn){ btn.disabled=false; btn.textContent='PDF'; }
      alert('Could not build PDF: '+(e.message||e));
    })
    .poPdf(row);
}
function wirePO(){
  var t=$('#po-newtoggle'); if(t) t.onclick=function(){ PO_SHOW_NEW=!PO_SHOW_NEW; if(PO_SHOW_NEW) PO_NEW_ITEMS=null; paintPO(); };
  var cn=$('#po-cancelnew'); if(cn) cn.onclick=function(){ PO_SHOW_NEW=false; PO_NEW_ITEMS=null; paintPO(); };
  if(PO_SHOW_NEW){ poRenderItems(); var ai=$('#po-additem'); if(ai) ai.onclick=function(){ if(!PO_NEW_ITEMS) PO_NEW_ITEMS=[]; PO_NEW_ITEMS.push({qty:'',part:'',desc:'',price:''}); poRenderItems(); }; }

  poImpWire();

  var pbt=document.querySelectorAll('[data-popaid]');
  for(var pk=0;pk<pbt.length;pk++) pbt[pk].onclick=function(){
    var row=parseInt(this.getAttribute('data-popaid'),10), to=this.getAttribute('data-to')==='1';
    var b=this; b.disabled=true; b.textContent='\u2026';
    google.script.run
      .withSuccessHandler(function(d){ PO_CACHE=d; PO_MSG=to?'\u2713 PO marked paid.':'\u2713 PO marked unpaid.'; paintPO(); })
      .withFailureHandler(function(e){ b.disabled=false; b.textContent=to?'Mark paid':'\u00d7'; alert('Could not update: '+(e.message||e)); })
      .poUpdate(row,{paid: to?poToday_():''});
  };
  var fbtns=document.querySelectorAll('[data-pofilter]');
  for(var i=0;i<fbtns.length;i++) fbtns[i].onclick=function(){ PO_FILTER=this.getAttribute('data-pofilter'); PO_EDIT_ROW=null; PO_PAGE=0; paintPO(); };
  var pgb=document.querySelectorAll('[data-popage]');
  for(var pg=0;pg<pgb.length;pg++) pgb[pg].onclick=function(){ if(this.disabled) return; PO_PAGE+=parseInt(this.getAttribute('data-popage'),10); PO_EDIT_ROW=null; paintPO(); var tb=document.querySelector('.po-wrap'); if(tb) tb.scrollIntoView({block:'start'}); };

  var ebtns=document.querySelectorAll('[data-poedit]');
  for(var j=0;j<ebtns.length;j++) ebtns[j].onclick=function(){ PO_EDIT_ROW=parseInt(this.getAttribute('data-poedit'),10); paintPO(); };

  var pbtns=document.querySelectorAll('[data-popdf]');
  for(var q=0;q<pbtns.length;q++) pbtns[q].onclick=function(){ poDownloadPdf(parseInt(this.getAttribute('data-popdf'),10), this); };

  var cancel=document.querySelector('[data-pocancel]'); if(cancel) cancel.onclick=function(){ PO_EDIT_ROW=null; paintPO(); };

  var del=document.querySelector('[data-podelete]');
  if(del) del.onclick=function(){
    var row=parseInt(this.getAttribute('data-podelete'),10);
    var num=this.getAttribute('data-ponum')||row;
    if(!confirm('Delete PO '+num+'?\n\nThis clears its details and frees the number '+num+' to be used again. This cannot be undone.\n\n(To keep a record instead, set Status to Cancelled.)')) return;
    this.disabled=true; this.textContent='Deleting…';
    google.script.run
      .withSuccessHandler(function(d){ PO_CACHE=d; PO_EDIT_ROW=null; PO_MSG='✓ PO '+num+' deleted — number freed for reuse.'; paintPO(); })
      .withFailureHandler(function(e){ alert('Could not delete: '+(e.message||e)); })
      .poDelete(row);
  };

  var save=document.querySelector('[data-posave]');
  if(save) save.onclick=function(){
    var row=parseInt(this.getAttribute('data-posave'),10);
    var tr=this.closest('tr');
    var payload={
      status: tr.querySelector('.poe-status').value,
      received: tr.querySelector('.poe-received').value,
      paid: (function(cb){ return cb.checked ? (cb.getAttribute('data-paid')||poToday_()) : ''; })(tr.querySelector('.poe-paid')),
      invoice: tr.querySelector('.poe-invoice').value.trim(),
      total: tr.querySelector('.poe-total').value
    };
    this.disabled=true; this.textContent='Saving…';
    google.script.run
      .withSuccessHandler(function(d){ PO_CACHE=d; PO_EDIT_ROW=null; PO_MSG='✓ PO '+row+' updated.'; paintPO(); })
      .withFailureHandler(function(e){ alert('Could not save: '+(e.message||e)); })
      .poUpdate(row,payload);
  };

  var create=$('#po-create');
  if(create) create.onclick=function(){
    var vendor=$('#po-vendor').value.trim();
    if(!vendor){ $('#po-flash').innerHTML='<div class="flash err">Enter a vendor.</div>'; return; }
    var items=[];
    for(var ci=0;ci<(PO_NEW_ITEMS||[]).length;ci++){ var cit=PO_NEW_ITEMS[ci];
      if(String(cit.desc||'').trim()||String(cit.part||'').trim()||String(cit.qty)!==''||String(cit.price)!=='') items.push(cit); }
    if(!items.length){ $('#po-flash').innerHTML='<div class="flash err">Add at least one line item (a description or an amount).</div>'; return; }
    var payload={
      vendor:vendor,
      type:$('#po-type').value,
      wo:$('#po-wo').value.trim(),
      date:$('#po-date').value,
      status:'Open',
      items:items
    };
    create.disabled=true; create.textContent='Creating…';
    google.script.run
      .withSuccessHandler(function(d){ PO_CACHE=d; PO_SHOW_NEW=false; PO_NEW_ITEMS=null; PO_MSG='✓ Created PO '+(d.createdPO||'')+' for '+vendor+'.'; paintPO(); })
      .withFailureHandler(function(e){ create.disabled=false; create.textContent='Create PO'; $('#po-flash').innerHTML='<div class="flash err">'+esc(e.message||e)+'</div>'; })
      .poCreate(payload);
  };
}



/* ===================== Import invoice PDF — Purchase Orders ==============
 * Reads a vendor invoice PDF in the browser with PDF.js, using each text
 * item's x/y so column-positional layouts (Aircraft Spruce) survive, then
 * shows a review screen. Nothing reaches the sheet until Commit is pressed.
 * ------------------------------------------------------------------------ */
var PO_IMP=null, PO_IMP_BUSY=false, PO_IMP_ERR=null;
var PO_PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var PO_PDFJS_W='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
var PO_IMP_TERMS=['CREDIT CARD','NET 30','NET 15','NET 10','NET 60','PREPAID','COD'];

function poImpLoad(cb,bad){
  if(window.pdfjsLib){ cb(); return; }
  var s=document.createElement('script');
  s.src=PO_PDFJS;
  s.onload=function(){
    if(!window.pdfjsLib){ bad(new Error('The PDF reader loaded but did not start.')); return; }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc=PO_PDFJS_W;
    cb();
  };
  s.onerror=function(){ bad(new Error('Could not load the PDF reader — check your connection.')); };
  document.head.appendChild(s);
}

/* ---- text items -> positioned rows (vendor agnostic) ---- */
function poImpRows(items){
  var tol=2.2, rows=[], i, j, it, y, placed, r;
  for(i=0;i<items.length;i++){
    it=items[i];
    if(!it.str||!it.str.replace(/\s/g,'')) continue;
    y=Math.round(it.transform[5]*100)/100;
    placed=false;
    for(j=0;j<rows.length;j++){
      if(Math.abs(rows[j].y-y)<=tol){ rows[j].cells.push({x:it.transform[4],w:it.width||0,s:it.str}); placed=true; break; }
    }
    if(!placed) rows.push({y:y,cells:[{x:it.transform[4],w:it.width||0,s:it.str}]});
  }
  rows.sort(function(a,b){ return b.y-a.y; });
  for(i=0;i<rows.length;i++){
    r=rows[i];
    r.cells.sort(function(a,b){ return a.x-b.x; });
    r.text='';
    for(j=0;j<r.cells.length;j++){
      var gap = j>0 ? (r.cells[j].x-(r.cells[j-1].x+(r.cells[j-1].w||r.cells[j-1].s.length*3.2))) : 0;
      if(j>0 && gap>4) r.text+='  ';
      else if(j>0) r.text+=' ';
      r.text+=r.cells[j].s;
    }
    r.text=r.text.replace(/\s+$/,'');
  }
  return rows;
}
function poImpNum(s){ var x=parseFloat(String(s).replace(/[^0-9.\-]/g,'')); return isFinite(x)?x:0; }
function poImpFind(rows,re){ for(var i=0;i<rows.length;i++) if(re.test(rows[i].text)) return i; return -1; }
function poImpNext(rows,i){ for(var n=i+1;n<rows.length;n++) if(rows[n].text.replace(/\s/g,'')) return rows[n]; return null; }
function poImpKey(s){ return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }

/* ---- Aircraft Spruce ---- */
function poImpSpruce(rows){
  var o={vendor:'Aircraft Spruce',orderNo:'',invoiceNo:'',custPO:'',invoiceDate:'',shipVia:'',terms:'',
         items:[],subtotal:0,tax:0,misc:0,shipping:0,paidWithOrder:0,balanceDue:0,warnings:[]};
  var i,m,rest,k;

  i=poImpFind(rows,/ORDER\s*NO\.[\s\S]*INVOICE\s*NO\./i);
  if(i<0){ o.warnings.push('Could not find the invoice header row.'); }
  else{
    var hr=poImpNext(rows,i), raw=hr?hr.text.replace(/\s+/g,' ').replace(/^\s+/,''):'';
    m=raw.match(/^(\d{6,10})\s+(\d{6,10})\s*(.*)$/);
    if(!m){ o.warnings.push('Could not read the order and invoice numbers.'); }
    else{
      o.orderNo=m[1]; o.invoiceNo=m[2]; rest=m[3];
      m=rest.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*$/);
      if(m){ o.invoiceDate=m[1]; rest=rest.slice(0,m.index).replace(/\s+$/,''); }
      else o.warnings.push('No invoice date found.');
      for(k=0;k<PO_IMP_TERMS.length;k++){
        if(rest.toUpperCase().slice(-PO_IMP_TERMS[k].length)===PO_IMP_TERMS[k]){
          o.terms=PO_IMP_TERMS[k]; rest=rest.slice(0,rest.length-PO_IMP_TERMS[k].length).replace(/\s+$/,''); break;
        }
      }
      m=rest.match(/((?:UPS|FEDEX|FED EX|USPS|DHL|TRUCK|WILL CALL)[A-Z0-9 .\-]*)$/i);
      if(m){ o.shipVia=m[1].replace(/\s+$/,''); rest=rest.slice(0,m.index); }
      o.custPO=rest.replace(/^\s+|\s+$/g,'');
    }
  }

  var IT=/^\s*(\d+)\s+(?:(\d+)\s+)?(.+?)\s+(\d{1,2})%\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s*$/;
  for(i=0;i<rows.length;i++){
    m=rows[i].text.replace(/\s+/g,' ').replace(/^\s+|\s+$/g,'').match(IT);
    if(m) o.items.push({qty:parseInt(m[1],10),part:'',desc:m[3].replace(/^\s+|\s+$/g,''),
                        discountPct:parseInt(m[4],10),price:poImpNum(m[5]),amount:poImpNum(m[6])});
  }
  if(!o.items.length) o.warnings.push('No line items could be read.');

  i=poImpFind(rows,/SUBTOTAL[\s\S]*BALANCE\s*DUE/i);
  if(i<0) o.warnings.push('Could not find the totals row.');
  else{
    var tr=poImpNext(rows,i), nums=tr?(tr.text.match(/[\d,]+\.\d{2}/g)||[]):[];
    if(nums.length!==6) o.warnings.push('Expected six totals, read '+nums.length+'.');
    else{
      o.subtotal=poImpNum(nums[0]); o.tax=poImpNum(nums[1]); o.misc=poImpNum(nums[2]);
      o.shipping=poImpNum(nums[3]); o.paidWithOrder=poImpNum(nums[4]); o.balanceDue=poImpNum(nums[5]);
    }
  }
  return o;
}

/* ---- generic vendor parser: column geometry + sum verification ----
 * Works from the same positioned rows as the Spruce parser. Finds the line-item header
 * row by its column labels, maps every cell below it to the nearest column by x, reads
 * totals either vertically (label ... amount) or horizontally (label row / number row),
 * then checks the line sum against the subtotal. */
var PO_IMP_ROLE=[
  [/AMOUNT|EXTENSION|\bEXT\b|LINE\s*TOTAL|ITEM\s*TOTAL|\bTOTAL\b/i,'amount'],
  [/UNIT\s*PRICE|NET\s*PRICE|\bPRICE\b|\bRATE\b|\bEACH\b|\bCOST\b/i,'price'],
  [/\bQTY\b|QUANTITY|\bORDERED\b|\bSHIPPED\b/i,'qty'],
  [/PART\s*(?:NO|#|NUMBER)?|MODEL|\bSKU\b|ITEM\s*(?:NO|#|NUMBER)\b|\bP\/N\b/i,'part'],
  [/DESCRIPTION|\bDESC\b|\bITEM\b|PRODUCT|DETAILS/i,'desc'],
  [/DISCOUNT|\bDISC\b|\bTAX\b|\bBACK\b|\bUNIT\b|\bU\/M\b|\bUOM\b/i,'skip']
];
function poImpRole(s){ for(var i=0;i<PO_IMP_ROLE.length;i++) if(PO_IMP_ROLE[i][0].test(s)) return PO_IMP_ROLE[i][1]; return ''; }
function poImpMoney(s){ var m=String(s).replace(/,/g,'').match(/-?\$?\s*(\d+\.\d{2,3})\s*$/); return m?parseFloat(m[1]):null; }
function poImpIsMoney(s){ return /^\s*-?\$?\s*[\d,]+\.\d{2,3}\s*$/.test(String(s)); }
function poImpIsQty(s){ return /^\s*\d+(?:\.\d+)?\s*$/.test(String(s)); }
var PO_IMP_TOTKEY=[
  [/SUB\s*TOTAL|MERCHANDISE|ITEM\s*SUBTOTAL/i,'subtotal'],
  [/BALANCE\s*DUE|AMOUNT\s*DUE/i,'balanceDue'],
  [/PAID/i,'paidWithOrder'],
  [/SALES\s*TAX|ESTIMATED\s*TAX|\bTAX\b/i,'tax'],
  [/SHIPPING|FREIGHT|S\s*&\s*H|HANDLING|DELIVERY/i,'shipping'],
  [/MISC/i,'misc'],
  [/\bTOTAL\b/i,'total']
];
function poImpTotKey(s){ for(var i=0;i<PO_IMP_TOTKEY.length;i++) if(PO_IMP_TOTKEY[i][0].test(s)) return PO_IMP_TOTKEY[i][1]; return ''; }
var PO_IMP_MONTHS={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12};
function poImpDateUS(s){
  var m=String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(m) return m[1]+'/'+m[2]+'/'+m[3];
  m=String(s).match(/([A-Z][a-z]{2})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if(m && PO_IMP_MONTHS[m[1].toUpperCase()]) return PO_IMP_MONTHS[m[1].toUpperCase()]+'/'+m[2]+'/'+m[3];
  m=String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  if(m) return parseInt(m[2],10)+'/'+parseInt(m[3],10)+'/'+m[1];
  return '';
}

function poImpRuns(cells, gap){
  var out=[], i, c, last=null;
  for(i=0;i<cells.length;i++){
    c=cells[i];
    var w=(c.w||c.s.length*4.5), x1=c.x+w;
    if(last && (c.x-last.x1)<=gap){ last.s+=' '+c.s; last.x1=x1; }
    else { last={x:c.x,x1:x1,s:c.s}; out.push(last); }
  }
  for(i=0;i<out.length;i++) out[i].w=out[i].x1-out[i].x;
  return out;
}
function poImpGeneric(rows){
  var o={vendor:'',orderNo:'',invoiceNo:'',custPO:'',invoiceDate:'',shipVia:'',terms:'',
         items:[],subtotal:0,tax:0,misc:0,shipping:0,paidWithOrder:0,balanceDue:0,total:0,
         warnings:[],parser:'generic'};
  var i,j,m,r,t;
  var all=''; for(i=0;i<rows.length;i++) all+=rows[i].text+'\n';
  var flat=all.replace(/\s+/g,' ');

  /* vendor: a known vendor name anywhere, else the first short line */
  var known=(typeof PO_CACHE!=='undefined'&&PO_CACHE&&PO_CACHE.vendors)||[];
  for(i=0;i<known.length&&!o.vendor;i++){
    var nm=String(known[i].name||known[i]||'');
    if(nm && flat.toUpperCase().indexOf(nm.toUpperCase())>=0) o.vendor=nm;
  }
  if(!o.vendor){ for(i=0;i<rows.length;i++){ t=rows[i].text.replace(/^\s+|\s+$/g,''); if(t && t.length<48 && !/INVOICE|PAGE|DATE|^\d/i.test(t)){ o.vendor=t; break; } } }

  /* PO number: his own numbering shape anywhere on the page beats any label */
  m=flat.match(/\bCJ[\s\-]*(20\d{2})[\s\-]*(\d{3})\b/i);
  if(m) o.custPO='CJ-'+m[1]+'-'+m[2];
  else { m=flat.match(/(?:P\.?\s*O\.?|PURCHASE\s+ORDER)\s*(?:NUMBER|NO\.?|#)?\s*:?\s*([A-Z0-9][A-Z0-9\-]{2,18})/i); if(m && !/^(NUMBER|NO|BOX)$/i.test(m[1])) o.custPO=m[1]; }

  /* invoice / order numbers, date */
  m=flat.match(/INVOICE\s*(?:NUMBER|NO\.?|#)?\s*:?\s*#?\s*([A-Z\-]{0,4}\d[A-Z0-9\-]{2,})/i); if(m) o.invoiceNo=m[1];
  m=flat.match(/\bORDER\s*(?:NUMBER|NO\.?|#)\s*:?\s*#?\s*([A-Z\-]{0,4}\d[A-Z0-9\-]{3,})/i); if(m) o.orderNo=m[1];

  /* pre-printed-form headers: a row of labels with the values on the next row, matched by x */
  var LAB=[[/\bDATE\b/i,'invoiceDate'],[/\bINVOICE\b/i,'invoiceNo'],[/\bORDER\b/i,'orderNo'],[/\bP\.?\s*O\.?(?:\s|$|\.)|PURCHASE/i,'custPO'],[/\bSHIP/i,'shipVia'],[/\bTERMS\b/i,'terms']];
  for(i=0;i<rows.length-1;i++){
    var lr=poImpRuns(rows[i].cells,14), labels=[], k2;
    for(j=0;j<lr.length;j++){ if(/\d/.test(lr[j].s) || lr[j].s.length>28) { labels=[]; break; }
      for(k2=0;k2<LAB.length;k2++) if(LAB[k2][0].test(lr[j].s)){ labels.push({key:LAB[k2][1],cx:(lr[j].x+lr[j].x1)/2}); break; } }
    if(labels.length<2) continue;
    var vr=null; for(j=i+1;j<rows.length&&j<=i+3;j++){ if(rows[j].text.replace(/\s/g,'')){ vr=rows[j]; break; } }
    if(!vr) continue;
    var vrun=poImpRuns(vr.cells,9), got={};
    for(j=0;j<vrun.length;j++){
      var vcx=(vrun[j].x+vrun[j].x1)/2, bl=null, bdist=1e9;
      for(k2=0;k2<labels.length;k2++){ var dd=Math.abs(vcx-labels[k2].cx); if(dd<bdist){ bdist=dd; bl=labels[k2]; } }
      if(bl && bdist<120 && !got[bl.key]){ got[bl.key]=vrun[j].s.replace(/^\s+|\s+$/g,''); }
    }
    if(got.invoiceNo && /\d/.test(got.invoiceNo) && !o.invoiceNo) o.invoiceNo=got.invoiceNo;
    if(got.orderNo && /\d/.test(got.orderNo) && !o.orderNo) o.orderNo=got.orderNo;
    if(got.custPO && !o.custPO && !/^(UPS|FEDEX|NET|CREDIT)/i.test(got.custPO)) o.custPO=got.custPO;
    if(got.invoiceDate && !o.invoiceDate) o.invoiceDate=poImpDateUS(got.invoiceDate);
    if(got.shipVia && !o.shipVia && /^(UPS|FEDEX|FED EX|USPS|DHL|TRUCK|WILL CALL)/i.test(got.shipVia)){
      var tm=got.shipVia.match(/\s+(CREDIT CARD|NET\s*\d+|PREPAID|COD)\s*$/i);
      if(tm){ if(!got.terms) got.terms=tm[1]; got.shipVia=got.shipVia.slice(0,tm.index); }
      o.shipVia=got.shipVia;
    }
    if(got.terms && !o.terms && /CREDIT|NET|PREPAID|COD/i.test(got.terms)) o.terms=got.terms.toUpperCase();
    if(o.invoiceNo) break;
  }
  m=flat.match(/(?:INVOICE\s+)?DATE\s*:?\s*([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/i);
  if(m && !o.invoiceDate) o.invoiceDate=poImpDateUS(m[1]);
  if(!o.invoiceDate) o.invoiceDate=poImpDateUS(flat);
  m=all.match(/(?:SHIP\s*VIA|SHIPPED\s*VIA|CARRIER)\s*:?\s*((?:UPS|FEDEX|FED EX|USPS|DHL|TRUCK|WILL CALL)(?: [A-Z0-9.\-]+){0,4})/i); if(m) o.shipVia=m[1];
  m=all.match(/TERMS?\s*:?\s*(CREDIT CARD|NET\s*\d+|PREPAID|COD|DUE ON RECEIPT)/i); if(m) o.terms=m[1].toUpperCase();

  /* header row: the first row whose cells name at least two of qty / desc / price / amount */
  var H=-1, cols=[];
  for(i=0;i<rows.length;i++){
    var c=[], seen={}, score=0;
    var hr=poImpRuns(rows[i].cells,12);
    for(j=0;j<hr.length;j++){
      var cell=hr[j], role=poImpRole(cell.s);
      if(!role) continue;
      c.push({role:role,x0:cell.x,x1:cell.x1});
      if(role!=='skip' && !seen[role]){ seen[role]=1; score++; }
    }
    if(score>=2 && (seen.amount||seen.price)){ H=i; cols=c; break; }
  }
  if(H<0) o.warnings.push('Could not find the line-item columns on this invoice — totals only; add the lines yourself.');
  /* merge a second header line (e.g. "SHIPPED" under "QUANTITY") into the same columns */
  for(i=H+1;H>=0&&i<rows.length&&i<=H+2;i++){
    var allRoleOrBlank=true;
    for(j=0;j<rows[i].cells.length;j++){ if(!poImpRole(rows[i].cells[j].s)) { allRoleOrBlank=false; break; } }
    if(allRoleOrBlank) H=i; else break;
  }

  /* totals: vertical rows "label ... 12.34", or a horizontal label row followed by a number row */
  var T=rows.length, tot={};
  for(i=(H<0?0:H+1);i<rows.length;i++){
    t=rows[i].text.replace(/^\s+|\s+$/g,'');
    m=t.match(/^([A-Za-z][A-Za-z&.\/ ]{2,34}?)\s*:?\s*\$?\s*(-?[\d,]+\.\d{2})\s*$/);
    if(m){ var k=poImpTotKey(m[1]); if(k){ if(tot[k]==null) tot[k]=poImpMoney(m[2]); if(T===rows.length) T=i; continue; } }
    var labs=t.split(/\s{2,}/), keys=[], allLab=labs.length>=2;
    for(j=0;j<labs.length&&allLab;j++){ var kk=poImpTotKey(labs[j]); if(!kk||/\d\.\d{2}/.test(labs[j])) allLab=false; else keys.push(kk); }
    if(allLab){
      var nr=null; for(j=i+1;j<rows.length;j++){ if(rows[j].text.replace(/\s/g,'')){ nr=rows[j]; break; } }
      var nums=nr?(nr.text.match(/-?[\d,]+\.\d{2}/g)||[]):[];
      if(nums.length===keys.length){ for(j=0;j<keys.length;j++) if(tot[keys[j]]==null) tot[keys[j]]=poImpMoney(nums[j]); if(T===rows.length) T=i; }
    }
  }
  o.subtotal=tot.subtotal||0; o.tax=tot.tax||0; o.shipping=tot.shipping||0; o.misc=tot.misc||0;
  o.paidWithOrder=tot.paidWithOrder||0; o.balanceDue=(tot.balanceDue!=null)?tot.balanceDue:0; o.total=tot.total||0;
  if(!o.subtotal && o.total) o.subtotal=Math.round((o.total-o.tax-o.shipping-o.misc)*100)/100;
  if(!o.subtotal) o.warnings.push('No subtotal or total found — the line-item check cannot run.');
  if(H<0) return o;

  /* line items: every row between the header and the totals, cells mapped to columns by x */
  function colFor(cell){
    var cx=cell.x+((cell.x1?cell.x1-cell.x:(cell.w||cell.s.length*4.5))/2), best=null, bd=1e9, k;
    for(k=0;k<cols.length;k++){
      var inside=(cx>=cols[k].x0-6 && cx<=cols[k].x1+6);
      var d=Math.abs(cx-(cols[k].x0+cols[k].x1)/2)-(inside?40:0);
      if(d<bd){ bd=d; best=cols[k]; }
    }
    return (best&&bd<140)?best.role:'desc';
  }
  var hasQtyCol=false; for(i=0;i<cols.length;i++) if(cols[i].role==='qty') hasQtyCol=true;
  var last=null;
  for(i=H+1;i<T;i++){
    r=rows[i]; t=r.text.replace(/^\s+|\s+$/g,'');
    if(!t) continue;
    if(poImpTotKey(t.split(/\s{2,}/)[0]) && /\d\.\d{2}\s*$/.test(t) && !/^\d/.test(t)) continue;
    var it={qty:'',part:'',desc:'',price:'',amount:null}, descParts=[], sawNum=false;
    var runs=poImpRuns(r.cells,12);
    for(j=0;j<runs.length;j++){
      var cell=runs[j], s=cell.s.replace(/^\s+|\s+$/g,''), role=colFor(cell);
      var numeric=poImpIsMoney(s)||poImpIsQty(s)||/^[\d.,$%\-]+$/.test(s);
      if(role==='skip' && (numeric || s.length<=4)) continue;
      if(role==='amount' && poImpIsMoney(s)){ it.amount=poImpMoney(s); sawNum=true; continue; }
      if(role==='price'  && poImpIsMoney(s)){ it.price=poImpMoney(s); sawNum=true; continue; }
      if(role==='qty'    && poImpIsQty(s)){ it.qty=parseFloat(s); continue; }
      if(role==='part' && !numeric){ it.part=(it.part?it.part+' ':'')+s; continue; }
      if(j===0 && it.qty==='' && poImpIsQty(s) && role!=='amount' && role!=='price'){ it.qty=parseFloat(s); continue; }
      if(numeric && (role==='amount'||role==='price'||role==='skip')) continue;
      descParts.push(s);
    }
    it.desc=descParts.join(' ').replace(/\s+/g,' ');
    if(it.qty==='' && !hasQtyCol){ m=it.desc.match(/^(\d+)\s+(.+)$/); if(m){ it.qty=parseInt(m[1],10); it.desc=m[2]; } }
    if(it.amount==null && it.price!=='' && it.qty!=='') it.amount=Math.round(it.qty*it.price*100)/100;
    if(it.amount!=null && (it.desc||it.part)){
      if(it.price==='' && it.qty>0) it.price=Math.round(it.amount/it.qty*1000)/1000;
      if(it.qty==='') it.qty=1;
      o.items.push({qty:it.qty,part:it.part,desc:it.desc,price:it.price,amount:it.amount});
      last=o.items[o.items.length-1];
    } else if(last && !sawNum && it.qty==='' && it.desc && !/THANK|NOTE|PLEASE|TERMS|REMIT|VISIT|QUESTION|RETURN|WARRANT|CERTIF|PAGE|SIGNATURE|SHORTAGE/i.test(t)
              && Math.abs(rows[i-1].y-r.y)<20){
      last.desc=(last.desc+' '+it.desc).replace(/\s+/g,' ');
    }
  }
  if(!o.items.length) o.warnings.push('No line items could be read.');
  return o;
}

function poImpParse(rows){
  var all='',i;
  for(i=0;i<rows.length && i<40;i++) all+=rows[i].text+'\n';
  if(/AIRCRAFT\s+SPRUCE/i.test(all)){ var sp=poImpSpruce(rows); sp.parser='spruce'; return sp; }
  return poImpGeneric(rows);
}

/* ---- seed the editable review state ---- */
function poImpSeed(p){
  var i,sum=0;
  for(i=0;i<p.items.length;i++) sum+=p.items[i].amount;
  sum=Math.round(sum*100)/100;
  var iso='';
  if(p.invoiceDate){
    var d=p.invoiceDate.split('/');
    if(d.length===3){
      var yy=d[2].length===2?('20'+d[2]):d[2];
      iso=yy+'-'+('0'+d[0]).slice(-2)+'-'+('0'+d[1]).slice(-2);
    }
  }
  var pre=p.custPO?p.custPO:((PO_CACHE&&PO_CACHE.nextPO)||'');
  var paidUp=(p.paidWithOrder>0 && (p.balanceDue||0)===0);
  return {parsed:p, po:pre, matchedFromInvoice:!!p.custPO,
          vendor:p.vendor||'', wo:'', type:'Customer Part', status:'Open',
          date:iso||new Date().toISOString().slice(0,10),
          paid:paidUp?(iso||new Date().toISOString().slice(0,10)):'', paidAuto:paidUp,
          shipping:p.shipping?p.shipping.toFixed(2):'0.00',
          tax:p.tax?p.tax.toFixed(2):'0.00',
          items:p.items.slice(0), lineSum:sum};
}
function poImpFail(e){
  PO_IMP_BUSY=false; PO_IMP=null;
  PO_IMP_ERR=(e&&e.message)?e.message:String(e);
  paintPO();
}
function poImpOnFile(file){
  if(!file) return;
  if(!/\.pdf$/i.test(file.name)){ PO_IMP_ERR='That is not a PDF.'; paintPO(); return; }
  PO_IMP_ERR=null; PO_IMP=null; PO_IMP_BUSY=true; paintPO();
  poImpLoad(function(){
    var fr=new FileReader();
    fr.onload=function(){
      try{
        window.pdfjsLib.getDocument({data:new Uint8Array(fr.result)}).promise
          .then(function(doc){ return doc.getPage(1).then(function(pg){ return pg.getTextContent(); }); })
          .then(function(tc){
            var p=poImpParse(poImpRows(tc.items));
            p.fileName=file.name;
            PO_IMP=poImpSeed(p); PO_IMP_BUSY=false; paintPO();
          })['catch'](poImpFail);
      }catch(err){ poImpFail(err); }
    };
    fr.onerror=function(){ poImpFail(new Error('Could not read that file.')); };
    fr.readAsArrayBuffer(file);
  }, poImpFail);
}

/* ---- live figures ---- */
function poImpSum(){
  var t=0,a=(PO_IMP&&PO_IMP.items)||[],i;
  for(i=0;i<a.length;i++) t+=(Number(a[i].qty)||0)*(Number(a[i].price)||0);
  return Math.round(t*100)/100;
}
function poImpVerified(){
  if(!PO_IMP) return false;
  var s=PO_IMP.parsed.subtotal;
  if(!s) return PO_IMP.items.length>0;
  return Math.abs(poImpSum()-s)<0.005;
}
function poImpTotal(){
  return Math.round((poImpSum()+(Number(PO_IMP.shipping)||0)+(Number(PO_IMP.tax)||0))*100)/100;
}

/* ---- the review card ---- */
function poImpCard(){
  if(PO_IMP_BUSY) return '<div class="card pad" style="margin-bottom:18px"><div class="miniload"><div class="spin"></div>Reading the invoice…</div></div>';
  if(PO_IMP_ERR) return '<div class="card pad" style="margin-bottom:18px"><div class="flash err">'+esc(PO_IMP_ERR)+'</div>'
    + '<div class="actions" style="margin-top:10px"><button class="btn ghost" id="poimp-close">Close</button></div></div>';
  if(!PO_IMP) return '';

  var p=PO_IMP.parsed, i;
  var ok=poImpVerified(), sum=poImpSum();

  var head='<div class="section-title" style="margin-top:0">Import invoice — '+esc(p.fileName||'')+'</div>';

  var banner;
  if(PO_IMP.matchedFromInvoice)
    banner='<div class="flash ok">Invoice carries PO number <b>'+esc(p.custPO)+'</b>.</div>';
  else
    banner='<div class="flash busy">No PO number printed on this invoice. Filing it as <b>'+esc(PO_IMP.po||'—')+'</b>'
      +((PO_CACHE&&PO_CACHE.nextPO)?' (next available is '+esc(PO_CACHE.nextPO)+')':'')+'.</div>';

  var warn='';
  if(p.warnings && p.warnings.length){
    warn='<div class="flash err" style="margin-top:8px">';
    for(i=0;i<p.warnings.length;i++) warn+=(i?'<br>':'')+esc(p.warnings[i]);
    warn+='</div>';
  }

  var read='<div class="card pad" style="margin:0"><div class="section-title" style="margin-top:0">Read from the PDF</div>'
    + '<div class="hint" style="margin:-6px 0 8px">'+(p.parser==='spruce'?'Aircraft Spruce parser':'Generic parser \u2014 columns matched by position; check the lines before you commit')+'</div>'
    + '<table class="tb"><tbody>'
    + poImpKV('Vendor',p.vendor)
    + poImpKV('Order no.',p.orderNo)
    + poImpKV('Invoice no.',p.invoiceNo)
    + poImpKV('Cust P.O. no.',p.custPO||'— not present —')
    + poImpKV('Invoice date',p.invoiceDate)
    + poImpKV('Ship via',p.shipVia)
    + poImpKV('Terms',p.terms)
    + poImpKV('Subtotal',p.subtotal?money(p.subtotal):'')
    + poImpKV('Freight',p.shipping?money(p.shipping):'$0.00')
    + poImpKV('Tax',p.tax?money(p.tax):'$0.00')
    + poImpKV('Paid with order',p.paidWithOrder?money(p.paidWithOrder):'')
    + poImpKV('Balance due',p.balanceDue!=null?money(p.balanceDue):'')
    + '</tbody></table></div>';

  var typeOpts='',statOpts='';
  for(i=0;i<PO_TYPES.length;i++) typeOpts+='<option value="'+PO_TYPES[i]+'"'+(PO_TYPES[i]===PO_IMP.type?' selected':'')+'>'+PO_TYPES[i]+'</option>';
  for(i=0;i<PO_STATUSES.length;i++) statOpts+='<option value="'+PO_STATUSES[i]+'"'+(PO_STATUSES[i]===PO_IMP.status?' selected':'')+'>'+poStatusLabel(PO_STATUSES[i])+'</option>';

  var form='<div class="card pad" style="margin:0"><div class="section-title" style="margin-top:0">Writes to the PO Log</div>'
    + '<div class="form-row"><div><label>PO number</label><input id="poimp-po" value="'+esc(PO_IMP.po)+'"></div>'
    + '<div><label>Vendor</label><input id="poimp-vendor" value="'+esc(PO_IMP.vendor)+'"></div></div>'
    + '<div class="form-row"><div><label>Work Order / Aircraft (N-Number)</label><input id="poimp-wo" value="'+esc(PO_IMP.wo)+'" placeholder="required"></div>'
    + '<div><label>Type</label><select id="poimp-type">'+typeOpts+'</select></div></div>'
    + '<div class="form-row"><div><label>Status</label><select id="poimp-status">'+statOpts+'</select></div>'
    + '<div><label>Date</label><input id="poimp-date" type="date" value="'+esc(PO_IMP.date)+'"></div></div>'
    + '<div class="form-row"><div><label>Shipping</label><input id="poimp-ship" value="'+esc(PO_IMP.shipping)+'"></div>'
    + '<div><label>Tax</label><input id="poimp-tax" value="'+esc(PO_IMP.tax)+'"></div></div>'
    + '<div class="form-row"><div><label>Paid</label>'
    +   '<label style="display:flex;align-items:center;gap:8px;text-transform:none;font-size:14px;font-weight:400;color:var(--ink);padding:9px 0"><input type="checkbox" id="poimp-paid" style="width:auto;margin:0"'+(PO_IMP.paid?' checked':'')+'> Paid</label>'
    +   '<div class="hint">'+(PO_IMP.paidAuto?'Ticked for you — the invoice shows paid with order, balance due $0.00.':'Tick it if you have already paid this.')+'</div></div>'
    + '<div></div></div>'
    + '</div>';

  var body='';
  for(i=0;i<PO_IMP.items.length;i++){
    var it=PO_IMP.items[i];
    body+='<tr>'
      + '<td><input class="poimp-i" data-i="'+i+'" data-f="qty" type="number" step="any" value="'+esc(it.qty)+'" style="padding:6px"></td>'
      + '<td><input class="poimp-i" data-i="'+i+'" data-f="part" value="'+esc(it.part||'')+'" style="padding:6px"></td>'
      + '<td><input class="poimp-i" data-i="'+i+'" data-f="desc" value="'+esc(it.desc||'')+'" style="padding:6px"></td>'
      + '<td><input class="poimp-i" data-i="'+i+'" data-f="price" type="number" step="0.001" value="'+esc(it.price)+'" style="padding:6px"></td>'
      + '<td class="num" id="poimp-amt-'+i+'">'+money((Number(it.qty)||0)*(Number(it.price)||0))+'</td>'
      + '<td><button class="btn ghost" type="button" data-poimprm="'+i+'" style="padding:4px 9px">×</button></td>'
      + '</tr>';
  }
  var itemsTbl='<div class="card pad" style="margin-top:14px"><div class="section-title" style="margin-top:0">Line items</div>'
    + '<div class="scroll"><table class="tb"><thead><tr>'
    + '<th style="width:70px">Qty</th><th style="width:120px">Part #</th><th>Description</th>'
    + '<th style="width:100px">Unit price</th><th class="num" style="width:92px">Line</th><th style="width:32px"></th>'
    + '</tr></thead><tbody>'+body+'</tbody></table></div>'
    + '<div class="poimp-foot">'
    +   '<button class="btn ghost" id="poimp-additem" type="button">＋ Add line</button>'
    +   '<div><span class="hint">Line items <b id="poimp-sum">'+money(sum)+'</b>'
    +     (p.subtotal?(' &nbsp;·&nbsp; invoice subtotal <b>'+money(p.subtotal)+'</b>'):'')+'</span> '
    +     '<span class="chip" id="poimp-chk" style="'+(ok?'background:#dcefe2;color:#256a3f;border-color:#256a3f33':'background:#f7e3df;color:#8a2f22;border-color:#8a2f2233')+'">'
    +     (ok?'✓ parse verified':'⚠ off by '+money(Math.abs(Math.round((sum-p.subtotal)*100)/100)))+'</span></div>'
    + '</div>'
    + '<div class="poimp-foot" style="border:0;padding-top:4px"><span></span>'
    +   '<div style="font-weight:800;font-size:16px">Order total: <span id="poimp-grand">'+money(poImpTotal())+'</span></div></div>'
    + '</div>';

  var acts='<div class="actions" style="margin-top:14px">'
    + '<button class="btn gold" id="poimp-commit">Commit to PO Log</button>'
    + '<button class="btn ghost" id="poimp-close">Cancel</button>'
    + '<span class="hint" id="poimp-hint"></span></div>';

  return '<div class="card pad" id="poimp-card" style="margin-bottom:18px">'
    + head + banner + warn
    + '<div class="poimp-cols">'+read+form+'</div>'
    + itemsTbl + acts + '</div>';
}
function poImpKV(k,v){
  return '<tr><td style="color:#5c6771;width:46%">'+esc(k)+'</td><td>'+esc(v||'—')+'</td></tr>';
}

function poImpRepaintTotals(){
  var sum=poImpSum(), p=PO_IMP.parsed, ok=poImpVerified();
  var s=$('#poimp-sum'); if(s) s.innerHTML=money(sum);
  var g=$('#poimp-grand'); if(g) g.innerHTML=money(poImpTotal());
  var c=$('#poimp-chk');
  if(c){
    c.innerHTML=ok?'✓ parse verified':'⚠ off by '+money(Math.abs(Math.round((sum-p.subtotal)*100)/100));
    c.style.cssText=ok?'background:#dcefe2;color:#256a3f;border-color:#256a3f33':'background:#f7e3df;color:#8a2f22;border-color:#8a2f2233';
  }
  poImpGate();
}
function poImpGate(){
  var b=$('#poimp-commit'), h=$('#poimp-hint');
  if(!b) return;
  var wo=$('#poimp-wo')?$('#poimp-wo').value.replace(/^\s+|\s+$/g,''):'';
  var po=$('#poimp-po')?$('#poimp-po').value.replace(/^\s+|\s+$/g,''):'';
  var why='';
  if(!po) why='Enter the PO number this belongs to.';
  else if(!wo) why='Enter a work order before committing.';
  else if(!poImpVerified()) why='Totals disagree with the invoice — fix them or cancel.';
  else if(!PO_IMP.items.length) why='Add at least one line item.';
  b.disabled=!!why;
  if(h) h.innerHTML=why?esc(why):'Ready. Nothing has been written yet.';
}

function poImpWire(){
  var openBtn=$('#po-import'), input=$('#po-impfile');
  if(openBtn&&input){
    openBtn.onclick=function(){ input.value=''; input.click(); };
    input.onchange=function(){ poImpOnFile(this.files&&this.files[0]); };
  }
  var close=$('#poimp-close');
  if(close) close.onclick=function(){ PO_IMP=null; PO_IMP_ERR=null; paintPO(); };
  if(!PO_IMP) return;

  var f=['po','vendor','wo','type','status','date','ship','tax'];
  var pcb=$('#poimp-paid'); if(pcb) pcb.onchange=function(){ PO_IMP.paid=this.checked?(PO_IMP.date||poToday_()):''; };
  for(var k=0;k<f.length;k++){
    (function(name){
      var el=$('#poimp-'+name); if(!el) return;
      el.oninput=el.onchange=function(){
        var key=(name==='ship')?'shipping':name;
        PO_IMP[key]=this.value;
        if(name==='ship'||name==='tax'){ var g=$('#poimp-grand'); if(g) g.innerHTML=money(poImpTotal()); }
        poImpGate();
      };
    })(f[k]);
  }

  var ins=document.querySelectorAll('.poimp-i');
  for(var i=0;i<ins.length;i++) ins[i].oninput=function(){
    var idx=parseInt(this.getAttribute('data-i'),10), fld=this.getAttribute('data-f');
    PO_IMP.items[idx][fld]=(fld==='qty'||fld==='price')?this.value:this.value;
    var c=$('#poimp-amt-'+idx);
    if(c) c.innerHTML=money((Number(PO_IMP.items[idx].qty)||0)*(Number(PO_IMP.items[idx].price)||0));
    poImpRepaintTotals();
  };
  var rms=document.querySelectorAll('[data-poimprm]');
  for(var r=0;r<rms.length;r++) rms[r].onclick=function(){
    PO_IMP.items.splice(parseInt(this.getAttribute('data-poimprm'),10),1);
    paintPO();
  };
  var add=$('#poimp-additem');
  if(add) add.onclick=function(){ PO_IMP.items.push({qty:'',part:'',desc:'',price:''}); paintPO(); };

  var commit=$('#poimp-commit');
  if(commit) commit.onclick=function(){
    var payload={
      poNumber:$('#poimp-po').value.replace(/^\s+|\s+$/g,''),
      vendor:$('#poimp-vendor').value.replace(/^\s+|\s+$/g,''),
      wo:$('#poimp-wo').value.replace(/^\s+|\s+$/g,''),
      type:$('#poimp-type').value,
      status:$('#poimp-status').value,
      date:$('#poimp-date').value,
      invoice:PO_IMP.parsed.invoiceNo||'',
      shipping:$('#poimp-ship').value,
      tax:$('#poimp-tax').value,
      paid:($('#poimp-paid')&&$('#poimp-paid').checked)?(PO_IMP.date||poToday_()):'',
      items:PO_IMP.items
    };
    commit.disabled=true; commit.textContent='Committing…';
    google.script.run
      .withSuccessHandler(function(d){
        PO_CACHE=d; PO_IMP=null; PO_IMP_ERR=null;
        PO_MSG='✓ Imported invoice into PO '+(d.createdPO||payload.poNumber)+' for '+payload.vendor+'.';
        paintPO();
      })
      .withFailureHandler(function(e){
        commit.disabled=false; commit.textContent='Commit to PO Log';
        var h=$('#poimp-hint'); if(h) h.innerHTML=esc(e.message||e);
      })
      .poCreate(payload);
  };
  poImpGate();
}


var PAY_CACHE=null, PAY_MSG=null, PAY_PANEL=null, PAY_TEDIT=null;
var PAY_PER_PAGE=50, PAY_TPAGE=0, PAY_PPAGE=0;
var PAY_TSORT='date', PAY_TDIR=-1;
var PAY_JOB='';
var PAY_JOB_ALL = false;
function payJobIsOpen_(num){
  var w = PAY_CACHE.workOrdersAll||[], i;
  for(i=0;i<w.length;i++){
    if(String(w[i].num||'').trim() === String(num) && String(w[i].status||'').trim().toLowerCase() === 'open') return true;
  }
  return false;
}
function payJobOptions_(){
  var seen={}, list=[], i, n;
  var w=PAY_CACHE.workOrdersAll||[];
  for(i=0;i<w.length;i++){ n=String(w[i].num||'').trim(); if(n && !seen[n]){ seen[n]=1; list.push({num:n,desc:w[i].desc||'',status:w[i].status||''}); } }
  var t=PAY_CACHE.recentTime||[];
  for(i=0;i<t.length;i++){ n=String(t[i].wo||'').trim(); if(n && !seen[n]){ seen[n]=1; list.push({num:n,desc:'',status:''}); } }
  if(!PAY_JOB_ALL){ var keep=[]; for(i=0;i<list.length;i++){ if(String(list[i].status||'').trim().toLowerCase() === 'open') keep.push(list[i]); } list=keep; }
  list.sort(function(a,b){
    var an=parseFloat(String(a.num).replace(/[^0-9.]/g,'')), bn=parseFloat(String(b.num).replace(/[^0-9.]/g,''));
    if(!isNaN(an)&&!isNaN(bn)) return bn-an;
    return String(b.num).localeCompare(String(a.num));
  });
  var h='<option value="">\u2014 pick a work order \u2014</option>';
  for(i=0;i<list.length;i++){
    var lab=list[i].num+(list[i].desc?' \u2014 '+list[i].desc:'');
    if(list[i].status && list[i].status.toLowerCase()!=='open') lab+=' ('+list[i].status+')';
    h+='<option value="'+esc(list[i].num)+'"'+(PAY_JOB===list[i].num?' selected':'')+'>'+esc(lab)+'</option>';
  }
  return h;
}
function payClockCard_(){
  var c=PAY_CACHE.onTheClock||[];
  if(!c.length) return '';
  var rows='';
  for(var i=0;i<c.length;i++){
    var job = c[i].wo
      ? ('WO '+esc(c[i].wo)+(c[i].desc?' \u00b7 '+esc(c[i].desc):''))
      : '<span style="color:var(--muted)">no work order</span>';
    rows+='<tr><td style="font-weight:700;white-space:nowrap">'+esc(c[i].name)+'</td>'
      + '<td>'+job+'</td>'
      + '<td class="num" style="color:var(--muted);white-space:nowrap">in since '+esc(c[i].since)+'</td>'
      + '<td class="num" style="font-weight:700;white-space:nowrap">'+(Number(c[i].hrs)||0).toFixed(2)+' hrs</td></tr>';
  }
  return '<div class="card pad" style="margin-bottom:18px;border-left:4px solid var(--ok)">'
    + '<div class="section-title" style="margin-top:0">'
    + '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--ok);margin-right:7px"></span>'
    + 'On the clock now \u2014 '+c.length
    + (PAY_CLOCK_AT?'<span style="float:right;font-weight:400;font-size:11px;letter-spacing:0;text-transform:none;color:var(--muted)">live \u00b7 checked '+PAY_CLOCK_AT+'</span>':'')
    + '</div>'
    + '<div class="scroll"><table class="tb"><tbody>'+rows+'</tbody></table></div></div>';
}
/* On the clock — live. Re-checks every minute while Payroll is showing and the
   moment the tab comes back into view; redraws only the card, never the page. */
var PAY_CLOCK_TIMER=null, PAY_CLOCK_AT='';
function payClockStamp_(){ var d=new Date(),h=d.getHours(),m=d.getMinutes(); return (h%12||12)+':'+(m<10?'0':'')+m+(h<12?' AM':' PM'); }
function payClockPoll_(){
  if(!$('#pay-wrap')){ if(PAY_CLOCK_TIMER){ clearInterval(PAY_CLOCK_TIMER); PAY_CLOCK_TIMER=null; } return; }
  google.script.run
    .withSuccessHandler(function(rows){
      if(!PAY_CACHE) return;
      PAY_CACHE.onTheClock=rows||[]; PAY_CLOCK_AT=payClockStamp_();
      var el=$('#pay-clock-wrap'); if(el) el.innerHTML=payClockCard_();
    })
    .withFailureHandler(function(e){ console.error('on-the-clock refresh failed', e); })
    .payOnTheClock();
}
function payClockStart_(){ if(!PAY_CLOCK_TIMER) PAY_CLOCK_TIMER=setInterval(payClockPoll_, 60*1000); }
document.addEventListener('visibilitychange', function(){ if(!document.hidden && $('#pay-wrap')) payClockPoll_(); });
function payJobCard_(){
  var h='<div class="card pad" style="margin-bottom:18px">'
    + '<div class="section-title" style="margin-top:0">Time by work order</div>'
    + '<div class="form-row" style="margin-bottom:0"><div><label>Work order</label>'
    + '<select id="job-pick">'+payJobOptions_()+'</select></div><div><label class="hint" style="display:flex;align-items:center;gap:7px;margin-top:22px"><input type="checkbox" id="job-all" style="width:auto;margin:0"'+(PAY_JOB_ALL?' checked':'')+'> Show closed work orders</label></div></div>';
  if(!PAY_JOB) return h+'<div class="hint" style="margin-top:10px">Pick a work order to see every hour logged against it.</div>'+payJobClose_()+'</div>';
  return h+payJobDetail_()+payJobClose_()+'</div>';
}
function payJobClose_(){
  return '<div style="display:flex;gap:10px;margin-top:14px"><button class="btn ghost" id="job-close">Close</button></div>';
}
function payJobDetail_(){
  var t=PAY_CACHE.recentTime||[], rows=[], i;
  for(i=0;i<t.length;i++){ if(String(t[i].wo||'').trim()===PAY_JOB) rows.push(t[i]); }
  if(!rows.length) return '<div class="hint" style="margin-top:10px">No time logged to WO '+esc(PAY_JOB)+' yet.</div>';
  rows.sort(function(a,b){
    var r=String(a.date||'').localeCompare(String(b.date||''));
    return r!==0?r:((a.row||0)-(b.row||0));
  });
  var hrs=0, amt=0, byName={}, order=[];
  for(i=0;i<rows.length;i++){
    hrs+=(rows[i].hours||0); amt+=(rows[i].amount||0);
    var nm=rows[i].employee||'(unnamed)';
    if(!byName[nm]){ byName[nm]={h:0,a:0}; order.push(nm); }
    byName[nm].h+=(rows[i].hours||0); byName[nm].a+=(rows[i].amount||0);
  }
  hrs=Math.round(hrs*100)/100; amt=Math.round(amt*100)/100;
  order.sort(function(a,b){ return byName[b].h-byName[a].h; });
  var first=rows[0].date, last=rows[rows.length-1].date;
  var tiles='<div class="grid g4" style="margin:14px 0 6px">'
    + tile('navy','Total Hours',hrs.toFixed(2),rows.length+(rows.length===1?' entry':' entries'))
    + tile('navy','Labor Cost',money(amt),'at the rates logged')
    + tile('navy','People',String(order.length),order.length===1?'worked this job':'worked this job')
    + tile('navy','Worked',first?payD(first):'\u2014',last&&last!==first?('through '+payD(last)):'single day')
    + '</div>';
  var pb='';
  for(i=0;i<order.length;i++){
    var o=byName[order[i]];
    pb+='<tr><td style="font-weight:700">'+esc(order[i])+'</td>'
      + '<td class="num">'+(Math.round(o.h*100)/100).toFixed(2)+'</td>'
      + '<td class="num">'+money(Math.round(o.a*100)/100)+'</td></tr>';
  }
  pb+='<tr class="tot"><td>TOTAL</td><td class="num">'+hrs.toFixed(2)+'</td><td class="num">'+money(amt)+'</td></tr>';
  var eb='';
  for(i=0;i<rows.length;i++){
    eb+='<tr><td style="white-space:nowrap">'+esc(payD(rows[i].date))+'</td>'
      + '<td>'+esc(rows[i].employee)+'</td>'
      + '<td class="num">'+(rows[i].hours||0).toFixed(2)+'</td>'
      + '<td class="num">'+money(rows[i].amount)+'</td>'
      + '<td>'+esc(rows[i].notes||'')+'</td></tr>';
  }
  return tiles
    + '<div class="grid g2" style="margin-top:10px">'
    + '<div><div class="section-title">Hours by person</div><div class="scroll"><table class="tb"><thead><tr><th>Employee</th><th class="num">Hours</th><th class="num">Cost</th></tr></thead><tbody>'+pb+'</tbody></table></div></div>'
    + '<div><div class="section-title">Every entry on this job</div><div class="scroll"><table class="tb"><thead><tr><th>Date</th><th>Employee</th><th class="num">Hrs</th><th class="num">Amount</th><th>Notes</th></tr></thead><tbody>'+eb+'</tbody></table></div></div>'
    + '</div>';
}
function payThSort_(key,label,cls){
  var arrow='';
  if(PAY_TSORT===key) arrow=' <span style="font-size:9px">'+(PAY_TDIR<0?'\u25BC':'\u25B2')+'</span>';
  return '<th'+(cls?' class="'+cls+'"':'')+' style="cursor:pointer;-webkit-user-select:none;user-select:none" data-tsort="'+key+'">'+label+arrow+'</th>';
}
function paySortTime_(rows){
  var k=PAY_TSORT, d=PAY_TDIR, out=rows.slice();
  out.sort(function(a,b){
    var av,bv;
    if(k==='employee'){ av=String(a.employee||'').trim(); bv=String(b.employee||'').trim(); }
    else if(k==='wo'){ av=String(a.wo||'').trim(); bv=String(b.wo||'').trim(); }
    else { av=String(a.date||'').trim(); bv=String(b.date||'').trim(); }
    /* blanks always sink, whichever way the column is sorted */
    if(!av && !bv) return (a.row||0)-(b.row||0);
    if(!av) return 1;
    if(!bv) return -1;
    var r=0;
    if(k==='employee') r=av.toLowerCase().localeCompare(bv.toLowerCase());
    else if(k==='wo'){
      var an=parseFloat(av.replace(/[^0-9.]/g,'')), bn=parseFloat(bv.replace(/[^0-9.]/g,''));
      r=(!isNaN(an)&&!isNaN(bn)) ? (an-bn) : av.localeCompare(bv);
    }
    else r=av.localeCompare(bv);
    if(r===0) return ((a.row||0)-(b.row||0))*d;
    return r*d;
  });
  return out;
}
function payPages_(total){ return Math.max(1, Math.ceil(total/PAY_PER_PAGE)); }
function payPageOf_(kind,total){
  var pages=payPages_(total), p=(kind==='t'?PAY_TPAGE:PAY_PPAGE);
  if(p>pages-1) p=pages-1; if(p<0) p=0;
  if(kind==='t') PAY_TPAGE=p; else PAY_PPAGE=p;
  return p;
}
function payPageSlice_(rows,kind){
  var p=payPageOf_(kind,rows.length);
  return rows.slice(p*PAY_PER_PAGE, p*PAY_PER_PAGE+PAY_PER_PAGE);
}
function payPager_(kind,total){
  if(total<=PAY_PER_PAGE) return '';
  var p=payPageOf_(kind,total), pages=payPages_(total);
  var from=p*PAY_PER_PAGE+1, to=Math.min(total,(p+1)*PAY_PER_PAGE);
  return '<span style="float:right;font-size:11px;color:var(--muted);font-weight:600">'
    + '<button class="btn ghost" style="padding:2px 8px;font-size:11px;width:auto" data-pgprev="'+kind+'"'+(p<=0?' disabled':'')+'>&lsaquo;</button> '
    + from+'&ndash;'+to+' of '+total+' '
    + '<button class="btn ghost" style="padding:2px 8px;font-size:11px;width:auto" data-pgnext="'+kind+'"'+(p>=pages-1?' disabled':'')+'>&rsaquo;</button></span>';
}

function vPay(){
  return topbar('Payroll','Hours, pay owed, and payments — live from your Pay Tracker sheet','live · pay sheet')
   + '<div id="pay-flash"></div>'
   + '<div id="pay-wrap"><div class="miniload"><div class="spin"></div>Loading payroll…</div></div>';
}
function loadPay(){
  if(PAY_CACHE){ paintPay(); return; }
  google.script.run
    .withSuccessHandler(function(d){ PAY_CACHE=d; paintPay(); })
    .withFailureHandler(function(e){ var w=$('#pay-wrap'); if(w) w.innerHTML='<div class="hint">Could not load pay data: '+esc(e.message||e)+'</div>'; })
    .payGetData();
}
function payEmpOptions(sel){ var r=PAY_CACHE.roster, h='<option value="">— pick —</option>'; for(var i=0;i<r.length;i++) h+='<option value="'+esc(r[i].name)+'"'+(sel===r[i].name?' selected':'')+'>'+esc(r[i].name)+'</option>'; return h; }
function payWoOptions(){ var w=PAY_CACHE.workOrders,h=''; for(var i=0;i<w.length;i++) h+='<option value="'+esc(w[i].num)+'">'+esc(w[i].num)+(w[i].desc?' — '+esc(w[i].desc):'')+'</option>'; return h; }
function payFromOptions(sel){ var o=PAY_CACHE.paidFromOptions,h=''; for(var i=0;i<o.length;i++) h+='<option value="'+esc(o[i])+'"'+(sel===o[i]?' selected':'')+'>'+esc(o[i])+'</option>'; return h; }
function payRateFor(name){ var r=PAY_CACHE.roster; for(var i=0;i<r.length;i++) if(r[i].name===name) return r[i].rate; return ''; }
function payBalFor(name){ var s=PAY_CACHE.summary; for(var i=0;i<s.length;i++) if(s[i].name===name) return s[i].balance; return 0; }
function payD(iso){ if(!iso) return ''; var p=String(iso).split('-'); if(p.length!==3) return iso; return p[1].replace(/^0/,'')+'/'+p[2].replace(/^0/,'')+'/'+p[0]; }
function payM(n){ return money(n)||'$0.00'; }

function paintPay(){
  var d=PAY_CACHE, w=$('#pay-wrap'); if(!w) return;
  if(PAY_MSG){ var f=$('#pay-flash'); if(f) f.innerHTML='<div class="flash ok">'+esc(PAY_MSG)+'</div>'; PAY_MSG=null; }
  var t=d.totals;
  var tiles='<div class="grid g4" style="margin-bottom:6px">'
    + tile('navy','Total Earned',money(t.earned),'labor logged')
    + tile('navy','Total Paid',money(t.paid),'paid to date')
    + tile(t.balance>0.005?'red':'ok','Balance Owed',(t.balance>0.005?'<span class="neg">'+payM(t.balance)+'</span>':payM(t.balance)),t.balance>0.005?'still owed to crew':'all settled')
    + tile('navy','Total Hours',(t.hours||0).toFixed(2),'logged')
    + '</div>';

  var actions='<div class="actions pay-actions">'
    + '<button class="btn gold" id="pay-logtime">＋ Log Time</button>'
    + '<button class="btn" id="pay-record">＋ Record Payment</button>'
    + '<button class="btn ghost" id="pay-runpayroll">💸 Run Payroll</button>'
    + '<button class="btn ghost" id="pay-import">⤓ Import from GL</button>'
    + '<button class="btn ghost" id="pay-emp">👥 Employees</button>'
    + '<button class="btn ghost" id="pay-job">\u{1F551} Job Time</button>'
    + '</div>';

  var panel='';
  if(PAY_PANEL==='time') panel=payTimeForm();
  else if(PAY_PANEL==='pay') panel=payPaymentForm();
  else if(PAY_PANEL==='payroll') panel=payPayrollPanel();
  else if(PAY_PANEL==='emp') panel=payEmpPanel();
  else if(PAY_PANEL==='job') panel=payJobCard_();

  var body='', narrow='';
  for(var i=0;i<d.summary.length;i++){ var s=d.summary[i];
    var bal = (s.balance>0.005)
      ? '<span style="color:var(--warn);font-weight:800">'+payM(s.balance)+'</span>'
      : '<span style="color:var(--muted)">'+payM(s.balance)+'</span>';
    var meta = [];
    if(s.role) meta.push(esc(s.role));
    if(s.rate!=='') meta.push(money(s.rate)+'/hr');
    meta.push((s.hours||0).toFixed(2)+' hrs');
    var dates = [];
    if(s.hire) dates.push('Hired '+esc(s.hire));
    if(s.raise) dates.push('Raise '+esc(s.raise));
    narrow += '<div class="sum-card"><div class="sum-top">'
      + '<span class="sum-name">'+esc(s.name)+'</span><span>'+bal+'</span></div>'
      + '<div class="sum-meta">'+meta.join(' \u00b7 ')
      + '<br>Earned '+money(s.earned)+' \u00b7 Paid '+money(s.paid)
      + (dates.length ? '<br>'+dates.join(' \u00b7 ') : '')
      + '</div></div>';
    body+='<tr><td style="font-weight:700">'+esc(s.name)+'</td>'
      + '<td>'+esc(s.role||'')+'</td><td class="num">'+esc(s.hire||'')+'</td><td class="num">'+esc(s.raise||'')+'</td>'
      + '<td class="num">'+(s.rate!==''?money(s.rate):'')+'</td>'
      + '<td class="num">'+money(s.earned)+'</td><td class="num">'+money(s.paid)+'</td>'
      + '<td class="num"'+(s.balance>0.005?' style="color:var(--warn);font-weight:800"':'')+'>'+payM(s.balance)+'</td>'
      + '<td class="num">'+(s.hours||0).toFixed(2)+'</td></tr>';
  }
  body+='<tr class="tot"><td>TOTAL</td><td></td><td></td><td></td><td></td><td class="num">'+money(t.earned)+'</td><td class="num">'+money(t.paid)+'</td><td class="num">'+payM(t.balance)+'</td><td class="num">'+(t.hours||0).toFixed(2)+'</td></tr>';
  var summary='<div class="card pad" style="margin-bottom:18px"><div class="section-title" style="margin-top:0">Summary by employee</div><div class="pay-sum-wide"><div class="scroll"><table class="tb" style="table-layout:fixed;min-width:860px"><thead><tr><th style="width:17%">Employee</th><th style="width:12%">Role / Notes</th><th class="num" style="width:11%">Hire Date</th><th class="num" style="width:11%">Last Raise</th><th class="num" style="width:10%">Rate</th><th class="num" style="width:11%">Earned</th><th class="num" style="width:11%">Paid</th><th class="num" style="width:9%">Balance</th><th class="num" style="width:8%">Hours</th></tr></thead><tbody>'+body+'</tbody></table></div></div>'
    + '<div class="pay-sum-narrow">'+narrow
    + '<div class="sum-tot"><span>TOTAL</span><span>'+payM(t.balance)+' owed \u00b7 '+(t.hours||0).toFixed(2)+' hrs</span></div></div></div>';

  var recent='<div class="grid g2" style="margin-top:6px"><div>'+payRecentTime(d.recentTime)+'</div><div>'+payRecentPay(d.recentPay)+'</div></div>';

  w.innerHTML=tiles+actions+panel+'<div id="pay-clock-wrap">'+payClockCard_()+'</div>'+summary+payWoPanel()+recent;
  wirePay();
  payClockStart_();
}

function payRecentTime(rows){
  rows=paySortTime_(rows);
  var _tot=rows.length; rows=payPageSlice_(rows,'t');
  var b='';
  for(var i=0;i<rows.length;i++){ var r=rows[i];
    if(PAY_TEDIT===r.row){ b+=payTimeEditRow(r); continue; }
    b+='<tr><td style="white-space:nowrap">'+esc(payD(r.date))+'</td><td>'+esc(r.employee)+'</td><td>'+esc(r.wo)+'</td>'
      + '<td class="num">'+(r.hours||0).toFixed(2)+'</td><td class="num">'+money(r.amount)+'</td>'
      + '<td style="white-space:nowrap"><button class="btn ghost" style="padding:3px 8px;font-size:11px" data-ptedit="'+r.row+'">Edit</button> '
      + '<button class="btn ghost" style="padding:3px 8px;font-size:11px" data-ptdel="'+r.row+'">✕</button></td></tr>';
  }
  if(!b) b='<tr><td colspan="6" style="color:var(--muted);padding:14px;text-align:center">No time logged yet.</td></tr>';
  return '<div class="card pad"><div class="section-title" style="margin-top:0">Time entries'+payPager_('t',_tot)+'</div><div class="scroll"><table class="tb"><thead><tr>'+payThSort_('date','Date')+payThSort_('employee','Employee')+payThSort_('wo','WO')+'<th class="num">Hrs</th><th class="num">Amount</th><th></th></tr></thead><tbody>'+b+'</tbody></table></div></div>';
}
function payTimeEditRow(r){
  return '<tr class="rev-row"><td colspan="6"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:end">'
    + '<div style="width:120px"><label>Date</label><input class="pte-date" type="date" value="'+esc(r.date)+'"></div>'
    + '<div style="min-width:150px"><label>Employee</label><select class="pte-emp">'+payEmpOptions(r.employee)+'</select></div>'
    + '<div style="width:90px"><label>WO/Job</label><input class="pte-wo" value="'+esc(r.wo)+'"></div>'
    + '<div style="width:70px"><label>Hours</label><input class="pte-hours" type="number" step="0.01" value="'+esc(r.hours||'')+'"></div>'
    + '<div style="width:80px"><label>Rate</label><input class="pte-rate" type="number" step="0.01" placeholder="auto"></div>'
    + '<div style="width:80px"><label>Flat $</label><input class="pte-flat" type="number" step="0.01" value="'+esc(r.flat||'')+'"></div>'
    + '<div style="min-width:130px;flex:1"><label>Notes</label><input class="pte-notes" value="'+esc(r.notes||'')+'"></div>'
    + '<div style="display:flex;gap:6px"><button class="btn" data-ptsave="'+r.row+'">Save</button>'
    + '<button class="btn ghost" data-ptcancel="1">Cancel</button>'
    + '<button class="btn" style="background:var(--bad)" data-ptdel2="'+r.row+'">Delete</button></div>'
    + '</div></td></tr>';
}
function payRecentPay(rows){
  var _tot=rows.length; rows=payPageSlice_(rows,'p');
  var b='';
  for(var i=0;i<rows.length;i++){ var r=rows[i];
    b+='<tr><td style="white-space:nowrap">'+esc(payD(r.date))+'</td><td>'+esc(r.employee)+'</td><td class="num">'+money(r.amount)+'</td><td>'+esc(r.paidFrom)+'</td>'
      + '<td><button class="btn ghost" style="padding:3px 8px;font-size:11px" data-ppdel="'+r.row+'">✕</button></td></tr>';
  }
  if(!b) b='<tr><td colspan="5" style="color:var(--muted);padding:14px;text-align:center">No payments yet.</td></tr>';
  return '<div class="card pad"><div class="section-title" style="margin-top:0">Payments'+payPager_('p',_tot)+'</div><div class="scroll"><table class="tb"><thead><tr><th>Date</th><th>Employee</th><th class="num">Amount</th><th>From</th><th></th></tr></thead><tbody>'+b+'</tbody></table></div></div>';
}

function payTimeForm(){
  return '<div class="card pad" style="margin-bottom:18px"><div class="section-title" style="margin-top:0">Log time</div>'
    + '<div class="form-row"><div><label>Employee</label><select id="pt-emp">'+payEmpOptions()+'</select></div><div><label>Date</label><input id="pt-date" type="date" value="'+PAY_CACHE.today+'"></div></div>'
    + '<div class="form-row"><div><label>Work Order / Job</label><input id="pt-wo" list="pt-wolist" placeholder="e.g. 1029"><datalist id="pt-wolist">'+payWoOptions()+'</datalist></div><div><label>Invoice # (optional)</label><input id="pt-inv"></div></div>'
    + '<div class="form-row"><div><label>Hours (hourly)</label><input id="pt-hours" type="number" step="0.01" min="0" placeholder="e.g. 4.5"></div><div><label>Rate ($/hr)</label><input id="pt-rate" type="number" step="0.01" min="0" placeholder="auto"></div></div>'
    + '<div class="form-row"><div><label>Flat $ (overrides hourly)</label><input id="pt-flat" type="number" step="0.01" min="0" placeholder="leave blank if hourly"></div><div><label>Amount</label><input id="pt-amt" readonly style="background:#f4f1e6;font-weight:800"></div></div>'
    + '<div style="margin-bottom:16px"><label>Notes</label><input id="pt-notes" placeholder="e.g. Gary annual"></div>'
    + '<div style="display:flex;gap:10px"><button class="btn" id="pt-save">Log time</button><button class="btn ghost" id="pt-cancel">Cancel</button></div>'
    + '<div class="hint" style="margin-top:12px">Rate auto-fills from the roster (type over it for a custom rate). Amount = Flat $ if given, otherwise Hours × Rate.</div></div>';
}
function payPaymentForm(){
  return '<div class="card pad" style="margin-bottom:18px"><div class="section-title" style="margin-top:0">Record payment</div>'
    + '<div class="form-row"><div><label>Employee</label><select id="pp-emp">'+payEmpOptions()+'</select><div class="hint" id="pp-owed"></div></div><div><label>Date paid</label><input id="pp-date" type="date" value="'+PAY_CACHE.today+'"></div></div>'
    + '<div class="form-row"><div><label>Amount paid (USD)</label><input id="pp-amt" type="number" step="0.01" min="0" placeholder="0.00"></div><div><label>Paid from</label><select id="pp-from">'+payFromOptions()+'</select></div></div>'
    + '<div style="margin-bottom:16px"><label>Notes (optional)</label><input id="pp-notes" placeholder="e.g. Payroll thru 7/28"></div>'
    + '<div style="display:flex;gap:10px"><button class="btn" id="pp-save">Record payment</button><button class="btn ghost" id="pp-cancel">Cancel</button></div>'
    + '<div class="hint" style="margin-top:12px">Logs a row on the Payments tab, just like your sheet. Send the money separately.</div></div>';
}
function payPayrollPanel(){
  var owed=[]; for(var i=0;i<PAY_CACHE.summary.length;i++){ var s=PAY_CACHE.summary[i]; if(s.balance>0.005) owed.push(s); }
  var rowsH='', total=0;
  for(var j=0;j<owed.length;j++){ total+=owed[j].balance; rowsH+='<tr><td>'+esc(owed[j].name)+'</td><td class="num">'+money(owed[j].balance)+'</td></tr>'; }
  if(!owed.length) return '<div class="card pad" style="margin-bottom:18px"><div class="section-title" style="margin-top:0">Run payroll</div><div class="hint">Nobody is owed anything right now — balance is settled.</div><div style="margin-top:10px"><button class="btn ghost" id="pr-cancel">Close</button></div></div>';
  return '<div class="card pad" style="margin-bottom:18px"><div class="section-title" style="margin-top:0">Run payroll — pay everyone owed</div>'
    + '<div class="scroll" style="max-width:360px"><table class="tb"><thead><tr><th>Employee</th><th class="num">Owed</th></tr></thead><tbody>'+rowsH
    + '<tr class="tot"><td>TOTAL</td><td class="num">'+money(total)+'</td></tr></tbody></table></div>'
    + '<div class="form-row" style="margin-top:14px"><div><label>Paid from</label><select id="pr-from">'+payFromOptions()+'</select></div><div><label>Date</label><input id="pr-date" type="date" value="'+PAY_CACHE.today+'"></div></div>'
    + '<div style="display:flex;gap:10px"><button class="btn" id="pr-run">Confirm &amp; record '+owed.length+' payment(s)</button><button class="btn ghost" id="pr-cancel">Cancel</button></div>'
    + '<div class="hint" style="margin-top:12px">Logs a payment for each balance on the Payments tab. Then actually send the money.</div></div>';
}
function payShortLink_(u){
  u=String(u||''); if(!u) return '';
  var k=u.indexOf('key=');
  return k>-1 ? '\u2026/exec?'+u.slice(k) : u.slice(0,34)+'\u2026';
}
function payLinkCell_(u, who){
  if(!u || u.indexOf('?key=')<0) return '<button class="btn ghost" style="padding:3px 8px;font-size:11px;width:auto" data-pegen="'+esc(who||'')+'">Generate link</button>';
  return '<button class="btn ghost" style="padding:3px 8px;font-size:11px;width:auto" data-pecopy="'+esc(u)+'">Copy link</button>'
    + ' <a class="btn ghost" style="padding:3px 8px;font-size:11px;width:auto;text-decoration:none" href="'+esc(u)+'" target="_blank" rel="noopener">Open</a>';
}
function payCopy_(txt, btn){
  var done=function(){ if(btn){ var t=btn.textContent; btn.textContent='Copied'; setTimeout(function(){ btn.textContent=t; },1200); } };
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(done, function(){ payCopyFallback_(txt); done(); }); return; }
  }catch(e){}
  payCopyFallback_(txt); done();
}
function payCopyFallback_(txt){
  var ta=document.createElement('textarea');
  ta.value=txt; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); }catch(e){}
  document.body.removeChild(ta);
}
function payWoPanel(){
  var all=PAY_CACHE.workOrdersAll||[], w=[], rowsH='';
  for(var f=0;f<all.length;f++){ if(String(all[f].status||'').toLowerCase()==='open') w.push(all[f]); }
  for(var i=0;i<w.length;i++){
    var blank = !w[i].desc;
    var dim = blank ? ';color:var(--muted)' : '';
    rowsH+='<tr><td style="font-weight:700;white-space:nowrap'+dim+'">'+esc(w[i].num)+'</td>'
      + '<td><input class="wo-desc" data-num="'+esc(w[i].num)+'" value="'+esc(w[i].desc||'')+'" placeholder="no description" style="width:230px;padding:6px"></td>'
      + '<td><select class="wo-status" data-num="'+esc(w[i].num)+'" style="width:110px;padding:6px">'+payWoStatusOpts_(w[i].status)+'</select></td>'
      + '<td style="white-space:nowrap"><button class="btn ghost" style="padding:4px 9px;font-size:12px;width:auto" data-wosave="'+esc(w[i].num)+'">Save</button> '
      + '<button class="btn" style="background:var(--bad);padding:4px 9px;font-size:12px;width:auto" data-wodel="'+esc(w[i].num)+'">Delete</button></td></tr>';
  }
  if(!rowsH) rowsH='<tr><td colspan="4" style="color:var(--muted);padding:14px;text-align:center">No open work orders. Add one below.</td></tr>';
  return '<div class="card pad" style="margin-bottom:18px"><div class="section-title" style="margin-top:0">Manage work orders</div>'
    + '<div class="hint" style="margin:-4px 0 12px">These are the jobs your crew picks from on their time clock pages.</div>'
    + '<div class="scroll"><table class="tb"><thead><tr><th>WO #</th><th>Description</th><th>Status</th><th></th></tr></thead><tbody>'+rowsH+'</tbody></table></div>'
    + '<div class="form-row" style="margin-top:16px"><div><label>New WO #</label><input id="wo-newnum" value="'+esc(PAY_CACHE.nextWo||'')+'" style="width:110px"></div>'
    + '<div><label>Description</label><input id="wo-newdesc" placeholder="e.g. Cherokee 100hr"></div></div>'
    + '<div style="display:flex;gap:10px"><button class="btn" id="wo-add">Add work order</button></div></div>';
}
function payWoStatusOpts_(sel){
  var o=['','Open','Closed'], h='';
  for(var i=0;i<o.length;i++){
    var lab = o[i]===''?'\u2014':o[i];
    h+='<option value="'+o[i]+'"'+(String(sel||'')===o[i]?' selected':'')+'>'+lab+'</option>';
  }
  return h;
}
function payEmpPanel(){
  var r=PAY_CACHE.roster, rowsH='';
  for(var i=0;i<r.length;i++){
    rowsH+='<tr><td style="font-weight:700;white-space:nowrap">'+esc(r[i].name)+'</td>'
      + '<td><input class="pe-rate" data-name="'+esc(r[i].name)+'" type="number" step="0.01" value="'+esc(r[i].rate)+'" style="width:90px;padding:6px"></td>'
      + '<td><input class="pe-role" data-name="'+esc(r[i].name)+'" value="'+esc(r[i].role||'')+'" placeholder="e.g. A&amp;P" style="width:150px;padding:6px"></td>'
      + '<td><input class="pe-raise" data-name="'+esc(r[i].name)+'" type="date" value="'+esc(r[i].raiseIso||'')+'" style="width:150px;padding:6px"></td>'
      + '<td><input class="pe-hire" data-name="'+esc(r[i].name)+'" type="date" value="'+esc(r[i].hireIso||'')+'" style="width:150px;padding:6px"></td>'
      + '<td style="white-space:nowrap">'+payLinkCell_(r[i].link, r[i].name)+'</td>'
      + '<td style="white-space:nowrap"><button class="btn ghost" style="padding:4px 9px;font-size:12px" data-pesave="'+esc(r[i].name)+'">Save</button> '
      + '<button class="btn" style="background:var(--bad);padding:4px 9px;font-size:12px" data-pedel="'+esc(r[i].name)+'">Delete</button></td></tr>';
  }
  return '<div class="card pad" style="margin-bottom:18px"><div class="section-title" style="margin-top:0">Manage employees</div>'
    + '<div class="scroll pe-wrap"><table class="tb pe-tbl"><thead><tr><th>Name</th><th>Rate $/hr</th><th>Role / Notes</th><th>Last Pay Raise</th><th>Hire Date</th><th>Time clock link</th><th></th></tr></thead><tbody>'+rowsH+'</tbody></table></div>'
    + '<div class="form-row" style="margin-top:16px"><div><label>New employee</label><input id="pe-name" placeholder="Full name"></div><div><label>Default rate ($/hr)</label><input id="pe-newrate" type="number" step="0.01" placeholder="e.g. 25"></div></div>'
    + '<div class="form-row"><div><label>Role / Notes</label><input id="pe-newrole" placeholder="e.g. A&amp;P"></div><div><label>Last pay raise</label><input id="pe-newraise" type="date"></div><div><label>Hire date</label><input id="pe-newhire" type="date"></div></div>'
    + '<div style="display:flex;gap:10px"><button class="btn" id="pe-add">Add employee</button><button class="btn ghost" id="pe-close">Close</button></div>'
    + '<div class="hint" style="margin-top:12px">Deleting first locks that person\'s past Time Log amounts so their history stays intact, then removes them from the roster and revokes their time clock link.</div></div>';
}

function payRun(fn, arg1, arg2, okMsg, btn){
  if(btn){ btn.disabled=true; btn._t=btn.textContent; btn.textContent='…'; }
  var h=google.script.run
    .withSuccessHandler(function(d){ PAY_CACHE=d; PAY_PANEL=null; PAY_TEDIT=null; PAY_MSG=(typeof okMsg==='function')?okMsg(d):okMsg; paintPay(); })
    .withFailureHandler(function(e){ if(btn){ btn.disabled=false; btn.textContent=btn._t; } alert('Error: '+(e.message||e)); });
  if(arg2!==undefined) h[fn](arg1,arg2); else if(arg1!==undefined) h[fn](arg1); else h[fn]();
}

function wirePay(){
  var jp=$('#job-pick'); if(jp) jp.onchange=function(){ PAY_JOB=this.value; paintPay(); };
  var ja = $('#job-all'); if(ja) ja.onchange = function(){ PAY_JOB_ALL = this.checked; if(!PAY_JOB_ALL && PAY_JOB && !payJobIsOpen_(PAY_JOB)) PAY_JOB=''; paintPay(); };
  var jc=$('#job-close'); if(jc) jc.onclick=function(){ PAY_PANEL=null; paintPay(); };
  var ths=document.querySelectorAll('[data-tsort]');
  for(var t=0;t<ths.length;t++) ths[t].onclick=function(){
    var k=this.getAttribute('data-tsort');
    if(PAY_TSORT===k) PAY_TDIR=-PAY_TDIR;
    else { PAY_TSORT=k; PAY_TDIR=(k==='date'?-1:1); }
    PAY_TPAGE=0;
    paintPay();
  };
  var pgs=document.querySelectorAll('[data-pgprev],[data-pgnext]');
  for(var g=0;g<pgs.length;g++) pgs[g].onclick=function(){
    var nx=this.getAttribute('data-pgnext'), pv=this.getAttribute('data-pgprev');
    var kind=nx||pv, step=nx?1:-1;
    if(kind==='t') PAY_TPAGE+=step; else PAY_PPAGE+=step;
    paintPay();
  };
  var lt=$('#pay-logtime'); if(lt) lt.onclick=function(){ PAY_PANEL=(PAY_PANEL==='time'?null:'time'); PAY_TEDIT=null; paintPay(); };
  var rc=$('#pay-record'); if(rc) rc.onclick=function(){ PAY_PANEL=(PAY_PANEL==='pay'?null:'pay'); PAY_TEDIT=null; paintPay(); };
  var rp=$('#pay-runpayroll'); if(rp) rp.onclick=function(){ PAY_PANEL=(PAY_PANEL==='payroll'?null:'payroll'); PAY_TEDIT=null; paintPay(); };
  var gns=document.querySelectorAll('[data-pegen]');
  for(var z=0;z<gns.length;z++) gns[z].onclick=function(){
    var who=this.getAttribute('data-pegen');
    payRun('payGenerateLink',who,undefined,'\u2713 Link created for '+who+'.',this);
  };
  var cps=document.querySelectorAll('[data-pecopy]');
  for(var q=0;q<cps.length;q++) cps[q].onclick=function(){ payCopy_(this.getAttribute('data-pecopy'), this); };
var jb=$('#pay-job'); if(jb) jb.onclick=function(){ PAY_PANEL=(PAY_PANEL==='job'?null:'job'); PAY_TEDIT=null; paintPay(); };
  var me=$('#pay-emp'); if(me) me.onclick=function(){ PAY_PANEL=(PAY_PANEL==='emp'?null:'emp'); PAY_TEDIT=null; paintPay(); };
  var im=$('#pay-import'); if(im) im.onclick=function(){
    if(!confirm('Import payroll (5006) payments from the accounting General Ledger into the Payments tab? Reads the ledger; skips ones already logged.')) return;
    payRun('payImportFromGL',undefined,undefined,function(d){ var m='✓ Imported '+(d.imported||0)+', skipped '+(d.skipped||0)+' already there.'; if(d.unmatched&&d.unmatched.length) m+='  Could not match to an employee (fix by hand): '+d.unmatched.join('; '); return m; }, im);
  };


  if(PAY_PANEL==='time'){
    var emp=$('#pt-emp'), rate=$('#pt-rate'), hours=$('#pt-hours'), flat=$('#pt-flat'), amt=$('#pt-amt');
    var calc=function(){ var f=parseFloat(flat.value); var a; if(!isNaN(f)&&flat.value!==''){ a=f; } else { var h=parseFloat(hours.value), rt=parseFloat(rate.value); a=(!isNaN(h)&&!isNaN(rt))?h*rt:0; } amt.value=a?money(a):''; };
    emp.onchange=function(){ var r=payRateFor(this.value); if(r!=='') rate.value=r; calc(); };
    [rate,hours,flat].forEach(function(el){ el.oninput=calc; });
    $('#pt-cancel').onclick=function(){ PAY_PANEL=null; paintPay(); };
    $('#pt-save').onclick=function(){
      var e=emp.value; if(!e){ $('#pay-flash').innerHTML='<div class="flash err">Pick an employee.</div>'; return; }
      var payload={ date:$('#pt-date').value, employee:e, wo:$('#pt-wo').value.trim(), invoice:$('#pt-inv').value.trim(), hours:hours.value, rate:rate.value, flat:flat.value, notes:$('#pt-notes').value.trim() };
      payRun('payLogTime',payload,undefined,'✓ Time logged for '+e+'.',this);
    };
  }


  if(PAY_PANEL==='pay'){
    var pemp=$('#pp-emp'), pamt=$('#pp-amt'), owed=$('#pp-owed');
    pemp.onchange=function(){ var b=payBalFor(this.value); owed.innerHTML=this.value?('Balance owed: <b>'+payM(b)+'</b>'):''; if(b>0) pamt.value=b.toFixed(2); };
    $('#pp-cancel').onclick=function(){ PAY_PANEL=null; paintPay(); };
    $('#pp-save').onclick=function(){
      var e=pemp.value; if(!e){ $('#pay-flash').innerHTML='<div class="flash err">Pick an employee.</div>'; return; }
      var a=parseFloat(pamt.value); if(!(a>0)){ $('#pay-flash').innerHTML='<div class="flash err">Enter an amount.</div>'; return; }
      payRun('payRecordPayment',{ date:$('#pp-date').value, employee:e, amount:a, paidFrom:$('#pp-from').value, notes:$('#pp-notes').value.trim() },undefined,'✓ Payment recorded for '+e+' ('+money(a)+').',this);
    };
  }


  if(PAY_PANEL==='payroll'){
    var prc=$('#pr-cancel'); if(prc) prc.onclick=function(){ PAY_PANEL=null; paintPay(); };
    var prr=$('#pr-run'); if(prr) prr.onclick=function(){
      payRun('payRunPayroll',{ paidFrom:$('#pr-from').value, date:$('#pr-date').value },undefined,function(d){ return '✓ Recorded '+(d.payrollCount||0)+' payroll payment(s), '+money(d.payrollTotal||0)+' total.'; },this);
    };
  }


  {
    var wadd=$('#wo-add'); if(wadd) wadd.onclick=function(){
      var n=$('#wo-newnum').value.trim();
      if(!n){ $('#pay-flash').innerHTML='<div class="flash err">Enter a work order number.</div>'; return; }
      payRun('payAddWorkOrder',{ num:n, desc:$('#wo-newdesc').value },undefined,'\u2713 Added WO '+n+'.',this);
    };
    var wsv=document.querySelectorAll('[data-wosave]');
    for(var x=0;x<wsv.length;x++) wsv[x].onclick=function(){
      var num=this.getAttribute('data-wosave');
      var d=document.querySelector('.wo-desc[data-num="'+num.replace(/"/g,'\\"')+'"]');
      var s=document.querySelector('.wo-status[data-num="'+num.replace(/"/g,'\\"')+'"]');
      payRun('payUpdateWorkOrder',num,{ desc:d?d.value:null, status:s?s.value:null },'\u2713 Updated WO '+num+'.',this);
    };
    var wdl=document.querySelectorAll('[data-wodel]');
    for(var y=0;y<wdl.length;y++) wdl[y].onclick=function(){
      var num=this.getAttribute('data-wodel');
      if(!confirm('Delete work order '+num+'? It will stop showing on the time clocks.')) return;
      payRun('payDeleteWorkOrder',num,undefined,'\u2713 Deleted WO '+num+'.',this);
    };
  }
  if(PAY_PANEL==='emp'){
    $('#pe-close').onclick=function(){ PAY_PANEL=null; paintPay(); };
    var add=$('#pe-add'); if(add) add.onclick=function(){
      var n=$('#pe-name').value.trim(); if(!n){ $('#pay-flash').innerHTML='<div class="flash err">Enter a name.</div>'; return; }
      payRun('payAddEmployee',{ name:n, rate:$('#pe-newrate').value, role:$('#pe-newrole')?$('#pe-newrole').value:'', raise:$('#pe-newraise')?$('#pe-newraise').value:'', hire:$('#pe-newhire')?$('#pe-newhire').value:'' },undefined,'✓ Added '+n+'.',this);
    };
    var saves=document.querySelectorAll('[data-pesave]');
    for(var i=0;i<saves.length;i++) saves[i].onclick=function(){
      var name=this.getAttribute('data-pesave');
      var inp=document.querySelector('.pe-rate[data-name="'+name.replace(/"/g,'\\"')+'"]');
      var rol=document.querySelector('.pe-role[data-name="'+name.replace(/"/g,'\\"')+'"]');
      var rai=document.querySelector('.pe-raise[data-name="'+name.replace(/"/g,'\\"')+'"]');
      var hir=document.querySelector('.pe-hire[data-name="'+name.replace(/"/g,'\\"')+'"]');
      payRun('payUpdateEmployee',name,{ rate:inp?inp.value:'', role:rol?rol.value:null, raise:rai?rai.value:null, hire:hir?hir.value:null },'✓ Updated '+name+'.',this);
    };
    var dels=document.querySelectorAll('[data-pedel]');
    for(var j=0;j<dels.length;j++) dels[j].onclick=function(){
      var name=this.getAttribute('data-pedel');
      if(!confirm('Remove '+name+' from the roster? Their past Time Log amounts are locked in first so history stays intact.')) return;
      payRun('payDeleteEmployee',name,undefined,'✓ Removed '+name+'.',this);
    };
  }


  var teds=document.querySelectorAll('[data-ptedit]');
  for(var a=0;a<teds.length;a++) teds[a].onclick=function(){ PAY_TEDIT=parseInt(this.getAttribute('data-ptedit'),10); PAY_PANEL=null; paintPay(); };
  var tdels=document.querySelectorAll('[data-ptdel]');
  for(var b=0;b<tdels.length;b++) tdels[b].onclick=function(){ var row=parseInt(this.getAttribute('data-ptdel'),10); if(!confirm('Delete this time entry?')) return; payRun('payDeleteTime',row,undefined,'✓ Time entry deleted.',this); };
  var tcancel=document.querySelector('[data-ptcancel]'); if(tcancel) tcancel.onclick=function(){ PAY_TEDIT=null; paintPay(); };
  var tdel2=document.querySelector('[data-ptdel2]'); if(tdel2) tdel2.onclick=function(){ var row=parseInt(this.getAttribute('data-ptdel2'),10); if(!confirm('Delete this time entry?')) return; payRun('payDeleteTime',row,undefined,'✓ Time entry deleted.',this); };
  var tsave=document.querySelector('[data-ptsave]');
  if(tsave) tsave.onclick=function(){
    var row=parseInt(this.getAttribute('data-ptsave'),10); var tr=this.closest('tr');
    var payload={ date:tr.querySelector('.pte-date').value, employee:tr.querySelector('.pte-emp').value, wo:tr.querySelector('.pte-wo').value.trim(),
      hours:tr.querySelector('.pte-hours').value, rate:tr.querySelector('.pte-rate').value, flat:tr.querySelector('.pte-flat').value, notes:tr.querySelector('.pte-notes').value.trim() };
    payRun('payUpdateTime',row,payload,'✓ Time entry updated.',this);
  };


  var pdels=document.querySelectorAll('[data-ppdel]');
  for(var c=0;c<pdels.length;c++) pdels[c].onclick=function(){ var row=parseInt(this.getAttribute('data-ppdel'),10); if(!confirm('Delete this payment?')) return; payRun('payDeletePayment',row,undefined,'✓ Payment deleted.',this); };
}


startApp();

/* ---- version stamp / staleness ---------------------------------------- */
/* One stamp (sidebar footer + home-screen toolbar): "site 1.1.11 · API v12".
   Two independent checks run on load, whenever the tab comes back to the
   foreground, and every 10 minutes:
     site — refetch config.js from the live origin (uncached). If its
            siteVersion differs from the one this page loaded with, this
            device is holding an old copy → amber bar with a Reload button.
     api  — ask the Apps Script for its API_VERSION. If it is lower than
            CJ_CONFIG.apiVersion the backend has not been redeployed
            (pencil → New version) → amber bar, no reload (reloading won't help). */
var VER = { siteLoaded: CJ_CONFIG.siteVersion || '', siteLive: '',
            apiRunning: null, apiWanted: (typeof CJ_CONFIG.apiVersion === 'number') ? CJ_CONFIG.apiVersion : null };

function verSiteNum(s) { return String(s || '').replace(/^site\s*/i, ''); }

/* '' = fine | 'site' = this device has an old copy of the site
   'api' = the backend answering is older than this site expects */
function verProblem() {
  if (VER.siteLive && VER.siteLive !== VER.siteLoaded) return 'site';
  if (VER.apiRunning !== null && VER.apiWanted !== null && VER.apiRunning < VER.apiWanted) return 'api';
  return '';
}

function verStampText() {
  var p = verProblem();
  var site = 'site ' + verSiteNum(VER.siteLoaded);
  if (p === 'site') site += ' → ' + verSiteNum(VER.siteLive);
  var api = (VER.apiRunning !== null) ? 'API v' + VER.apiRunning : '';
  if (p === 'api') api += ', needs v' + VER.apiWanted;
  return { site: site, api: api, problem: p };
}

function paintVerStamp() {
  var t = verStampText();
  var el = document.getElementById('verstamp');
  if (el) {
    el.className = 'verstamp' + (t.problem ? ' warn' : '');
    el.innerHTML = '<span class="dot"></span>' + esc(t.site) + (t.api ? ' · ' + esc(t.api) : '');
  }
  paintUpdateBar();
  updateBar();
}

function paintUpdateBar() {
  var p = verProblem();
  var bar = document.getElementById('updatebar');
  if (!p) { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'updatebar';
    document.body.insertBefore(bar, document.body.firstChild);
  }
  bar.innerHTML = (p === 'site'
      ? '<span>Site updated (' + esc(verSiteNum(VER.siteLoaded)) + ' → ' + esc(verSiteNum(VER.siteLive)) + ')</span>'
        + '<button onclick="hardReload()">Reload</button>'
      : '<span>Backend not redeployed (API v' + esc(String(VER.apiRunning)) + ', site needs v' + esc(String(VER.apiWanted)) + ')</span>'
        + '<button onclick="checkVersion()">Check again</button>');
}

function checkVersion() {
  fetch('config.js?_=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.text(); })
    .then(function (t) {
      var m = t.match(/siteVersion\s*:\s*['"]([^'"]+)['"]/);
      if (m) { VER.siteLive = m[1]; paintVerStamp(); }
    })
    .catch(function (e) { console.error('site version check failed', e); });
  if (!CJ.session()) return;
  google.script.run
    .withSuccessHandler(function (r) {
      var n = (r && typeof r === 'object') ? (r.api !== undefined ? r.api : r.running) : r;
      if (typeof n === 'string') { var mm = n.match(/(\d+)/); n = mm ? parseInt(mm[1], 10) : null; }
      VER.apiRunning = (typeof n === 'number' && !isNaN(n)) ? n : null;
      paintVerStamp();
    })
    .withFailureHandler(function (e) { console.error('API version check failed', e); })
    .getVersion();
}

function hardReload() {
  window.location.href = location.pathname + '?v=' + Date.now() + (location.hash || '');
}

document.addEventListener('visibilitychange', function () { if (!document.hidden) checkVersion(); });
setInterval(checkVersion, 10 * 60 * 1000);
checkVersion();


/* ===================== CTK — CALIBRATED TOOL KIT ===================== */
var CAL_CACHE=null, CAL_FILTER='all', CAL_SEARCH='', CAL_EDIT=null, CAL_MARK=null, CAL_LOC='';

/* every count and list on this tab is scoped to the selected location */
function calScope(){
  var a=(CAL_CACHE||[]).slice();
  if(!CAL_LOC) return a;
  if(CAL_LOC==='__none') return a.filter(function(r){ return !r.loc; });
  return a.filter(function(r){ return r.loc===CAL_LOC; });
}
function calLocations(){
  var seen={}, out=[];
  (CAL_CACHE||[]).forEach(function(r){ if(r.loc && !seen[r.loc]){ seen[r.loc]=1; out.push(r.loc); } });
  return out.sort();
}
function calLocFilter(){
  var locs=calLocations();
  if(!locs.length) return '';
  var anyBlank=(CAL_CACHE||[]).some(function(r){ return !r.loc; });
  var h='<select class="cal-locf" id="cal-locf"><option value=""'+(CAL_LOC===''?' selected':'')+'>All locations</option>';
  locs.forEach(function(l){ h+='<option value="'+esc(l)+'"'+(CAL_LOC===l?' selected':'')+'>'+esc(l)+'</option>'; });
  if(anyBlank) h+='<option value="__none"'+(CAL_LOC==='__none'?' selected':'')+'>No location set</option>';
  return h+'</select>';
}
var CAL_STATUS_LIST=['Active','Out for Calibration','Returned/Paid','Out of Service'];

function calToday(){ var d=new Date(); d.setHours(0,0,0,0); return d; }
function calParse(s){ if(!s) return null; var p=String(s).split('-');
  if(p.length===3&&p[0].length===4) return new Date(+p[0],+p[1]-1,+p[2]);
  var d=new Date(s); return isNaN(d.getTime())?null:d; }
function calIso(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
function calPretty(s){ var d=calParse(s); return d?d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}):''; }
function calPlusMonths(s,m){
  var d=calParse(s); if(!d||!m) return '';
  var day=d.getDate(), n=new Date(d.getFullYear(),d.getMonth(),1);
  n.setMonth(n.getMonth()+Number(m));
  n.setDate(Math.min(day,new Date(n.getFullYear(),n.getMonth()+1,0).getDate()));
  return calIso(n);
}
function calDays(r){ var d=calParse(r.due); if(!d) return null; return Math.round((d-calToday())/86400000); }

function calBadge(r){
  if(r.status==='Out for Calibration') return '<span class="cal-badge out">At cal vendor</span>';
  var n=calDays(r);
  if(n===null) return '<span class="cal-badge none">No due date</span>';
  if(n<0)   return '<span class="cal-badge over">'+Math.abs(n)+'d overdue</span>';
  if(n===0) return '<span class="cal-badge over">Due today</span>';
  if(n<=30) return '<span class="cal-badge soon">'+n+'d left</span>';
  return '<span class="cal-badge ok">'+n+'d left</span>';
}
function calBucket(r){
  if(r.status==='Out for Calibration') return 'outcal';
  var n=calDays(r);
  if(n===null) return 'nodate';
  if(n<0) return 'over';
  if(n<=30) return 'soon';
  return 'ok';
}

function calRows(){
  var rows=calScope();
  var q=CAL_SEARCH.toLowerCase();
  rows=rows.filter(function(r){
    if(q && (r.name+' '+r.notes+' '+r.id+' '+(r.pn||'')+' '+(r.sn||'')+' '+(r.loc||'')).toLowerCase().indexOf(q)<0) return false;
    if(CAL_FILTER==='all') return true;
    if(CAL_FILTER==='attn') return calBucket(r)==='over'||calBucket(r)==='soon'||calBucket(r)==='nodate';
    if(CAL_FILTER==='outcal') return r.status==='Out for Calibration';
    if(CAL_FILTER==='active') return r.status!=='Out of Service';
    return true;
  });
  rows.sort(function(a,b){
    var x=calParse(a.due), y=calParse(b.due);
    if(!x&&!y) return a.name.localeCompare(b.name);
    if(!x) return 1; if(!y) return -1;
    return x-y;
  });
  return rows;
}

function calTiles(){
  var all=calScope(), over=0, soon=0, out=0, live=0;
  for(var i=0;i<all.length;i++){
    var b=calBucket(all[i]);
    live++;
    if(b==='over') over++; else if(b==='soon') soon++; else if(b==='outcal') out++;
  }
  var next='—';
  var upcoming=all.filter(function(x){return x.due&&x.status!=='Out for Calibration';})
                  .sort(function(a,b){return calParse(a.due)-calParse(b.due);})[0];
  if(upcoming) next=calPretty(upcoming.due)+' · '+upcoming.name;
  return '<div class="grid g4 ctk-tiles" style="margin-bottom:18px">'
    +tile(over?'red':'ok','Overdue',String(over),over?'needs attention now':'nothing past due')
    +tile(soon?'warn':'ok','Due within 30 days',String(soon),'plan these')
    +tile('navy','Out for calibration',String(out),'awaiting return')
    +tile('','Next tool due',next,live+' tools tracked')
    +'</div>';
}

function calPanel(){
  if(!CAL_EDIT) return '';
  var e=CAL_EDIT, isNew=!e.id;
  var opts='';
  for(var i=0;i<CAL_STATUS_LIST.length;i++){
    opts+='<option value="'+esc(CAL_STATUS_LIST[i])+'"'+(e.status===CAL_STATUS_LIST[i]?' selected':'')+'>'+esc(CAL_STATUS_LIST[i])+'</option>';
  }
  return '<div class="card pad cal-panel">'
    +'<div class="section-title" style="margin:0 0 14px">'+(isNew?'Add a tool':'Edit '+esc(e.name))+'</div>'
    +'<div class="form-row"><div><label>Tool name</label><input id="cf-name" value="'+esc(e.name||'')+'" placeholder="e.g. Torque wrench 20-100 in-lb"></div>'
    +'<div><label>Status</label><select id="cf-status">'+opts+'</select></div></div>'
    +'<div class="form-row"><div><label>Part number</label><input id="cf-pn" value="'+esc(e.pn||'')+'" placeholder="P/N on the tool or cert"></div>'
    +'<div><label>Serial number</label><input id="cf-sn" value="'+esc(e.sn||'')+'" placeholder="S/N on the tool or cert"></div></div>'
    +'<div class="form-row"><div><label>Last calibrated</label><input id="cf-last" type="date" value="'+esc(e.last||'')+'"></div>'
    +'<div><label>Interval (months)</label><input id="cf-int" type="number" min="0" step="1" value="'+(e.interval===''||e.interval==null?12:e.interval)+'" placeholder="12"></div></div>'
    +'<div class="form-row"><div><label>Next due</label><input id="cf-due" type="date" value="'+esc(e.due||'')+'">'
    +'<div class="hint">Leave blank and it is calculated from last calibrated + interval.</div></div>'
    +'<div><label>Location</label><input id="cf-loc" list="cal-locs" value="'+esc(e.loc||'')+'" placeholder="e.g. Trailer 1">'+calLocList()+'</div></div>'
    +'<div class="form-row"><div style="grid-column:1 / -1"><label>Notes</label><input id="cf-notes" value="'+esc(e.notes||'')+'" placeholder="cert #, vendor, PO…"></div></div>'
    +'<div style="display:flex;gap:10px;align-items:center">'
    +'<button class="btn" id="cf-save">Save</button>'
    +'<button class="btn ghost" id="cf-cancel">Cancel</button>'
    +(isNew?'':'<button class="btn danger" id="cf-del" style="margin-left:auto">Delete tool</button>')
    +'</div></div>';
}

function calMarkPanel(){
  if(!CAL_MARK) return '';
  var m=CAL_MARK;
  var preview=(m.date&&m.interval)?calPretty(calPlusMonths(m.date,m.interval)):'—';
  return '<div class="card pad cal-panel">'
    +'<div class="section-title" style="margin:0 0 4px">Mark calibrated — '+esc(m.name)+'</div>'
    +'<div class="hint" style="margin:0 0 14px">Enter the date on the calibration certificate, not the day it came back on the shelf.</div>'
    +'<div class="form-row"><div><label>Date calibrated</label>'
      +'<input id="cm-date" type="date" value="'+esc(m.date)+'" max="'+esc(calIso(new Date()))+'"></div>'
    +'<div><label>Interval (months)</label>'
      +'<input id="cm-int" type="number" min="1" step="1" value="'+(m.interval||'')+'"></div></div>'
    +'<div class="preview" style="margin-bottom:14px"><div class="ln"><span>New next-due date</span>'
      +'<strong id="cm-preview">'+esc(preview)+'</strong></div></div>'
    +'<div class="form-row"><div style="grid-column:1 / -1"><label>Add to notes (optional)</label>'
      +'<input id="cm-note" placeholder="cert #, vendor, PO…"></div></div>'
    +'<div style="display:flex;gap:10px">'
      +'<button class="btn gold" id="cm-save">Save calibration</button>'
      +'<button class="btn ghost" id="cm-cancel">Cancel</button>'
    +'</div></div>';
}

function calLocList(){
  var seen={}, out='';
  (CAL_CACHE||[]).forEach(function(r){ if(r.loc && !seen[r.loc]){ seen[r.loc]=1; out+='<option value="'+esc(r.loc)+'">'; } });
  return '<datalist id="cal-locs">'+out+'</datalist>';
}

function calBody(){
  var rows=calRows();
  if(!rows.length) return '<tr><td colspan="7" style="padding:26px;text-align:center;color:var(--muted)">No tools match this view.</td></tr>';
  var html='';
  for(var i=0;i<rows.length;i++){
    var r=rows[i], b=calBucket(r);
    var cls = b==='over' ? 'cal-over' : (b==='soon' ? 'cal-soon' : '');
    var sel='<select class="cal-sel" data-cstatus="'+esc(r.id)+'">';
    for(var j=0;j<CAL_STATUS_LIST.length;j++){
      sel+='<option value="'+esc(CAL_STATUS_LIST[j])+'"'+(r.status===CAL_STATUS_LIST[j]?' selected':'')+'>'+esc(CAL_STATUS_LIST[j])+'</option>';
    }
    sel+='</select>';
    html+='<tr class="'+cls+'">'
      +'<td><strong>'+esc(r.name)+'</strong>'
        +((r.pn||r.sn)?'<div class="cal-ids">'+(r.pn?'P/N '+esc(r.pn):'')+(r.pn&&r.sn?' · ':'')+(r.sn?'S/N '+esc(r.sn):'')+'</div>':'')
        +(r.loc?'<div><span class="cal-loc">'+esc(r.loc)+'</span></div>':'')
        +'</td>'
      +'<td>'+esc(calPretty(r.last))+'</td>'
      +'<td>'+(r.interval?esc(r.interval)+' mo':'')+'</td>'
      +'<td><strong>'+esc(calPretty(r.due))+'</strong></td>'
      +'<td>'+calBadge(r)+'</td>'
      +'<td>'+sel+'<span class="cal-stat-print">'+esc(r.status)+'</span></td>'
      +'<td class="cal-note">'+esc(r.notes)+'<div class="cal-act" style="margin-top:6px">'
        +'<button class="btn sm gold" data-cmark="'+esc(r.id)+'">✓ Calibrated</button>'
        +'<button class="btn sm ghost" data-cedit="'+esc(r.id)+'">Edit</button>'
      +'</div></td>'
      +'</tr>';
  }
  return html;
}

function vCal(){
  if(!CAL_CACHE) return topbar('CTK','CALIBRATED TOOL KIT · NEXT DUE TRACKER')+'<div class="card"><div class="miniload"><div class="spin"></div>Loading calibration records…</div></div>';
  var f=function(k,label){ return '<button data-cfil="'+k+'" class="'+(CAL_FILTER===k?'active':'')+'">'+label+'</button>'; };
  var scopeTxt = CAL_LOC ? (CAL_LOC==='__none'?'No location set':CAL_LOC)+' · '+calScope().length+' tools'
                            : 'next due tracker · '+CAL_CACHE.length+' tools on file';
  return topbar('CTK',esc(('Calibrated tool kit · '+scopeTxt).toUpperCase()))
    +'<div id="cal-flash"></div>'
    +calTiles()
    +calMarkPanel()
    +calPanel()
    +'<div class="cal-tools">'
      +'<div class="seg">'+f('attn','Needs attention')+f('active','Active')+f('outcal','Out for cal')+f('all','All')+'</div>'
      +calLocFilter()
      +'<input class="csearch" id="cal-q" placeholder="Search tools or notes…" value="'+esc(CAL_SEARCH)+'">'
      +'<button class="btn sm" id="cal-add" style="margin-left:auto">＋ Add tool</button>'
      +'<button class="btn sm ghost" id="cal-refresh">↻ Refresh</button>'
    +'</div>'
    +'<div class="card scroll ctk-wrap"><table class="tb ctk-tbl"><thead><tr>'
      +'<th>Tool</th><th>Last Calibrated</th><th>Interval</th><th>Next Due</th><th>Status</th><th>Record Status</th><th>Notes / Actions</th>'
    +'</tr></thead><tbody id="cal-body">'+calBody()+'</tbody></table></div>'
    +'<div class="hint" style="margin:10px 4px">Rows are sorted by next due date. Set a tool to Out for Calibration when you ship it; when it comes back, hit "✓ Calibrated", pick the certificate date, and the next due date rolls forward from that date.</div>';
}

function calFlash(kind,msg){
  var el=document.getElementById('cal-flash');
  if(el) el.innerHTML='<div class="flash '+kind+'">'+(kind==='ok'?'✓ ':'')+esc(msg)+'</div>';
}

function loadCal(){
  if(CAL_CACHE){ wireCal(); return; }
  google.script.run
    .withSuccessHandler(function(d){ CAL_CACHE=d; if(current==='cal') render('cal'); })
    .withFailureHandler(function(e){
      if(current==='cal'){ var ml=$('#content .miniload'); if(ml) ml.innerHTML='Could not load calibration records: '+esc(e.message||e); } })
    .getCalibration();
}
function reloadCal(msg){
  google.script.run.withSuccessHandler(function(d){
    CAL_CACHE=d; CAL_EDIT=null; CAL_MARK=null;
    if(current==='cal'){ render('cal'); if(msg) calFlash('ok',msg); }
  }).withFailureHandler(function(e){ calFlash('err',e.message||e); }).getCalibration();
}

function wireCal(){
  var q=document.getElementById('cal-q');
  if(q) q.oninput=function(){ CAL_SEARCH=this.value; document.getElementById('cal-body').innerHTML=calBody(); };

  var fbtns=document.querySelectorAll('.cal-tools .seg button');
  for(var i=0;i<fbtns.length;i++) fbtns[i].onclick=function(){ CAL_FILTER=this.getAttribute('data-cfil'); render('cal'); };

  var locf=document.getElementById('cal-locf');
  if(locf) locf.onchange=function(){ CAL_LOC=this.value; render('cal'); };

  var add=document.getElementById('cal-add');
  if(add) add.onclick=function(){ CAL_MARK=null; CAL_EDIT={id:'',name:'',last:'',interval:'',due:'',status:'Active',notes:'',pn:'',sn:''}; render('cal'); };

  var rf=document.getElementById('cal-refresh');
  if(rf) rf.onclick=function(){ CAL_CACHE=null; render('cal'); };

  var content=document.getElementById('content');
  content.removeEventListener('click', calClick);
  content.addEventListener('click', calClick);

  var sels=document.querySelectorAll('[data-cstatus]');
  for(var s=0;s<sels.length;s++) sels[s].onchange=function(){
    var id=this.getAttribute('data-cstatus'), v=this.value;
    calFlash('busy','Saving…');
    google.script.run.withSuccessHandler(function(res){ reloadCal(res.message); })
      .withFailureHandler(function(e){ calFlash('err',e.message||e); })
      .setCalibrationStatus(id,v);
  };

  var cmDate=document.getElementById('cm-date'), cmInt=document.getElementById('cm-int');
  var cmSync=function(){
    CAL_MARK.date=cmDate.value; CAL_MARK.interval=cmInt.value;
    var p=document.getElementById('cm-preview');
    var nd=(CAL_MARK.date&&CAL_MARK.interval)?calPlusMonths(CAL_MARK.date,CAL_MARK.interval):'';
    if(p) p.textContent = nd ? calPretty(nd) : '—';
  };
  if(cmDate){ cmDate.onchange=cmSync; cmDate.oninput=cmSync; }
  if(cmInt)  cmInt.oninput=cmSync;

  var cmS=document.getElementById('cm-save');
  if(cmS) cmS.onclick=function(){
    if(!CAL_MARK.date){ calFlash('err','Pick the date the tool was calibrated.'); return; }
    if(!CAL_MARK.interval){ calFlash('err','Enter the calibration interval in months.'); return; }
    var note=document.getElementById('cm-note').value;
    this.disabled=true; calFlash('busy','Updating '+CAL_MARK.name+'…');
    var id=CAL_MARK.id, when=CAL_MARK.date, iv=CAL_MARK.interval;
    var after=function(res){
      if(!note.trim()){ reloadCal(res.message); return; }
      var r=calFind(id);
      var merged=(r&&r.notes?r.notes+' · ':'')+note.trim();
      google.script.run.withSuccessHandler(function(){ reloadCal(res.message); })
        .withFailureHandler(function(e){ calFlash('err',e.message||e); })
        .saveCalibrationTool({id:id,name:r.name,status:'Active',last:when,interval:iv,
                              due:calPlusMonths(when,iv),notes:merged,pn:r.pn,sn:r.sn,loc:r.loc});
    };
    google.script.run.withSuccessHandler(after)
      .withFailureHandler(function(e){ calFlash('err',e.message||e); })
      .markCalibrated(id, when, iv);
  };
  var cmC=document.getElementById('cm-cancel');
  if(cmC) cmC.onclick=function(){ CAL_MARK=null; render('cal'); };

  var sv=document.getElementById('cf-save');
  if(sv) sv.onclick=function(){
    var t={ id:CAL_EDIT.id,
      name:document.getElementById('cf-name').value,
      status:document.getElementById('cf-status').value,
      last:document.getElementById('cf-last').value,
      interval:document.getElementById('cf-int').value,
      due:document.getElementById('cf-due').value,
      notes:document.getElementById('cf-notes').value,
      pn:document.getElementById('cf-pn').value,
      sn:document.getElementById('cf-sn').value,
      loc:document.getElementById('cf-loc').value };
    if(!t.name.trim()){ calFlash('err','Tool name is required.'); return; }
    this.disabled=true; calFlash('busy','Saving…');
    google.script.run.withSuccessHandler(function(res){ reloadCal(res.message); })
      .withFailureHandler(function(e){ calFlash('err',e.message||e); })
      .saveCalibrationTool(t);
  };
  var cn=document.getElementById('cf-cancel');
  if(cn) cn.onclick=function(){ CAL_EDIT=null; render('cal'); };
  var dl=document.getElementById('cf-del');
  if(dl) dl.onclick=function(){
    if(!confirm('Delete '+CAL_EDIT.name+' from the tracker? This removes the row from the sheet.')) return;
    calFlash('busy','Deleting…');
    google.script.run.withSuccessHandler(function(res){ reloadCal(res.message); })
      .withFailureHandler(function(e){ calFlash('err',e.message||e); })
      .deleteCalibrationTool(CAL_EDIT.id);
  };
}

function calFind(id){ for(var i=0;i<CAL_CACHE.length;i++) if(CAL_CACHE[i].id===id) return CAL_CACHE[i]; return null; }

function calClick(e){
  var t=e.target;
  var ed=t.getAttribute&&t.getAttribute('data-cedit');
  var mk=t.getAttribute&&t.getAttribute('data-cmark');
  if(ed){ var r=calFind(ed); if(r){ CAL_MARK=null; CAL_EDIT={id:r.id,name:r.name,last:r.last,interval:r.interval,due:r.due,status:r.status,notes:r.notes,pn:r.pn,sn:r.sn,loc:r.loc}; render('cal'); window.scrollTo(0,0); } return; }
  if(mk){
    var row=calFind(mk); if(!row) return;
    CAL_EDIT=null;
    CAL_MARK={ id:row.id, name:row.name, date:calIso(new Date()), interval:(row.interval||12) };
    render('cal'); window.scrollTo(0,0);
    var d=document.getElementById('cm-date'); if(d) d.focus();
  }
}
/* =================== END CTK — CALIBRATED TOOL KIT =================== */


/* ================= BENCH STOCK (native since site 1.4.0) =================
   The Benchstock app lives in js/bench.js (a closure exporting window.BS) with its styles in
   css/bench.css scoped under .bs — ported from the standalone cjaviationtn/benchstock site,
   which now just redirects here. Data still comes from the Benchstock Apps Script
   (CJ_CONFIG.benchApiUrl); the inventory sheet is untouched. A scanned QR label opens
   #bench?p=<part> — render() captures the part before the hash is normalised. */
var BENCH_P='';
function vBench(){
  var tabs=isCrew()?[['parts','Parts'],['reorder','Reorder']]:[['parts','Parts'],['reorder','Reorder'],['labels','Labels'],['year','Year-end'],['manage','Manage']], th='';
  for(var i=0;i<tabs.length;i++) th+='<button id="tab-'+tabs[i][0]+'"'+(i===0?' class="on"':'')+' onclick="BS.switchTab(\''+tabs[i][0]+'\')">'+tabs[i][1]+'</button>';
  return topbar('Bench Stock','Mx trailer inventory \u00b7 scan, take, reorder, labels','live \u00b7 from the Bench Stock sheet')
    +'<div class="bs" id="bs-root"><div class="bs-app">'
    +  '<header><div class="hrow"><div><div class="sub" id="sub"></div></div></div><div class="tabs">'+th+'</div></header>'
    +  '<div class="searchwrap" id="searchwrap"><div class="searchbar"><input id="q" type="text" inputmode="search" placeholder="Search bin, part # or description"></div><div class="count" id="count"></div></div>'
    +  '<div class="wrap" id="view"><div class="bs-spin">Loading inventory\u2026</div></div>'
    +'</div>'
    +'<div id="photoModal"><div class="pmwrap"><div class="pmtitle" id="pmTitle"></div><div class="pmsub" id="pmSub"></div><div class="pmimg" id="pmImg"></div>'
    +  '<div class="pmbtns" id="pmBtns"><button class="pmreplace" onclick="BS.replacePhoto()">Replace photo</button><button class="pmdelete" onclick="BS.askDeletePhoto()">Delete photo</button></div>'
    +  '<div id="pmConfirmSlot"></div><button class="pmclose" onclick="BS.closePhoto()">Close</button></div></div>'
    +'<div class="toast" id="toast"></div><img class="bs-logo" src="img/logo.png" alt="">'
    +'</div>';
}

/* ================= TIME CLOCK (crew, site 1.5.0) =================
   The crew's clock in / out, ported from the personal-link time clock page. Talks to
   clockState / clockIn / clockOut in the Admin backend (Pay backend.gs), which write the same
   Clock Punches + Time Log rows and send the same Pushover ping. The employee is whoever is
   signed in — the backend maps the Google address to the roster name. */
var CLOCK_STATE=null, CLOCK_BUSY=false, CLOCK_MSG=null, CLOCK_SUM=null;
function vClock(){
  return topbar('Time Clock','Clock in on a work order, clock out when you\u2019re done','live \u00b7 Pay Tracker sheet')
    +'<div id="clock-wrap"><div class="card pad miniload"><span class="spin"></span> Loading\u2026</div></div>'
    +'<div id="clock-sum"></div>';
}
/* Year-to-date pay summary for the signed-in employee — their own numbers only. */
function loadClockSummary(){
  google.script.run.withSuccessHandler(function(sm){ CLOCK_SUM=sm; paintClockSummary(); })
    .withFailureHandler(function(e){ console.error('clockMySummary',e); var w=$('#clock-sum'); if(w) w.innerHTML=''; })
    .clockMySummary();
}
function paintClockSummary(){
  var w=$('#clock-sum'); if(!w || !CLOCK_SUM || current!=='clock') return;
  var m=CLOCK_SUM, h='<div class="card pad clock-card clock-sumcard"><div class="clock-h">My pay \u00b7 '+esc(m.year)+'</div><div class="clock-grid">'
    +'<div class="clock-tile"><small>ROLE</small><b>'+esc(m.role||'\u2014')+'</b></div>'
    +'<div class="clock-tile"><small>RATE</small><b>'+(m.rate!==''&&m.rate!=null?money(m.rate)+' / hr':'\u2014')+'</b></div>'
    +'<div class="clock-tile"><small>HOURS</small><b>'+esc(String(m.hours))+'</b></div>'
    +'<div class="clock-tile"><small>EARNED</small><b>'+money(m.earned)+'</b></div>'
    +'<div class="clock-tile"><small>PAID</small><b>'+money(m.paid)+'</b></div>'
    +'<div class="clock-tile'+(m.balance>0?' owed':'')+'"><small>BALANCE OWED</small><b>'+money(m.balance)+'</b></div>'
    +'</div>';
  if(m.last && m.last.length){
    h+='<div class="clock-h" style="margin-top:14px">Last entries</div>';
    for(var i=0;i<m.last.length;i++){ var e=m.last[i]; h+='<div class="clock-row"><span>'+esc(payD(e.date))+(e.wo?' \u00b7 WO '+esc(e.wo):'')+'</span><span>'+esc(String(e.hours))+' hrs \u00b7 '+money(e.amount)+'</span></div>'; }
  }
  h+='<div class="hint" style="margin-top:8px">This year on the books \u00b7 balance owed = earned \u2212 paid</div></div>';
  w.innerHTML=h;
}
function loadClock(){
  loadClockSummary();
  google.script.run.withSuccessHandler(function(st){ CLOCK_STATE=st; paintClock(); })
    .withFailureHandler(function(e){ var w=$('#clock-wrap'); if(w && current==='clock') w.innerHTML='<div class="card pad"><div class="flash err">'+esc(e.message||String(e))+'</div><button class="btn ghost sm" onclick="loadClock()">Try again</button></div>'; })
    .clockState();
}
function paintClock(){
  var w=$('#clock-wrap'); if(!w || !CLOCK_STATE || current!=='clock') return;
  var st=CLOCK_STATE, h='<div class="card pad clock-card"><div class="clock-who">'+esc(st.name)+'</div>';
  if(st.punch){
    h+='<div class="clock-status">You\u2019re clocked in since <b>'+esc(st.punch.inTime)+'</b><br>WO '+esc(st.punch.wo)+(st.punch.desc?' \u2014 '+esc(st.punch.desc):'')+'</div>'
      +'<button class="clock-btn out" id="clock-out"'+(CLOCK_BUSY?' disabled':'')+'>CLOCK OUT</button>';
  } else {
    var opts='';
    for(var i=0;i<(st.workOrders||[]).length;i++){ var o=st.workOrders[i]; opts+='<option value="'+esc(o.num)+'">'+esc(o.num)+(o.desc?' \u2014 '+esc(o.desc):'')+'</option>'; }
    h+='<select id="clock-wo"><option value="">Select work order\u2026</option>'+opts+'</select>'
      +'<button class="clock-btn in" id="clock-in"'+(CLOCK_BUSY?' disabled':'')+'>CLOCK IN</button>';
    if(!(st.workOrders||[]).length) h+='<div class="hint" style="margin-top:10px">No open work orders right now.</div>';
  }
  if(CLOCK_MSG) h+='<div class="flash '+CLOCK_MSG.kind+'" style="margin-top:14px">'+esc(CLOCK_MSG.msg)+'</div>';
  h+='</div>'; w.innerHTML=h;
  var bi=$('#clock-in'); if(bi) bi.onclick=function(){ var wo=$('#clock-wo').value; if(!wo){ CLOCK_MSG={kind:'err',msg:'Pick a work order first.'}; paintClock(); return; } clockCall('clockIn',[wo]); };
  var bo=$('#clock-out'); if(bo) bo.onclick=function(){ clockCall('clockOut',[]); };
}
function clockCall(fn,args){
  CLOCK_BUSY=true; CLOCK_MSG=null; paintClock();
  var r=google.script.run
    .withSuccessHandler(function(res){ CLOCK_BUSY=false; CLOCK_MSG={kind:(res&&res.ok)?'ok':'err',msg:(res&&res.msg)||''}; paintClock(); loadClock(); })
    .withFailureHandler(function(e){ CLOCK_BUSY=false; CLOCK_MSG={kind:'err',msg:e.message||String(e)}; paintClock(); });
  r[fn].apply(r,args);
}

/* ================= VENMO FEE CALCULATOR ================= */
var VM_FEES={
  standard:{pct:0.019, flat:0.10, name:'Standard',   sub:'1.9% + $0.10',  label:'Venmo fee (1.9% + $0.10)'},
  tap:     {pct:0.0229,flat:0.09, name:'Tap to Pay', sub:'2.29% + $0.09', label:'Venmo fee (2.29% + $0.09)'}
};
var VM_ORDER=['standard','tap'];
var VM_TYPE='standard';

function vmSolve(invoice,f){
  var invC=Math.round(invoice*100), flatC=Math.round(f.flat*100);
  function feeCents(c){ return Math.round(c*f.pct)+flatC; }
  var c=Math.max(Math.floor((invC+flatC)/(1-f.pct))-3,1);
  for(var i=0;i<500;i++,c++){ if(c-feeCents(c)>=invC) break; }
  return {charge:c/100, fee:feeCents(c)/100, net:(c-feeCents(c))/100};
}

function vVenmo(){
  var h='';
  for(var i=0;i<VM_ORDER.length;i++){ var k=VM_ORDER[i], f=VM_FEES[k];
    h+='<button class="vm-btn'+(k===VM_TYPE?' active':'')+'" data-type="'+k+'">'+esc(f.name)+'<small>'+esc(f.sub)+'</small></button>'; }
  return topbar('Venmo Fee Calculator','Gross up an invoice so the processing fee lands on the customer, not on you','calculator · no sheet data')
  +'<div class="grid g2" style="align-items:start">'
    +'<div class="card pad">'
      +'<label for="vm-inv">Invoice total (what you want to receive)</label>'
      +'<div class="vm-wrap"><span class="vm-dollar">$</span><input type="text" id="vm-inv" inputmode="decimal" placeholder="0.00" autocomplete="off"></div>'
      +'<div class="vm-btns">'+h+'</div>'
      +'<div id="vm-out"></div>'
      +'<p class="hint" style="margin-top:14px">Add the fee to the invoice as a non-taxable line item — invoice + fee equals the charge exactly.</p>'
    +'</div>'
    +'<div class="card pad">'
      +'<div class="section-title" style="margin:0 0 14px">Both methods, side by side</div>'
      +'<div id="vm-cmp"><div class="hint">Enter an invoice total to compare.</div></div>'
    +'</div>'
  +'</div>';
}

function vmPaint(){
  var inp=$('#vm-inv'); if(!inp) return;
  var out=$('#vm-out'), cmp=$('#vm-cmp'); if(!out||!cmp) return;
  var invoice=parseFloat(inp.value.replace(/[^0-9.]/g,''));
  if(isNaN(invoice)||invoice<=0){
    out.innerHTML='';
    cmp.innerHTML='<div class="hint">Enter an invoice total to compare.</div>';
    return;
  }
  var f=VM_FEES[VM_TYPE], r=vmSolve(invoice,f);
  out.innerHTML='<div class="vm-out">'
    +'<div class="vm-lab">Charge the customer</div>'
    +'<div class="vm-big">'+money(r.charge)+'</div>'
    +'<div class="vm-ln"><span>Your invoice</span><span>'+money(invoice)+'</span></div>'
    +'<div class="vm-ln"><span>'+esc(f.label)+'</span><span>'+money(r.fee)+'</span></div>'
    +'<div class="vm-ln net"><span>You receive</span><span>'+money(r.net)+'</span></div>'
    +'</div>'
    +'<button class="btn vm-copy" id="vm-copy" data-amt="'+r.charge.toFixed(2)+'">Copy amount</button>';
  var cb=$('#vm-copy');
  cb.onclick=function(){
    var amt=cb.getAttribute('data-amt');
    function done(){ cb.textContent='Copied $'+amt; setTimeout(function(){ cb.textContent='Copy amount'; },1400); }
    function fail(){ cb.textContent='Amount: $'+amt; }
    if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(amt).then(done,fail); }
    else { fail(); }
  };
  var rows='';
  for(var i=0;i<VM_ORDER.length;i++){ var k=VM_ORDER[i], rr=vmSolve(invoice,VM_FEES[k]);
    rows+='<tr'+(k===VM_TYPE?' class="vm-on"':'')+'><td>'+esc(VM_FEES[k].name)+'</td><td class="num">'+money(rr.charge)+'</td><td class="num">'+money(rr.fee)+'</td></tr>'; }
  cmp.innerHTML='<table class="tb"><thead><tr><th>Method</th><th class="num">Charge</th><th class="num">Fee</th></tr></thead><tbody>'+rows+'</tbody></table>'
    +'<p class="hint" style="margin-top:12px">Solved in whole cents — the smallest charge whose net lands exactly on your invoice.</p>';
}

function wireVenmo(){
  var inp=$('#vm-inv'); if(!inp) return;
  var btns=document.querySelectorAll('.vm-btn');
  for(var i=0;i<btns.length;i++){
    btns[i].onclick=function(){
      VM_TYPE=this.getAttribute('data-type');
      for(var j=0;j<btns.length;j++) btns[j].classList.toggle('active', btns[j].getAttribute('data-type')===VM_TYPE);
      vmPaint();
    };
  }
  inp.oninput=vmPaint;
  vmPaint();
  inp.focus();
}


/* ================= MISSING RECEIPT AFFIDAVIT ================= */
var MR_PAY=['Cash / VolFed Business Checking','Venmo Business Account','AMEX Credit Card'];
var MR_PAY_SKIP=/savings/i;
var MR_CAT=['Shop Supplies','Parts (COGS)','Tools / Equipment','Fuel / Vehicle','Other'];
var MR_WHY=['Receipt lost or misplaced','Receipt never provided by vendor','Receipt damaged / illegible','Electronic receipt not received / deleted','Other'];
var MR_DOCS=['Bank statement','Credit card statement','Vendor account history / reprinted invoice','Email confirmation','Purchase order record','None available'];
var MR_CERT='I certify that the above expense was incurred for legitimate business purposes of C&J Aviation LLC, that the original receipt is unavailable for the reason stated above, and that the information provided is true and accurate to the best of my knowledge.';

function mrCatList(){
  var seen={}, out=[], A=(DATA&&DATA.accounts)||[];
  for(var i=0;i<A.length;i++){ var n=A[i].name;
    if(!n||A[i].isMoney||A[i].archived||n==='REVIEW'||n==='UNCATEGORIZED'||seen[n]) continue;
    seen[n]=1; out.push(n); }
  for(var j=0;j<MR_CAT.length;j++) if(!seen[MR_CAT[j]]){ seen[MR_CAT[j]]=1; out.push(MR_CAT[j]); }
  var h='<datalist id="mr-cat-list">';
  for(var k=0;k<out.length;k++) h+='<option value="'+esc(out[k])+'"></option>';
  return h+'</datalist>';
}
function mrPayList(){
  var out=[], A=(DATA&&DATA.accounts)||[];
  for(var i=0;i<A.length;i++){
    var n=A[i].name, c=String(A[i].code==null?'':A[i].code);
    if(!n||!A[i].isMoney||A[i].archived) continue;
    if(c==='1010'||MR_PAY_SKIP.test(n)) continue;
    out.push(n);
  }
  if(!out.length) out=MR_PAY.slice();
  out.push('Other');
  return out;
}
function mrOpts(arr){ var h='<option value=""></option>'; for(var i=0;i<arr.length;i++) h+='<option>'+esc(arr[i])+'</option>'; return h; }
function mrRecall(k){ try{ return localStorage.getItem(k)||''; }catch(e){ return ''; } }
function mrVal(id){ var e=$(id); return e?String(e.value==null?'':e.value).trim():''; }
function mrDate(iso){ if(!iso) return ''; var p=String(iso).split('-'); if(p.length!==3) return iso; return p[1]+'/'+p[2]+'/'+p[0]; }

function vMR(){
  var today=new Date().toISOString().slice(0,10);
  var docs='';
  for(var i=0;i<MR_DOCS.length;i++) docs+='<label class="mr-chk"><input type="checkbox" class="mr-doc" value="'+esc(MR_DOCS[i])+'"><span>'+esc(MR_DOCS[i])+'</span></label>';
  return topbar('Missing Receipt Affidavit','Documents an expense when the original receipt is lost, never issued, or unreadable','affidavit · print or save as PDF')
  +'<div id="mr-flash"></div>'
  +'<div id="mr-form">'
  +'<div class="card pad">'
    +'<div class="section-title" style="margin:0 0 14px">Expense information</div>'
    +'<div class="form-row"><div><label for="mr-date">Date of expense</label><input type="date" id="mr-date"></div>'
      +'<div><label for="mr-vendor">Vendor / payee</label><input type="text" id="mr-vendor" placeholder="Aircraft Spruce"></div></div>'
    +'<div class="form-row"><div><label for="mr-amt">Amount</label><input type="text" id="mr-amt" inputmode="decimal" placeholder="0.00"></div>'
      +'<div><label for="mr-job">Related job / aircraft</label><input type="text" id="mr-job" placeholder="N3115W"></div></div>'
    +'<div class="form-row"><div><label for="mr-pay">Payment method</label><select id="mr-pay">'+mrOpts(mrPayList())+'</select></div>'
      +'<div><label for="mr-cat">Expense category</label><input type="text" id="mr-cat" list="mr-cat-list" autocomplete="off">'+mrCatList()+'</div></div>'
  +'</div>'
  +'<div class="grid g2" style="margin-top:16px">'
    +'<div class="card pad">'
      +'<div class="section-title" style="margin:0 0 14px">Reason the receipt is missing</div>'
      +'<label for="mr-why">Reason</label><select id="mr-why">'+mrOpts(MR_WHY)+'</select>'
      +'<div style="margin-top:14px" id="mr-other-wrap" hidden><label for="mr-other">Details (if Other)</label><input type="text" id="mr-other"></div>'
      +'<div style="margin-top:14px"><label for="mr-desc">Description &amp; business purpose</label>'
      +'<textarea id="mr-desc" rows="4" placeholder="What was purchased and how it relates to the business"></textarea></div>'
    +'</div>'
    +'<div class="card pad">'
      +'<div class="section-title" style="margin:0 0 14px">Supporting documentation attached</div>'
      +'<div class="mr-chks">'+docs+'</div>'
      +'<p class="hint" style="margin-top:12px">Tick whatever you can produce instead of the receipt. Keep it with this affidavit.</p>'
    +'</div>'
  +'</div>'
  +'<div class="card pad" style="margin-top:16px">'
    +'<div class="section-title" style="margin:0 0 14px">Certification</div>'
    +'<p class="mr-cert">'+esc(MR_CERT)+'</p>'
    +'<div class="form-row"><div><label for="mr-by">Signed by (printed name)</label><input type="text" id="mr-by" value="'+esc(mrRecall('cj_mr_by'))+'"></div>'
      +'<div><label for="mr-title">Title / member</label><input type="text" id="mr-title" value="'+esc(mrRecall('cj_mr_title'))+'"></div></div>'
    +'<div class="form-row"><div><label for="mr-signed">Date signed</label><input type="date" id="mr-signed" value="'+today+'"></div>'
      +'<div><label for="mr-rev">Reviewed by (2nd member, optional)</label><input type="text" id="mr-rev"></div></div>'
    +'<div class="mr-actions">'
      +'<button class="btn" id="mr-pdf">🖨 Download PDF</button>'
      +'<button class="btn ghost" id="mr-clear">Clear form</button>'
    +'</div>'
  +'</div>'
  +'</div>'
  +'<div id="mr-doc"></div>';
}

function mrBuildDoc(){
  var box=$('#mr-doc'); if(!box) return;
  var checked={}, boxes=document.querySelectorAll('.mr-doc');
  for(var i=0;i<boxes.length;i++) if(boxes[i].checked) checked[boxes[i].value]=1;
  var amt=parseFloat(mrVal('#mr-amt').replace(/[^0-9.]/g,''));
  function r(label,val,cls){ return '<tr><td class="mrl">'+esc(label)+'</td><td class="mrv'+(cls?' '+cls:'')+'">'+esc(val||'')+'</td></tr>'; }
  var docs='';
  for(var k=0;k<MR_DOCS.length;k++)
    docs+='<tr><td class="mrc">'+(checked[MR_DOCS[k]]?'☑':'☐')+'</td><td class="mrd">'+esc(MR_DOCS[k])+'</td></tr>';
  box.innerHTML=
    '<div class="mr-page">'
   +'<div class="mr-head"><div class="mr-co">C&amp;J Aviation LLC</div>'
   +'<div class="mr-ti">MISSING RECEIPT AFFIDAVIT</div>'
   +'<div class="mr-note">Use when an original receipt is lost, missing, or never provided. Attach supporting documentation.</div></div>'
   +'<div class="mr-bar">EXPENSE INFORMATION</div>'
   +'<table class="mr-tb"><tbody>'
   + r('Date of Expense', mrDate(mrVal('#mr-date')),'num')
   + r('Vendor / Payee', mrVal('#mr-vendor'))
   + r('Amount ($)', isNaN(amt)?'':money(amt),'num')
   + r('Payment Method', mrVal('#mr-pay'))
   + r('Expense Category', mrVal('#mr-cat'))
   + r('Related Job / Aircraft', mrVal('#mr-job'))
   +'</tbody></table>'
   +'<div class="mr-bar">DESCRIPTION &amp; BUSINESS PURPOSE</div>'
   +'<div class="mr-sub">What was purchased and how it relates to business:</div>'
   +'<div class="mr-box">'+esc(mrVal('#mr-desc'))+'</div>'
   +'<div class="mr-bar">REASON RECEIPT IS MISSING</div>'
   +'<table class="mr-tb"><tbody>'
   + r('Reason', mrVal('#mr-why'))
   + r('Details (if Other)', mrVal('#mr-other'),'tall')
   +'</tbody></table>'
   +'<div class="mr-bar">SUPPORTING DOCUMENTATION ATTACHED</div>'
   +'<table class="mr-tb mr-dt"><tbody>'+docs+'</tbody></table>'
   +'<div class="mr-bar">CERTIFICATION</div>'
   +'<div class="mr-cert2">'+esc(MR_CERT)+'</div>'
   +'<table class="mr-tb"><tbody>'
   + r('Signed By (Printed Name)', mrVal('#mr-by'))
   + r('Title / Member', mrVal('#mr-title'))
   + r('Date Signed', mrDate(mrVal('#mr-signed')),'num')
   + r('Reviewed By (2nd Member, opt.)', mrVal('#mr-rev'))
   +'</tbody></table>'
   +'</div>';
}

function mrFlash(cls,msg){
  var f=$('#mr-flash'); if(!f) return;
  f.innerHTML=msg?'<div class="flash '+cls+'">'+esc(msg)+'</div>':'';
}

function wireMR(){
  var why=$('#mr-why'); if(!why) return;
  why.onchange=function(){ var w=$('#mr-other-wrap'); if(w) w.hidden=(why.value!=='Other'); mrFlash('',''); };
  var ids=['#mr-date','#mr-vendor','#mr-amt','#mr-by'];
  for(var i=0;i<ids.length;i++){ var e=$(ids[i]); if(e) e.oninput=function(){ mrFlash('',''); }; }
  var cl=$('#mr-clear');
  if(cl) cl.onclick=function(){
    var all=['#mr-date','#mr-vendor','#mr-amt','#mr-job','#mr-pay','#mr-cat','#mr-why','#mr-desc','#mr-other','#mr-rev'];
    for(var j=0;j<all.length;j++){ var el=$(all[j]); if(el) el.value=''; }
    var boxes=document.querySelectorAll('.mr-doc');
    for(var b=0;b<boxes.length;b++) boxes[b].checked=false;
    var w=$('#mr-other-wrap'); if(w) w.hidden=true;
    var d=$('#mr-doc'); if(d) d.innerHTML='';
    mrFlash('ok','Form cleared and ready for the next one.');
    setTimeout(function(){ mrFlash('',''); },1800);
  };
  var pd=$('#mr-pdf');
  if(pd) pd.onclick=function(){
    var miss=[];
    if(!mrVal('#mr-date')) miss.push('date of expense');
    if(!mrVal('#mr-vendor')) miss.push('vendor');
    if(!mrVal('#mr-amt')) miss.push('amount');
    if(!mrVal('#mr-why')) miss.push('reason');
    if(!mrVal('#mr-by')) miss.push('signed by');
    if(miss.length){ mrFlash('err','Fill in '+miss.join(', ')+' before saving the PDF.'); return; }
    mrFlash('','');
    try{ localStorage.setItem('cj_mr_by',mrVal('#mr-by')); localStorage.setItem('cj_mr_title',mrVal('#mr-title')); }catch(e){}
    mrBuildDoc();
    window.print();
  };
  window.onbeforeprint=function(){ if(current==='mr'){ mrBuildDoc(); document.body.classList.add('mr-only'); } };
  window.onafterprint=function(){ document.body.classList.remove('mr-only'); };
}

/* =====================================================================
   MILEAGE — monthly MileIQ log  (site 1.3.0)
   The MileIQ CSV is parsed here in the browser; only the month's totals
   and the raw file go to the server (Mileage.gs). Nothing reaches the
   General Ledger until Post is pressed for a month.
   ===================================================================== */
var ML_LIST=null, ML_FOLDER='', ML_REVIEW=null, ML_POST=null, ML_BUSY=false, ML_MSG=null;
var ML_DEFAULT_CREDIT='Due to Member – Joel';

/* Small CSV parser: quotes, doubled quotes, commas inside quotes, CRLF. */
function mlCsvParse(text){
  var rows=[], row=[], cell='', q=false, i, c;
  text=String(text||'').replace(/^﻿/,'');
  for(i=0;i<text.length;i++){ c=text.charAt(i);
    if(q){ if(c==='"'){ if(text.charAt(i+1)==='"'){ cell+='"'; i++; } else q=false; } else cell+=c; }
    else if(c==='"') q=true;
    else if(c===','){ row.push(cell); cell=''; }
    else if(c==='\n'||c==='\r'){ if(c==='\r'&&text.charAt(i+1)==='\n') i++; row.push(cell); rows.push(row); row=[]; cell=''; }
    else cell+=c;
  }
  if(cell!==''||row.length){ row.push(cell); rows.push(row); }
  return rows;
}
function mlMonthLabel(m){ var p=String(m||'').match(/^(\d{4})-(\d{2})/); var names=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; if(!p||!names[parseInt(p[2],10)-1]) return String(m||''); return names[parseInt(p[2],10)-1]+' '+p[1]; }
function mlR1(n){ return Math.round(Number(n)*10)/10; }

/* Turn a MileIQ export into one month record. Throws a readable error. */
function mlParseMileIQ(text, fileName){
  var rows=mlCsvParse(text);
  var rate=0, hdr=-1, i;
  for(i=0;i<rows.length;i++){
    var r=rows[i];
    if(r[0]&&/^rates/i.test(r[0])){ for(var k=1;k<r.length-1;k++){ if(/^business/i.test(r[k])){ rate=parseFloat(r[k+1]); break; } } }
    if(r[0]&&/^START_DATE/i.test(r[0])){ hdr=i; break; }
  }
  if(hdr<0) throw new Error('This does not look like a MileIQ export — no START_DATE column found.');
  var H={}; rows[hdr].forEach(function(h,idx){ H[String(h).replace(/\*/g,'').trim().toUpperCase()]=idx; });
  var need=['START_DATE','CATEGORY','MILES','VEHICLE','PURPOSE'];
  for(i=0;i<need.length;i++) if(H[need[i]]==null) throw new Error('MileIQ file is missing the '+need[i]+' column.');
  var months={}, biz=0, bizN=0, pers=0, comm=0, tot=0, veh={}, drives=0, rowRate=0;
  for(i=hdr+1;i<rows.length;i++){
    var d=rows[i]; if(!d[H.START_DATE]||!/^\d\d\/\d\d\/\d{4}/.test(d[H.START_DATE])) continue;
    var mi=parseFloat(d[H.MILES]); if(isNaN(mi)) continue;
    var mm=d[H.START_DATE].slice(6,10)+'-'+d[H.START_DATE].slice(0,2);
    months[mm]=(months[mm]||0)+1; drives++; tot+=mi;
    var cat=String(d[H.CATEGORY]||'').trim().toLowerCase();
    var purpose=String(d[H.PURPOSE]||'').trim().toLowerCase();
    if(cat==='business'){ biz+=mi; bizN++; var v=String(d[H.VEHICLE]||'').trim()||'(no vehicle)'; veh[v]=(veh[v]||0)+mi; if(H.RATE!=null){ var rr=parseFloat(d[H.RATE]); if(rr>0) rowRate=rr; } }
    else { pers+=mi; if(purpose==='commute') comm+=mi; }
  }
  if(!drives) throw new Error('No drives found in that file.');
  if(!(rate>0)) rate=rowRate;
  if(!(rate>0)) throw new Error('No business mileage rate found in the file.');
  var best='', bestN=0, mk=Object.keys(months), mixed=[];
  for(i=0;i<mk.length;i++){ if(months[mk[i]]>bestN){ best=mk[i]; bestN=months[mk[i]]; } }
  for(i=0;i<mk.length;i++) if(mk[i]!==best) mixed.push(mlMonthLabel(mk[i])+' ('+months[mk[i]]+')');
  var vlist=Object.keys(veh).map(function(k){ return k+' '+mlR1(veh[k]); });
  return { month:best, businessMiles:mlR1(biz), businessDrives:bizN, personalMiles:mlR1(pers), commuteMiles:mlR1(comm),
           totalMiles:mlR1(tot), rate:rate, amount:Math.round(biz*rate*100)/100, vehicles:vlist.join(' · '),
           drives:drives, fileName:fileName||'', warn: mixed.length?('Also contains drives from '+mixed.join(', ')+' — only the file’s main month is used.'):'' };
}

function mlFlash(kind,msg){ ML_MSG=msg?{kind:kind,msg:msg}:null; var el=document.getElementById('ml-flash'); if(el) el.innerHTML=ML_MSG?'<div class="flash '+ML_MSG.kind+'">'+(ML_MSG.kind==='ok'?'✓ ':'')+esc(ML_MSG.msg)+'</div>':''; }

function vMileage(){
  var top=topbar('Mileage','MileIQ monthly log · business miles × IRS rate · nothing posts to the ledger until you press Post');
  if(!ML_LIST) return top+'<div id="ml-flash"></div><div class="card"><div class="miniload"><div class="spin"></div>Loading the mileage log…</div></div>';
  return top+'<div id="ml-flash"></div>'+mlTopRow()+mlTable();
}
function mlTopRow(){
  var drop='<div class="card pad ml-add"><div class="section-title" style="margin-top:0">Add a month</div>'
    +'<label class="ml-drop" id="ml-drop"><input type="file" id="ml-file" accept=".csv,text/csv" style="display:none">'
    +(ML_BUSY?'<div class="miniload"><div class="spin"></div>Working…</div>':'<div><strong>Drop the MileIQ CSV here</strong><br><span class="hint">or tap to choose a file</span></div>')
    +'</label>'
    +'<div class="hint" style="margin-top:8px">Export the month from MileIQ as CSV. The file is filed in Drive › <a href="'+esc(ML_FOLDER)+'" target="_blank" rel="noopener">Milage Tracker</a> as the month’s backup.</div></div>';
  var rev='';
  if(ML_REVIEW){ var r=ML_REVIEW, exists=mlFind(r.month);
    rev='<div class="card pad ml-review"><div class="section-title" style="margin-top:0">Review · '+esc(mlMonthLabel(r.month))+'</div>'
      +'<div class="grid g3 ml-tiles">'
      +tile('navy','Business miles',mlR1(r.businessMiles),r.businessDrives+' drives')
      +tile('','Rate','$'+r.rate,'from the MileIQ file')
      +tile('ok','Value',money(r.amount),'miles × rate')
      +'</div>'
      +'<div class="hint">'+esc(r.vehicles)+'<br>Personal '+mlR1(r.personalMiles)+' mi (incl. commute '+mlR1(r.commuteMiles)+') — not counted · '+r.drives+' drives total · '+esc(r.fileName)+'</div>'
      +(r.warn?'<div class="flash err" style="margin-top:8px">'+esc(r.warn)+'</div>':'')
      +(exists?'<div class="flash '+(exists.postedTxn?'err':'busy')+'" style="margin-top:8px">'+(exists.postedTxn?esc(mlMonthLabel(r.month))+' is already posted to the ledger and cannot be replaced.':esc(mlMonthLabel(r.month))+' is already in the log — saving will replace its numbers and file the new CSV.')+'</div>':'')
      +'<div style="display:flex;gap:8px;margin-top:12px"><button class="btn sm" id="ml-save"'+((exists&&exists.postedTxn)||ML_BUSY?' disabled':'')+'>'+(exists?'Replace month':'Save month')+'</button><button class="btn sm ghost" id="ml-cancel">Cancel</button></div></div>';
  } else if(ML_POST){ rev=mlPostPanel(); }
  return '<div class="grid g2 ml-top">'+drop+rev+'</div>';
}
function mlFind(month){ for(var i=0;i<ML_LIST.length;i++) if(ML_LIST[i].month===month) return ML_LIST[i]; return null; }
function mlCreditOptions(sel){
  var A=(DATA&&DATA.accounts)||[], h='', groups={}, order=[], i;
  for(i=0;i<A.length;i++){ var a=A[i]; if(a.archived) continue; if(/^(Expense|Income)$/i.test(a.type)) continue; if(!/^\d/.test(a.code||'')) continue;
    var t=a.type||'Other'; if(!groups[t]){ groups[t]=[]; order.push(t); } groups[t].push(a); }
  for(i=0;i<order.length;i++){ h+='<optgroup label="'+esc(order[i])+'">'; var it=groups[order[i]];
    for(var k=0;k<it.length;k++) h+='<option value="'+esc(it[k].name)+'"'+(it[k].name===sel?' selected':'')+'>'+esc(it[k].code+' '+it[k].name)+'</option>'; h+='</optgroup>'; }
  return h;
}
function mlPostPanel(){
  var m=mlFind(ML_POST); if(!m) return '';
  var hasDefault=false, A=(DATA&&DATA.accounts)||[]; for(var i=0;i<A.length;i++) if(A[i].name===ML_DEFAULT_CREDIT&&!A[i].archived) hasDefault=true;
  return '<div class="card pad ml-review"><div class="section-title" style="margin-top:0">Post '+esc(mlMonthLabel(m.month))+' to the ledger</div>'
    +'<div class="hint">One entry dated the last day of the month:<br><b>Dr</b> Joel’s Vehicle Expenses '+money(m.amount)+' &nbsp;·&nbsp; <b>Cr</b> the account below '+money(m.amount)+'</div>'
    +'<div class="form-row" style="margin-top:10px"><label>Credit account</label><select id="ml-credit">'+mlCreditOptions(hasDefault?ML_DEFAULT_CREDIT:'')+'</select></div>'
    +(hasDefault?'':'<div class="flash busy" style="margin-top:8px">Tip: add a Liability account named “'+esc(ML_DEFAULT_CREDIT)+'” on the Chart of Accounts tab if you want to accrue it rather than pay it now.</div>')
    +'<div style="display:flex;gap:8px;margin-top:12px"><button class="btn sm" id="ml-post-go"'+(ML_BUSY?' disabled':'')+'>Post entry</button><button class="btn sm ghost" id="ml-post-cancel">Cancel</button></div></div>';
}
function mlTable(){
  var L=ML_LIST, h='', tb=0, ta=0, i, unposted=0;
  for(i=0;i<L.length;i++){ var m=L[i]; tb+=m.businessMiles; ta+=m.amount; if(!m.postedTxn) unposted++;
    h+='<tr><td style="white-space:nowrap">'+esc(mlMonthLabel(m.month))+'</td><td class="num">'+mlR1(m.businessMiles)+'</td><td class="num">'+m.businessDrives+'</td><td class="num">$'+m.rate+'</td><td class="num">'+money(m.amount)+'</td>'
      +'<td>'+(m.fileUrl?'<a href="'+esc(m.fileUrl)+'" target="_blank" rel="noopener" title="'+esc(m.fileName)+'">CSV</a>':'<span class="hint">—</span>')+'</td>'
      +'<td>'+(m.postedTxn?'<span class="chip ok" title="'+esc(m.postedTxn)+'">Posted '+esc(m.postedOn)+'</span>':'<span class="chip">Not posted</span>')+'</td>'
      +'<td style="white-space:nowrap">'+(m.postedTxn?'':'<button class="btn ghost" style="padding:3px 8px;font-size:11px" data-mlpost="'+esc(m.month)+'">Post</button> <button class="btn ghost" style="padding:3px 8px;font-size:11px" data-mldel="'+esc(m.month)+'" title="Remove this month from the log">✕</button>')+'</td></tr>';
  }
  if(!L.length) h='<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--muted)">No months logged yet. Drop a MileIQ CSV above to start.</td></tr>';
  var foot='<tr class="ml-total"><td>'+(L.length?L[L.length-1].month.slice(0,4)+' to date':'')+'</td><td class="num">'+mlR1(tb)+'</td><td></td><td></td><td class="num">'+money(ta)+'</td><td colspan="3" class="hint">'+(unposted?unposted+' month'+(unposted>1?'s':'')+' not posted':'')+'</td></tr>';
  return '<div class="card scroll"><table class="tb ml-tbl"><thead><tr><th>Month</th><th class="num">Business mi</th><th class="num">Drives</th><th class="num">Rate</th><th class="num">Amount</th><th>File</th><th>Ledger</th><th></th></tr></thead><tbody>'+h+foot+'</tbody></table></div>'
    +'<div class="hint" style="margin:10px 4px">Year end: keep the annual MileIQ PDF with the tax file. Post each month (or all of them at once at tax time) once the truck’s treatment is settled with the CPA. Posting one month never changes another.</div>';
}
function paintMileage(){ if(current==='mileage'){ render('mileage'); if(ML_MSG) mlFlash(ML_MSG.kind,ML_MSG.msg); } }
function loadMileage(){
  if(ML_LIST){ wireMileage(); return; }
  google.script.run.withSuccessHandler(function(d){ ML_LIST=d.months||[]; ML_FOLDER=d.folderUrl||''; paintMileage(); })
    .withFailureHandler(function(e){ if(current==='mileage'){ var ml=$('#content .miniload'); if(ml) ml.innerHTML='Could not load the mileage log: '+esc(e.message||e); } })
    .mileageGet();
}
function mlOnFile(file){
  if(!file) return;
  if(!/\.csv$/i.test(file.name)){ mlFlash('err','That is not a CSV file. Export the month from MileIQ as CSV.'); return; }
  var fr=new FileReader();
  fr.onload=function(){
    try{ var rec=mlParseMileIQ(fr.result, file.name); rec._b64=btoa(unescape(encodeURIComponent(fr.result))); ML_REVIEW=rec; ML_POST=null; ML_MSG=null; paintMileage(); }
    catch(err){ mlFlash('err',err.message||String(err)); }
  };
  fr.onerror=function(){ mlFlash('err','Could not read that file.'); };
  fr.readAsText(file);
}
function wireMileage(){
  var inp=document.getElementById('ml-file'), drop=document.getElementById('ml-drop');
  if(inp) inp.onchange=function(){ mlOnFile(this.files&&this.files[0]); this.value=''; };
  if(drop){
    drop.ondragover=function(e){ e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave=function(){ drop.classList.remove('over'); };
    drop.ondrop=function(e){ e.preventDefault(); drop.classList.remove('over'); var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; mlOnFile(f); };
  }
  var sv=document.getElementById('ml-save'); if(sv) sv.onclick=function(){
    var r=ML_REVIEW; if(!r||ML_BUSY) return; ML_BUSY=true; paintMileage();
    var rec={month:r.month,businessMiles:r.businessMiles,businessDrives:r.businessDrives,personalMiles:r.personalMiles,commuteMiles:r.commuteMiles,totalMiles:r.totalMiles,rate:r.rate,vehicles:r.vehicles,notes:r.warn||''};
    google.script.run.withSuccessHandler(function(d){ ML_LIST=d.months||[]; ML_FOLDER=d.folderUrl||ML_FOLDER; ML_BUSY=false; ML_REVIEW=null; ML_MSG={kind:'ok',msg:mlMonthLabel(rec.month)+' saved — '+rec.businessMiles+' business mi, '+money(r.amount)+'. CSV filed in Drive.'}; paintMileage(); })
      .withFailureHandler(function(e){ ML_BUSY=false; ML_MSG={kind:'err',msg:e.message||String(e)}; paintMileage(); })
      .mileageSave(rec, r._b64, r.fileName);
  };
  var cn=document.getElementById('ml-cancel'); if(cn) cn.onclick=function(){ ML_REVIEW=null; ML_MSG=null; paintMileage(); };
  var ps=document.querySelectorAll('[data-mlpost]'); for(var i=0;i<ps.length;i++) ps[i].onclick=function(){ ML_POST=this.getAttribute('data-mlpost'); ML_REVIEW=null; ML_MSG=null; paintMileage(); };
  var pc=document.getElementById('ml-post-cancel'); if(pc) pc.onclick=function(){ ML_POST=null; paintMileage(); };
  var pg=document.getElementById('ml-post-go'); if(pg) pg.onclick=function(){
    var month=ML_POST, sel=document.getElementById('ml-credit'), acct=sel?sel.value:''; if(!month||!acct||ML_BUSY) return;
    if(!confirm('Post '+mlMonthLabel(month)+' to the General Ledger?\n\nDr Joel’s Vehicle Expenses / Cr '+acct)) return;
    ML_BUSY=true; paintMileage();
    google.script.run.withSuccessHandler(function(res){ ML_LIST=(res.list&&res.list.months)||ML_LIST; ML_BUSY=false; ML_POST=null; LEDGER_CACHE=null; ML_MSG={kind:'ok',msg:mlMonthLabel(month)+' posted — '+money(res.amount)+' ('+res.txnId+').'}; paintMileage(); glRefreshReports(); })
      .withFailureHandler(function(e){ ML_BUSY=false; ML_MSG={kind:'err',msg:e.message||String(e)}; paintMileage(); })
      .mileagePost(month, acct);
  };
  var ds=document.querySelectorAll('[data-mldel]'); for(var k=0;k<ds.length;k++) ds[k].onclick=function(){
    var month=this.getAttribute('data-mldel'); if(ML_BUSY) return;
    if(!confirm('Remove '+mlMonthLabel(month)+' from the mileage log? The CSV stays in Drive (renamed).')) return;
    ML_BUSY=true; paintMileage();
    google.script.run.withSuccessHandler(function(d){ ML_LIST=d.months||[]; ML_BUSY=false; ML_MSG={kind:'ok',msg:mlMonthLabel(month)+' removed.'}; paintMileage(); })
      .withFailureHandler(function(e){ ML_BUSY=false; ML_MSG={kind:'err',msg:e.message||String(e)}; paintMileage(); })
      .mileageDelete(month);
  };
}
