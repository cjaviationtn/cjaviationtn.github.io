

var DATA=null, current='dashboard';
var COA_CACHE=null, COA_EDIT_ROW=null, COA_MSG=null, COA_SHOW_ARCH=false, COA_PANEL=null;
var LEDGER_CACHE=null, VR_CACHE=null, LOGO_URI='';


function $(s){return document.querySelector(s);}
function money(n){ if(n==null||n===''||isNaN(n)) return ''; n=Number(n); return (n<0?'-':'')+'$'+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function findVal(arr,label){ for(var i=0;i<arr.length;i++){ if(arr[i].label.replace(/\s+/g,' ').trim()===label) return arr[i].value; } return null; }
function startsAny(s,arr){ s=s.replace(/\s+/g,' ').trim(); for(var i=0;i<arr.length;i++) if(s.indexOf(arr[i])===0) return true; return false; }


function boot(){
  $('#root').innerHTML='<div class="loading"><div><div class="spin"></div>Loading your books…</div></div>';
  google.script.run
    .withSuccessHandler(function(d){ DATA=d; buildShell(); render(viewFromHash()); })
    .withFailureHandler(function(e){
      if(e && e.code==='AUTH'){ showSignIn(''); return; }
      $('#root').innerHTML='<div class="loading"><div>Could not load the sheet.<br><span class="hint">'+esc(e.message||e)+'</span><br><br><button class="btn ghost sm" onclick="boot()">Try again</button></div></div>'; })
    .getBootstrap();
}

/* ---- sign-in ------------------------------------------------------- */
function viewFromHash(){ var h=(location.hash||'').replace('#',''); return VIEWS[h]?h:'dashboard'; }
function showSignIn(msg){
  $('#root').innerHTML=
    '<div class="signin"><div class="signin-card">'
    +'<div class="logo-badge"></div>'
    +'<h1>C&amp;J AVIATION</h1><div class="tagline">Aircraft Mechanics</div>'
    +'<div class="subtag">Accounting/Admin</div>'
    +'<p class="hint">Sign in with the Google account that has access to the books.</p>'
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
window.addEventListener('hashchange', function(){ if(DATA && viewFromHash()!==current) render(viewFromHash()); });
function startApp(){
  if(CJ.session()) boot(); else showSignIn('');
}

var NAV=[
  ['dashboard','◧','Dashboard'],
  ['entry','＋','New Transaction'],
  ['ledger','≣','General Ledger'],
  ['tbx','⧉','TBX'],
  ['pl','▤','Income Statement'],
  ['bs','▦','Balance Sheet'],
  ['equity','◐','LLC Member Equity'],
  ['coa','☰','Chart of Accounts'],
  ['vendors','⚑','Vendor Rules'],
  ['po','◨','Purchase Orders'],
  ['pay','$','Payroll'],
  ['cal','🔧','CTK']
];
var VIEW_TITLE={dashboard:'Dashboard',entry:'New Transaction',ledger:'General Ledger',tbx:'TBX Invoice Summary',pl:'Income Statement (P&L)',bs:'Balance Sheet',equity:'Member Equity',coa:'Chart of Accounts',vendors:'Vendor Rules',po:'Purchase Orders',pay:'Payroll',cal:'CTK — Calibrated Tool Kit'};

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
    '<div class="app"><aside class="side">'
    +'<button class="side-toggle" id="side-toggle"></button>'
    +'<div class="brand"><div class="logo-badge"></div><div class="btxt"><h1>C&J AVIATION</h1><span class="tagline">Aircraft Mechanics</span><span class="subtag">Accounting/Admin Page</span></div></div>'
    +'<nav class="nav" id="nav">'+navHtml+'</nav>'
    +'<div class="foot">Reads &amp; writes your Google Sheet live.<br>Loaded '+esc(DATA.generatedAt)+'.'
    +'<div class="who">'+esc((CJ.session()||{}).email||'')+' · <a href="#" id="signout">Sign out</a></div></div>'
    +'</aside><main class="main"><div class="mobile-nav" id="mnav"></div><div id="content"></div></main></div>';
  var btns=document.querySelectorAll('#nav button');
  for(var j=0;j<btns.length;j++) btns[j].onclick=function(){ render(this.getAttribute('data-view')); };

  var so=document.getElementById('signout'); if(so) so.onclick=function(ev){ ev.preventDefault(); signOut(); };
  var tog=document.getElementById('side-toggle');
  if(tog) tog.onclick=function(){ SIDE_NARROW=!SIDE_NARROW;
    try{ localStorage.setItem('cj_side', SIDE_NARROW?'1':'0'); }catch(e){}
    applySide(); };
  applySide();

  try{ var bg=getComputedStyle(document.querySelector('.brand .logo-badge')).backgroundImage;
       var mm=bg.match(/url\((['"]?)(.*?)\1\)/); if(mm) LOGO_URI=mm[2]; }catch(e){}
}


var VIEWS={dashboard:vDashboard,entry:vEntry,ledger:vLedger,tbx:vTBX,pl:vPL,bs:vBS,equity:vEquity,coa:vCOA,vendors:vVendors,po:vPO,pay:vPay,cal:vCal};
function render(v){
  current=v;
  if(location.hash!=='#'+v){ try{ history.replaceState(null,'','#'+v); }catch(e){ location.hash=v; } }
  var mainEl=document.querySelector('.main');
  if(mainEl) mainEl.classList.toggle('wide', v==='ledger');
  $('#content').innerHTML=printHead(VIEW_TITLE[v])+VIEWS[v]();
  var btns=document.querySelectorAll('#nav button');
  for(var i=0;i<btns.length;i++) btns[i].classList.toggle('active',btns[i].getAttribute('data-view')===v);
  renderMnav(); injectPrintControls();
  if(v==='dashboard') loadDash();
  if(v==='entry') wireEntry();
  if(v==='ledger') loadLedger();
  if(v==='tbx') wireTBX();
  if(v==='vendors') loadVendors();
  if(v==='coa') loadCOA();
  if(v==='cal') loadCal();
  if(v==='po') loadPO();
  if(v==='pay') loadPay();
}
function renderMnav(){
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
  var IS=DATA.incomeStatement, BS=DATA.balanceSheet, ST=DATA.salesTax;
  var rev=findVal(IS,'Total Revenue'), cogs=findVal(IS,'Cost of Goods Sold'), gp=findVal(IS,'Gross Profit'),
      net=findVal(IS,'NET INCOME / (LOSS)'); if(net==null) net=findVal(IS,'Net Income / (Loss)');
  var assets=findVal(BS,'Total Assets'), liab=findVal(BS,'Total Liabilities'), eq=findVal(BS,'Total Equity');
  var balchk=findVal(BS,'⚖ Balance Check (must equal $0.00)'); if(balchk==null) balchk=0;
  var chk=findVal(BS,'Cash / VolFed Business Checking'), sav=findVal(BS,'Cash / VolFed Business Savings'),
      ven=findVal(BS,'Venmo Business Account'), amex=findVal(BS,'AMEX Credit Card');
  var exp=[]; for(var i=0;i<IS.length;i++){ var r=IS[i]; var elab=r.label.replace(/\s+/g,' ').trim();
    if(r.value!=null && r.value>0 && elab!=='Cost of Goods Sold'
       && !startsAny(r.label,['Total','Gross','NET','Net','REVENUE','COST','OPERATING','Maintenance','Parts','Interest','Other Income'])) exp.push([elab,r.value]); }
  exp.sort(function(a,b){return b[1]-a[1];}); exp=exp.slice(0,6);
  var maxE=exp.length?exp[0][1]:1;

  return '<div class="dash-print">'+topbar('Dashboard','Live summary · pulled from your General Ledger'+(DATA.ledgerUpdated?'  ·  <span class="lupd">Ledger last updated: '+esc(DATA.ledgerUpdated)+'</span>':''))
  +opsSection()
  +'<div class="grid g4">'
  +tile('navy','Total Revenue',money(rev),'YTD invoiced &amp; earned')
  +tile('','Cost of Goods Sold',money(cogs),'Gross profit '+money(gp))
  +tile('ok','Gross Profit',money(gp),(rev?((gp/rev*100).toFixed(1)+'% margin'):''))
  +tile(net<0?'red':'ok','Net Income','<span class="'+(net<0?'neg':'pos')+'">'+money(net)+'</span>',net<0?'Operating at a loss YTD':'Profit YTD')
  +'</div>'
  +'<div class="section-title">Account balances</div><div class="grid g4">'
  +tile('navy','VolFed Checking',money(chk),'')
  +tile('navy','VolFed Savings',money(sav),'')
  +tile(ven<0?'red':'navy','Venmo Balance','<span class="'+(ven<0?'neg':'')+'">'+money(ven)+'</span>','')
  +tile('navy','AMEX Balance',(amex>0?'<span class="neg">'+money(amex)+'</span>':money(amex)),(amex<0?'credit':'owed'))
  +'</div>'
  +'<div class="section-title">Sales tax (TBX invoices)</div><div class="grid g2">'
  +tile('red','Sales Tax Payable','<span class="neg">'+money(findVal(BS,'Sales Tax Payable'))+'</span>','running liability to the state')
  +tile('','Owed YTD',money(ST.ytd),'')
  +'</div>'
  +'<div class="grid g2" style="margin-top:16px">'
  +'<div class="card pad"><div class="section-title" style="margin:0 0 14px">Balance sheet snapshot</div><table><tbody>'
    +row2('Total Assets',money(assets))+row2('Total Liabilities',money(liab))+row2('Total Equity',money(eq))
    +'<tr class="tot"><td>Balance Check</td><td class="num '+(Math.abs(balchk)<0.005?'pos':'neg')+'">'+money(balchk)+'</td></tr></tbody></table></div>'
  +'<div class="card pad"><div class="section-title" style="margin:0 0 14px">Top expenses (YTD)</div>'
    +exp.map(function(e){return '<div style="margin-bottom:11px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px"><span>'+esc(e[0])+'</span><span style="font-variant-numeric:tabular-nums">'+money(e[1])+'</span></div><div class="bar"><span style="width:'+(e[1]/maxE*100).toFixed(0)+'%;background:linear-gradient(90deg,var(--gold),var(--red))"></span></div></div>';}).join('')
    +'</div></div></div>';
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
  wireOps();
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
  wireOps();
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
  return '<div class="grid g3">'
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
var GL_FILTERS={}, GL_SORT={key:null,dir:1};
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
function cellHtml(r,k){ var d=glDef(k);
  if(k==='account') return accountCell(r);
  if(d&&d.num) return r[k]!=null?money(r[k]):'';
  if(k==='date') return '<span style="white-space:nowrap">'+esc(r.date)+'</span>';
  return esc(r[k]);
}
function ledgerRows(){
  var rows=LEDGER_CACHE.slice();
  rows=rows.filter(function(r){ for(var k in GL_FILTERS){ var a=GL_FILTERS[k]; if(!a) continue; if(!a[cellStr(r,k)]) return false; } return true; });
  if(GL_SORT.key){ var k=GL_SORT.key,dir=GL_SORT.dir,d=glDef(k);
    rows.sort(function(a,b){
      if(d&&d.num){ var av=a[k]==null?-Infinity:a[k], bv=b[k]==null?-Infinity:b[k]; return (av-bv)*dir; }
      var as=cellStr(a,k).toLowerCase(), bs=cellStr(b,k).toLowerCase(); return as<bs?-dir:as>bs?dir:0;
    });
  }
  return rows;
}
function glHeadRow(){
  var h='<tr>';
  for(var i=0;i<GL_DEF.length;i++){ var d=GL_DEF[i]; var sorted=GL_SORT.key===d.key; var filt=!!GL_FILTERS[d.key];
    var arrow=sorted?(GL_SORT.dir>0?' ▲':' ▼'):'';
    h+='<th class="'+(d.num?'num ':'')+(filt?'filtered':'')+'">'+esc(d.label)+arrow+'<button class="fbtn'+((sorted||filt)?' active':'')+'" data-key="'+d.key+'">▾</button></th>';
  }
  return h+'<th style="width:104px">Actions</th></tr>';
}
function glBody(){
  var rows=ledgerRows(); if(!rows.length) return '<tr><td colspan="12" style="text-align:center;padding:20px;color:var(--muted)">No rows match the current filters. <a href="#" id="gl-clearall">Clear all filters</a></td></tr>';
  var rh='';
  for(var r=0;r<rows.length;r++){ var x=rows[r];
    if(GL_EDIT_ROW===x.rowNum){ rh+=glEditRow(x); continue; }
    rh+='<tr'+(isReview(x)?' class="rev-row"':'')+'>';
    for(var c=0;c<GL_DEF.length;c++){ var k=GL_DEF[c].key; rh+='<td'+(GL_DEF[c].num?' class="num"':'')+'>'+cellHtml(x,k)+'</td>'; }
    rh+='<td style="white-space:nowrap"><button class="btn ghost" style="padding:3px 8px;font-size:11px" data-gledit="'+x.rowNum+'">Edit</button> <button class="btn ghost" style="padding:3px 8px;font-size:11px" data-gldel="'+x.rowNum+'" title="Delete this transaction">\u2715</button></td>';
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
    .withSuccessHandler(function(d){ LEDGER_CACHE=d; GL_EDIT_ROW=null; if(current==='ledger') render('ledger'); glRefreshReports(); })
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
    .withSuccessHandler(function(d){ LEDGER_CACHE=d; GL_EDIT_ROW=null; if(current==='ledger') render('ledger'); glRefreshReports(); })
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
  var ro=document.getElementById('rev-only'); if(ro) ro.onclick=function(){ GL_FILTERS={account:{'REVIEW':true}}; repaintLedger(); };
  var ra=document.getElementById('rev-all'); if(ra) ra.onclick=function(){ GL_FILTERS={}; repaintLedger(); };
  var eds=document.querySelectorAll('[data-gledit]');
  for(var e1=0;e1<eds.length;e1++) eds[e1].onclick=function(){ GL_EDIT_ROW=parseInt(this.getAttribute('data-gledit'),10); repaintLedger(); };
  var dls=document.querySelectorAll('[data-gldel]');
  for(var d1=0;d1<dls.length;d1++) dls[d1].onclick=function(){ glDelete(parseInt(this.getAttribute('data-gldel'),10)); };
  var glc=document.querySelector('[data-glcancel]'); if(glc) glc.onclick=function(){ GL_EDIT_ROW=null; repaintLedger(); };
  var gls=document.querySelector('[data-glsave]'); if(gls) gls.onclick=function(){ glSave(parseInt(this.getAttribute('data-glsave'),10), this); };
}
function setLedgerAccount(rowNum, acct, selEl){
  var wasReview=false;
  for(var i=0;i<LEDGER_CACHE.length;i++){ if(LEDGER_CACHE[i].rowNum===rowNum){ wasReview=(LEDGER_CACHE[i].account==='REVIEW'); break; } }
  selEl.disabled=true; selEl.style.opacity='.6';
  google.script.run
    .withSuccessHandler(function(res){
      for(var i=0;i<LEDGER_CACHE.length;i++){ if(LEDGER_CACHE[i].rowNum===res.rowNum){ LEDGER_CACHE[i].account=res.account; LEDGER_CACHE[i].entryCheck=res.entryCheck; break; } }
      if(wasReview && current==='ledger'){ render('ledger'); return; }
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
    +'<div class="card scroll"><table class="tb"><thead>'+thead+'</thead><tbody id="vr-body">'+rows+'</tbody></table></div>';
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
  var amt=$('#f-amt'),type=$('#f-type'),selA=$('#f-a'),selB=$('#f-b'),desc=$('#f-desc'),date=$('#f-date'),
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
      ? { date:date.value, amount:a, desc:desc.value, direction:'transfer', fromAccount:{code:selCode(selA),name:selA.value}, toAccount:{code:selCode(selB),name:selB.value} }
      : { date:date.value, amount:a, desc:desc.value, direction:t, moneyAccount:{code:selCode(selA),name:selA.value}, categoryAccount:{name:selB.value} };
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
var PO_TYPES=['Consumable','Customer Part','Bench Stock'];
var PO_STATUSES=['Open','Partially Received','Received','Closed/Paid','Cancelled'];

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

function poChip(status){
  var map={
    'Open':['#8a6d1e','#fbf6e9'],
    'Partially Received':['#1c4e80','#dce7f2'],
    'Received':['#256a3f','#dcefe2'],
    'Closed/Paid':['#2B4865','#e7edf3'],
    'Cancelled':['#8a2f22','#f7e3df']
  };
  var c=map[status]||['#555','#eee'];
  return '<span class="chip" style="background:'+c[1]+';color:'+c[0]+';border-color:'+c[0]+'33;font-weight:700">'+esc(status||'—')+'</span>';
}

function paintPO(){
  var d=PO_CACHE, w=$('#po-wrap'); if(!w) return;
  if(PO_MSG){ var f=$('#po-flash'); if(f) f.innerHTML='<div class="flash ok">'+esc(PO_MSG)+'</div>'; PO_MSG=null; }

  var tiles='<div class="grid g4" style="margin-bottom:6px">'
    + tile(d.openCount>0?'warn':'ok','Open POs',String(d.openCount),d.openCount>0?'awaiting parts / invoice':'all caught up')
    + tile('navy','Outstanding',money(d.outstanding),'value of open POs')
    + tile('navy','POs This Year',String(d.ytdCount),'excludes cancelled')
    + tile('navy','YTD PO Spend',money(d.ytdSpend),'ordered to date')
    + '</div>';


  var newBtn='<div class="actions"><button class="btn gold" id="po-newtoggle">＋ New Purchase Order</button>'
    + '<button class="btn ghost" id="po-pull">⤓ Pull vendor emails</button>'
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
        + '<td>'+poChip(p.status)+'</td>'
        + '<td class="num">'+(p.total!=null?money(p.total):'')+'</td>'
        + '<td style="white-space:nowrap">'+esc(poFmtDate(p.received))+'</td>'
        + '<td style="white-space:nowrap">'+esc(p.invoice)+' <button class="btn ghost" style="padding:4px 10px;font-size:12px" data-popdf="'+p.row+'">PDF</button> <button class="btn ghost" style="padding:4px 10px;font-size:12px" data-poedit="'+p.row+'">Update</button></td>'
        + '</tr>';
    }
  }

  var table='<div class="card pad"><div class="scroll"><table class="tb"><thead><tr>'
    + '<th>PO #</th><th>Date</th><th>Vendor</th><th>WO / Aircraft</th><th>Type</th><th>Description</th>'
    + '<th>Status</th><th class="num">Total</th><th>Received</th><th>Invoice / Action</th>'
    + '</tr></thead><tbody>'+body+'</tbody></table></div></div>';

  w.innerHTML=tiles+newBtn+newForm+fbar+table;
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
  var statusOpts=''; for(var i=0;i<PO_STATUSES.length;i++) statusOpts+='<option value="'+PO_STATUSES[i]+'"'+(p.status===PO_STATUSES[i]?' selected':'')+'>'+PO_STATUSES[i]+'</option>';
  return '<tr class="rev-row"><td style="font-weight:700">'+esc(p.po)+'</td>'
    + '<td colspan="9"><div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end">'
    + '<div style="min-width:150px"><label>Status</label><select class="poe-status">'+statusOpts+'</select></div>'
    + '<div style="min-width:140px"><label>Received date</label><input class="poe-received" type="date" value="'+esc(p.received||'')+'"></div>'
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
function poDownloadPdf(row, btn){
  if(btn){ btn.disabled=true; btn.textContent='…'; }
  google.script.run
    .withSuccessHandler(function(res){
      if(btn){ btn.disabled=false; btn.textContent='PDF'; }
      var a=document.createElement('a');
      a.href='data:application/pdf;base64,'+res.b64;
      a.download=res.filename||'PO.pdf';
      document.body.appendChild(a); a.click(); a.remove();
    })
    .withFailureHandler(function(e){ if(btn){ btn.disabled=false; btn.textContent='PDF'; } alert('Could not build PDF: '+(e.message||e)); })
    .poPdf(row);
}
function wirePO(){
  var t=$('#po-newtoggle'); if(t) t.onclick=function(){ PO_SHOW_NEW=!PO_SHOW_NEW; if(PO_SHOW_NEW) PO_NEW_ITEMS=null; paintPO(); };
  var cn=$('#po-cancelnew'); if(cn) cn.onclick=function(){ PO_SHOW_NEW=false; PO_NEW_ITEMS=null; paintPO(); };
  if(PO_SHOW_NEW){ poRenderItems(); var ai=$('#po-additem'); if(ai) ai.onclick=function(){ if(!PO_NEW_ITEMS) PO_NEW_ITEMS=[]; PO_NEW_ITEMS.push({qty:'',part:'',desc:'',price:''}); poRenderItems(); }; }

  var pull=$('#po-pull');
  if(pull) pull.onclick=function(){
    pull.disabled=true; pull.textContent='Checking email…';
    google.script.run
      .withSuccessHandler(function(res){
        PO_CACHE=res.data;
        var m='✓ '+res.updated+' row(s) updated from email.';
        if(res.notes && res.notes.length) m+='  Needs attention: '+res.notes.join('  ·  ');
        PO_MSG=m; paintPO();
      })
      .withFailureHandler(function(e){ pull.disabled=false; pull.textContent='⤓ Pull vendor emails'; alert('Could not pull emails: '+(e.message||e)); })
      .poPullEmails();
  };

  var fbtns=document.querySelectorAll('[data-pofilter]');
  for(var i=0;i<fbtns.length;i++) fbtns[i].onclick=function(){ PO_FILTER=this.getAttribute('data-pofilter'); PO_EDIT_ROW=null; paintPO(); };

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
    + 'On the clock now \u2014 '+c.length+'</div>'
    + '<div class="scroll"><table class="tb"><tbody>'+rows+'</tbody></table></div></div>';
}
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

  w.innerHTML=tiles+actions+panel+payClockCard_()+summary+payWoPanel()+recent;
  wirePay();
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
    + '<div class="scroll" ><table class="tb"><thead><tr><th>Name</th><th>Rate $/hr</th><th>Role / Notes</th><th>Last Pay Raise</th><th>Hire Date</th><th>Time clock link</th><th></th></tr></thead><tbody>'+rowsH+'</tbody></table></div>'
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

/* ---- version / staleness ------------------------------------------- */
/* Stamped in by doGet from SERVER_VERSION at the moment this page was built,
   so a cached copy keeps the version it shipped with. Never hand-type this. */
var CLIENT_VERSION = CJ_CONFIG.siteVersion;
var VER = { running: '', live: '', checked: false };

function verNormalize(r) {
  if (!r) return { running: '', live: '' };
  if (typeof r === 'string') return { running: r, live: r };
  return { running: r.running || '', live: r.live || '' };
}

/* '' = fine | 'cached' = browser holding an old page
   'deployment' = this URL points at an older deployment */
function verProblem() {
  if (!VER.checked) return '';
  if (VER.live && VER.running && VER.live !== VER.running) return 'deployment';
  return '';
}

function paintVerChip() {
  var sub = document.querySelector('.topbar .sub');
  if (!sub) return;
  if (sub.getAttribute('data-base') === null) sub.setAttribute('data-base', sub.textContent);
  var p = verProblem();
  sub.innerHTML = esc(sub.getAttribute('data-base')) +
    ' <span data-verchip="1" style="color:' + (p ? 'var(--warn)' : 'var(--muted)') +
    ';font-weight:600">· ' + esc(CLIENT_VERSION || '?') + (VER.running ? ' · API ' + esc(VER.running) : '') + (p ? ' ⚠' : '') + '</span>';
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
  bar.setAttribute('style',
    'position:fixed;top:0;left:0;right:0;z-index:99999;padding:10px 16px;' +
    'font-size:14px;font-weight:600;background:var(--warn);color:#fff;' +
    'display:flex;align-items:center;justify-content:space-between;gap:12px');
  bar.innerHTML =
    '<span>' + (p === 'cached'
      ? 'This page is out of date (' + esc(CLIENT_VERSION) + ' → ' + esc(VER.running) + ')'
      : 'Old deployment link (' + esc(VER.running) + ' → ' + esc(VER.live) + ')') +
    '</span>' +
    '<button onclick="hardReload()" style="border:0;border-radius:6px;padding:6px 14px;' +
    'font-weight:700;cursor:pointer;background:#fff;color:var(--warn)">Reload</button>';
}

function checkVersion() {
  if (!CJ.session()) return;
  google.script.run
    .withSuccessHandler(function (r) {
      VER = verNormalize(r);
      VER.checked = true;
      paintVerChip();
      paintUpdateBar();
    })
    .withFailureHandler(function () { /* offline: leave the page alone */ })
    .getVersion();
}

function hardReload() {
  window.location.href = location.pathname + '?v=' + Date.now() + (location.hash || '');
}

/* Re-check whenever this tab comes back to the foreground. */
document.addEventListener('visibilitychange', function () {
  if (!document.hidden) checkVersion();
});

/* The topbar is rendered by JS, so repaint the chip if it gets replaced. */
setInterval(function () {
  var sub = document.querySelector('.topbar .sub');
  if (sub && !sub.querySelector('[data-verchip]')) paintVerChip();
}, 1500);

paintVerChip();
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
  return '<div class="grid g4" style="margin-bottom:18px">'
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
    +'<div class="card scroll"><table class="tb ctk-tbl"><thead><tr>'
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

