/* =====================================================================
   C&J Aviation — Bench Stock, as a view of the admin site (cjaviationtn.org)
   Ported from the standalone Benchstock site (repo cjaviationtn/benchstock) on 22 Sep 2026.
   Talks to the Benchstock Apps Script (CJ_CONFIG.benchApiUrl) — the inventory sheet and its
   Code.gs are unchanged. Wrapped in a closure so nothing here collides with app.js.
   ===================================================================== */
(function(){
/* =====================================================================
   C&J Aviation — Bench Stock
   Static front end for GitHub Pages. Same app the shop already uses,
   with the Apps Script HTML service swapped for a JSON API over fetch,
   plus a PIN gate and the QR label generator folded in as a tab.
   ===================================================================== */

/* Joel dropped the shop PIN (Sep 2026): Bench Stock is used from the admin site, which sits
   behind Google sign-in. Set this to true to bring the PIN gate back — Api.gs has the matching
   API_REQUIRE_PIN switch. */
var REQUIRE_PIN = false;


var TOKEN = '';
try { TOKEN = localStorage.getItem('cj_bs_token') || ''; } catch(e){}

/* ---- Data layer: talks to the Google Sheet via the Apps Script API ----
   Sent as a plain POST with no custom headers, which keeps it a "simple"
   CORS request — add a Content-Type header and the browser fires a
   preflight OPTIONS that Apps Script cannot answer. */
function call(action, args){
  var url = CJ_CONFIG.benchApiUrl;
  if (!url || url.indexOf('PASTE_') === 0){
    return Promise.reject(new Error('API URL is not set in config.js'));
  }
  /* Apps Script answers through a googleusercontent redirect that now and then 404s or
     returns an HTML error page for a request that is perfectly fine — retry a couple of times
     before giving up, otherwise a single hiccup strands the tab on "Loading". */
  function attempt(n){
    return fetch(url, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify({ token: TOKEN, action: action, args: args || [] })
    }).then(function(r){
      if (!r.ok) throw new Error('Server returned ' + r.status);
      return r.text().then(function(t){
        try { return JSON.parse(t); } catch (e) { throw new Error('Server sent a non-JSON reply'); }
      });
    }).catch(function(e){
      if (n <= 0) throw e;
      console.warn('Bench Stock API retry after: ' + e.message);
      return new Promise(function(res){ setTimeout(res, 600); }).then(function(){ return attempt(n - 1); });
    });
  }
  return attempt(2).then(function(j){
    if (!j || !j.ok){
      var msg = (j && j.error) || 'Request failed';
      if (j && j.code === 'AUTH') { lockOut(); }
      throw new Error(msg);
    }
    return j.data;
  });
}

var API = {
  getParts:     function(){            return call('getParts'); },
  log:          function(pn,t,a,n){    return call('logTransaction',[pn,t,a,'',n]); },
  getYearEnd:   function(){            return call('getYearEnd'); },
  getImages:    function(pns){         return call('getImages',[pns]); },
  saveImage:    function(pn,f,t){      return call('saveImage',[pn,f,t]); },
  getFullImage: function(pn){          return call('getFullImage',[pn]); },
  deleteImage:  function(pn){          return call('deleteImage',[pn]); },
  addPart:      function(d){           return call('addPart',[d]); },
  deletePart:   function(pn){          return call('deletePart',[pn]); },
  updatePart:   function(pn,f){        return call('updatePart',[pn,f]); },
  getVersion:   function(){            return call('getVersion'); }
};

/* ---- PIN gate --------------------------------------------------------
   The PIN is checked server-side against Script Properties. What lands in
   localStorage is the token the server hands back, so the PIN itself is
   never stored on the phone and never appears in this repo. */
var CLIENT_VERSION = 'web-1';

function gateEl(id){ return document.getElementById(id); }

function submitPin(){
  var pin = (gateEl('gpin').value || '').trim();
  if (!pin){ gateEl('gerr').textContent = 'Enter the PIN'; return; }
  var btn = gateEl('gbtn');
  btn.disabled = true; btn.textContent = 'Checking…';
  gateEl('gerr').textContent = '';
  fetch(CJ_CONFIG.benchApiUrl, {
    method: 'POST', redirect: 'follow',
    body: JSON.stringify({ action: 'auth', args: [pin] })
  }).then(function(r){ return r.json(); }).then(function(j){
    btn.disabled = false; btn.textContent = 'Unlock';
    if (j && j.ok && j.data && j.data.token){
      TOKEN = j.data.token;
      try { localStorage.setItem('cj_bs_token', TOKEN); } catch(e){}
      openApp();
    } else {
      gateEl('gerr').textContent = 'That PIN was not accepted';
      gateEl('gpin').value = '';
      gateEl('gpin').focus();
    }
  }).catch(function(e){
    btn.disabled = false; btn.textContent = 'Unlock';
    gateEl('gerr').textContent = 'Could not reach the server';
  });
}

function lockOut(){
  if (!REQUIRE_PIN) return;   // gate is off; a stray AUTH reply must not strand the user
  TOKEN = '';
  try { localStorage.removeItem('cj_bs_token'); } catch(e){}
  var g = gateEl('gate');
  if (g){
    g.style.display = 'flex';
    document.getElementById('appwrap').hidden = true;
    gateEl('gerr').textContent = 'Session expired — enter the PIN again';
  }
}

function openApp(){
  gateEl('gate').style.display = 'none';
  document.getElementById('appwrap').hidden = false;
  boot();
}

/* ---- App state -------------------------------------------------------- */
var PARTS = [];
var modeByIdx = {};       // idx -> 'take' | 'add'
var IMG = {};             // partNumber -> thumbnail; '' = none
var FULL = {};            // partNumber -> full-size data URL, fetched on demand
var imgBusy = false;
var shownLimit = 25;
var yearLimit = 25;
var curTab = 'parts';
var curMatches = [];
var photoIdx = -1;
var booted = false;
var INITIAL_PN = '';
var view, sub, countEl, toastEl, toastTimer;

function toast(msg, isErr){
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ toastEl.className = 'toast'; }, 2600);
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function isLow(p){ return p.reorderPt != null && p.onHand <= p.reorderPt; }
function fmt(n){ n = Number(n)||0; return (Math.round(n*100)/100).toString(); }
function money(n){ return '$' + (Number(n)||0).toFixed(2); }

function boot(){
  if (booted) return;
  booted = true;
  view    = document.getElementById('view');
  sub     = document.getElementById('sub');
  countEl = document.getElementById('count');

  // A scanned QR label lands here as ?p=<part number>.
  INITIAL_PN = String(BS_DEEPLINK || '').replace(/["']/g,'').trim(); BS_DEEPLINK = '';

  API.getParts().then(function(parts){
    PARTS = parts || [];
    sub.textContent = PARTS.length + ' parts · record take / add below';
    var input = document.getElementById('q');
    input.addEventListener('input', function(){ shownLimit = 25; runSearch(input.value); });
    if (INITIAL_PN) input.value = INITIAL_PN;
    switchTab('parts');
  }).catch(function(e){
    view.innerHTML = '<div class="empty">Could not load inventory.<br>' + esc(e && e.message || e) + '</div>';
  });
}

function findIdx(pn){
  pn = String(pn||'').trim().toLowerCase();
  for (var i=0;i<PARTS.length;i++){
    if (PARTS[i].sprucePN.toLowerCase()===pn || (PARTS[i].commonPN||'').toLowerCase()===pn) return i;
  }
  return -1;
}

// Rank a part against the search text. Lower score = shown higher up.
// Primary order is which FIELD matched: bin name, then Aircraft Spruce P/N,
// then Common P/N, then description. Secondary order is HOW it matched:
// exact, then starts-with, then anywhere — so "A1" puts bin A1 above A10.
function searchScore(p, q){
  var fields = [
    (p.binName  || '').toLowerCase(),
    (p.sprucePN || '').toLowerCase(),
    (p.commonPN || '').toLowerCase(),
    (p.desc     || '').toLowerCase()
  ];
  for (var t = 0; t < fields.length; t++){
    var f = fields[t];
    if (!f) continue;
    if (f === q)              return t*10;
    if (f.indexOf(q) === 0)   return t*10 + 1;
    if (f.indexOf(q) > -1)    return t*10 + 2;
  }
  return -1;
}

function runSearch(q){
  q = String(q||'').trim().toLowerCase();
  curMatches = [];
  if (!q){
    for (var i=0;i<PARTS.length;i++) curMatches.push({p:PARTS[i], idx:i});
  } else {
    for (var j=0;j<PARTS.length;j++){
      var s = searchScore(PARTS[j], q);
      if (s > -1) curMatches.push({p:PARTS[j], idx:j, s:s});
    }
    curMatches.sort(function(a,b){ return (a.s - b.s) || (a.idx - b.idx); });
  }
  countEl.textContent = q ? (curMatches.length + ' match' + (curMatches.length===1?'':'es'))
                          : ('Showing all ' + PARTS.length + ' parts');
  renderList();
}

function renderList(){
  if (!curMatches.length){ view.innerHTML = '<div class="empty">No parts match your search.</div>'; return; }
  var slice = curMatches.slice(0, shownLimit);
  var html = '<ul class="list">' + slice.map(function(m){ return buildCard(m.p, m.idx); }).join('') + '</ul>';
  if (curMatches.length > shownLimit){
    html += '<button class="more" onclick="BS.showMore()">Show more (' + (curMatches.length - shownLimit) + ' more)</button>';
  }
  view.innerHTML = html;
  loadImagesFor(slice);
}
function showMore(){ shownLimit += 25; renderList(); }

function buildCard(p, idx){
  var low = isLow(p);
  var mode = modeByIdx[idx] || 'take';
  return ''
  + '<li class="card' + (low?' low':'') + '" id="card-' + idx + '">'
  + '  <div class="chead">'
  + '    ' + thumbHtml(p, idx)
  + '    <div class="info"><div class="pn">' + esc(p.sprucePN) + (low?'<span class="badge low">LOW</span>':'') + '</div>'
  +      (p.binName ? '<div class="common">Bin: ' + esc(p.binName) + '</div>' : '')
  +      (p.onOrder > 0 || p.poNum
           ? '<div class="common">ON ORDER' + (p.onOrder > 0 ? ' ' + fmt(p.onOrder) : '')
             + (p.poNum ? ' · PO ' + esc(p.poNum) : '') + '</div>'
           : '')
  +      (p.commonPN && p.commonPN!==p.sprucePN ? '<div class="common">Common P/N: ' + esc(p.commonPN) + '</div>' : '')
  +      '<div class="common wdesc">' + esc(p.desc||'') + '</div></div>'   /* wide layout only; .desc below is the phone one */
  + '    <div class="oh' + (low?' low':'') + '"><span class="n">' + fmt(p.onHand) + '</span><small>ON HAND'
  +        (p.reorderPt!=null?' · RO '+fmt(p.reorderPt):'') + '</small></div>'
  + '  </div>'
  + '  <div class="desc">' + esc(p.desc||'') + '</div>'
  + '  <div class="seg">'
  + '    <button class="take' + (mode==='take'?' on':'') + '" onclick="BS.setModeCard(' + idx + ',\'take\')">➖ Take out</button>'
  + '    <button class="add' + (mode==='add'?' on':'') + '" onclick="BS.setModeCard(' + idx + ',\'add\')">➕ Add / restock</button>'
  + '  </div>'
  + '  <div class="stepper">'
  + '    <button onclick="BS.bumpCard(' + idx + ',-1)">−</button>'
  + '    <input id="qty-' + idx + '" type="number" inputmode="numeric" value="1" min="1" oninput="BS.updLabel(' + idx + ')">'
  + '    <button onclick="BS.bumpCard(' + idx + ',1)">+</button>'
  + '  </div>'
  + '  <input class="notes" id="notes-' + idx + '" type="text" placeholder="Notes (optional) — e.g. tail #, work order">'
  + '  <button class="submit ' + mode + '" id="submit-' + idx + '" onclick="BS.submitCard(' + idx + ')">'
  +      (mode==='take'?'Record: took 1':'Record: added 1') + '</button>'
  + '  <a class="reorder" href="' + esc(p.reorderUrl) + '" target="_blank" rel="noopener">Reorder on Aircraft Spruce ↗</a>'
  + '  <div class="cardfoot">'
  +      '<button class="editlink" onclick="BS.openEdit(' + idx + ')">Edit count / reorder point</button>'
  +      '<button class="dellink" onclick="BS.askDeleteCard(' + idx + ')">Delete part</button></div>'
  + '</li>';
}

function replaceCard(idx){
  var el = document.getElementById('card-' + idx);
  if (!el) return;
  var tmp = document.createElement('div');
  tmp.innerHTML = buildCard(PARTS[idx], idx);
  el.parentNode.replaceChild(tmp.firstChild, el);
}

function setModeCard(idx, m){
  modeByIdx[idx] = m;
  var card = document.getElementById('card-' + idx);
  card.querySelector('.seg .take').className = 'take' + (m==='take'?' on':'');
  card.querySelector('.seg .add').className = 'add' + (m==='add'?' on':'');
  document.getElementById('submit-' + idx).className = 'submit ' + m;
  updLabel(idx);
}
function bumpCard(idx, d){
  var el = document.getElementById('qty-' + idx);
  var v = (parseInt(el.value,10)||0) + d; if (v<1) v=1;
  el.value = v; updLabel(idx);
}
function updLabel(idx){
  var q = parseInt(document.getElementById('qty-' + idx).value,10)||0;
  var m = modeByIdx[idx] || 'take';
  document.getElementById('submit-' + idx).textContent = (m==='take'?'Record: took ':'Record: added ') + q;
}

function submitCard(idx){
  var q = parseInt(document.getElementById('qty-' + idx).value,10)||0;
  if (q < 1){ toast('Enter a quantity of 1 or more', true); return; }
  var m = modeByIdx[idx] || 'take';
  var notes = document.getElementById('notes-' + idx).value || '';
  var pn = PARTS[idx].sprucePN;
  var taken = m==='take'?q:0, added = m==='add'?q:0;
  var btn = document.getElementById('submit-' + idx);
  btn.disabled = true; btn.textContent = 'Saving…';
  API.log(pn, taken, added, notes).then(function(updated){
    PARTS[idx] = updated;
    modeByIdx[idx] = 'take';
    replaceCard(idx);
    toast('✓ ' + (m==='take'?'Took ':'Added ') + q + ' — ' + fmt(updated.onHand) + ' on hand');
  }).catch(function(e){
    btn.disabled = false; updLabel(idx);
    toast('Error: ' + (e && e.message || e), true);
  });
}

/* ---- Manage: add / delete parts --------------------------------------- */
function renderManage(){
  sub.textContent = PARTS.length + ' parts in inventory';
  view.innerHTML = ''
    + '<div class="panel">'
    + '  <h3>Add a part</h3>'
    + '  <div class="psub">Goes straight into the Inventory tab, with the On Hand formula wired up.</div>'
    + '  <div class="fld"><label>AIRCRAFT SPRUCE P/N *</label>'
    + '    <input id="np" type="text" placeholder="e.g. AN960-416" autocapitalize="characters"></div>'
    + '  <div class="fld"><label>DESCRIPTION</label>'
    + '    <input id="nd" type="text" placeholder="e.g. WASHER FLAT AN960-416"></div>'
    + '  <div class="fld"><label>COMMON P/N</label>'
    + '    <input id="nc" type="text" placeholder="leave blank if same as above"></div>'
    + '  <div class="row2">'
    + '    <div class="fld"><label>QTY ON HAND *</label>'
    + '      <input id="no" type="number" inputmode="numeric" value="0" min="0"></div>'
    + '    <div class="fld"><label>REORDER AT</label>'
    + '      <input id="nr" type="number" inputmode="numeric" placeholder="optional"></div>'
    + '  </div>'
    + '  <div class="fld"><label>UNIT COST</label>'
    + '    <input id="nu" type="number" inputmode="decimal" step="0.0001" placeholder="e.g. 0.42">'
    + '    <div class="hint">Count one piece at a time — not packs.</div></div>'
    + '  <button class="btn-primary" id="addBtn" onclick="BS.doAddPart()">Add to inventory</button>'
    + '</div>'
    + '<div class="panel">'
    + '  <h3>Editing, photos &amp; deleting</h3>'
    + '  <div class="psub">Open the <b>Parts</b> tab and find the part. At the bottom of its card,'
    + '   <b>Edit count / reorder point</b> sets the on-hand number, reorder point and unit cost —'
    + '   use it for your initial counts. <b>Delete part</b> removes the row, with a confirm step.'
    + '   <br><br>For photos: tap the square to the left of the part number. If the part has no photo'
    + '   yet that opens the camera; if it already has one, it opens the photo full size, where you'
    + '   can replace or delete it.</div>'
    + '</div>'
    + '<div class="panel">'
    + '  <h3>This device</h3>'
    + '  <div class="psub">The site itself always loads fresh from the web — there is no pinned'
    + '   deployment to go stale. This shows which script version is answering.</div>'
    + '  <div id="verbox" style="font-size:13.5px">Checking…</div>'
    + (REQUIRE_PIN ? '  <button class="btn-danger" style="margin-top:12px" onclick="BS.signOutDevice()">Sign this device out</button>' : '')
    + '</div>';
  showVersions();
}

function showVersions(){
  var box = document.getElementById('verbox');
  if (!box) return;
  API.getVersion().then(function(sv){
    box.innerHTML =
        '<div style="display:flex;justify-content:space-between;padding:3px 0">'
      + '<span style="color:var(--muted)">Script version</span><b>' + esc(sv) + '</b></div>'
      + '<div style="display:flex;justify-content:space-between;padding:3px 0">'
      + '<span style="color:var(--muted)">Site build</span><b>' + esc(CLIENT_VERSION) + '</b></div>'
      + '<div style="margin-top:7px;font-weight:700;color:var(--ok)">✓ Connected</div>';
  }).catch(function(e){
    box.innerHTML = '<span style="color:var(--warn)">Could not reach the server: '
                  + esc(e && e.message || e) + '</span>';
  });
}

function signOutDevice(){
  try { localStorage.removeItem('cj_bs_token'); } catch(e){}
  location.reload();
}

/* ---- Edit a part's count / reorder point / unit cost ------------------- */
function openEdit(idx){
  var p = PARTS[idx];
  var card = document.getElementById('card-' + idx);
  if (!p || !card) return;
  card.querySelector('.cardfoot').innerHTML = ''
    + '<div class="editbox">'
    + '  <div class="eh">EDIT ' + esc(p.sprucePN) + '</div>'
    + '  <div class="erow">'
    + '    <div class="ef"><label>ON HAND</label>'
    + '      <input id="e-c-' + idx + '" type="number" inputmode="numeric" min="0" value="' + fmt(p.onHand) + '"></div>'
    + '    <div class="ef"><label>REORDER AT</label>'
    + '      <input id="e-r-' + idx + '" type="number" inputmode="numeric" min="0" placeholder="none" value="'
    +          (p.reorderPt == null ? '' : fmt(p.reorderPt)) + '"></div>'
    + '    <div class="ef"><label>UNIT COST</label>'
    + '      <input id="e-u-' + idx + '" type="number" inputmode="decimal" step="0.0001" placeholder="none" value="'
    +          (p.unitCost ? p.unitCost : '') + '"></div>'
    + '    <div class="ef"><label>ON ORDER</label>'
    + '      <input id="e-o-' + idx + '" type="number" inputmode="numeric" min="0" placeholder="none" value="'
    +        (p.onOrder ? p.onOrder : '') + '"></div>'
    + '    <div class="ef"><label>PO #</label>'
    + '      <input id="e-p-' + idx + '" type="text" placeholder="none" value="' + esc(p.poNum || '') + '"></div>'
    + '  </div>'
    + '  <div class="note">Setting On Hand adjusts the Opening Count so the number lands exactly here —'
    + '   your logged takes and adds are kept. Leave Reorder At blank for no LOW warning.</div>'
    + '  <div class="btns">'
    + '    <button class="cxl" onclick="BS.closeEdit(' + idx + ')">Cancel</button>'
    + '    <button class="save" id="e-s-' + idx + '" onclick="BS.saveEdit(' + idx + ')">Save</button>'
    + '  </div>'
    + '</div>';
  document.getElementById('e-c-' + idx).focus();
}

function footHtml(idx){
  return '<button class="editlink" onclick="BS.openEdit(' + idx + ')">Edit count / reorder point</button>'
       + '<button class="dellink" onclick="BS.askDeleteCard(' + idx + ')">Delete part</button>';
}
function closeEdit(idx){
  var card = document.getElementById('card-' + idx);
  if (card) card.querySelector('.cardfoot').innerHTML = footHtml(idx);
}

function saveEdit(idx){
  var p = PARTS[idx];
  if (!p) return;
  var cv = document.getElementById('e-c-' + idx).value;
  var rv = document.getElementById('e-r-' + idx).value;
  var uv = document.getElementById('e-u-' + idx).value;
  var ov = document.getElementById('e-o-' + idx).value;
  var pv = document.getElementById('e-p-' + idx).value;
  if (cv === '' || isNaN(parseFloat(cv)) || parseFloat(cv) < 0){
    toast('Enter a valid on-hand count', true); return;
  }
  var fields = {
    count:     parseFloat(cv),
    reorderPt: rv === '' ? '' : (parseFloat(rv) || 0),
    unitCost:  uv === '' ? '' : (parseFloat(uv) || 0),
    onOrder:   ov === '' ? 0 : (parseFloat(ov) || 0),
    poNum:     pv
  };
  var btn = document.getElementById('e-s-' + idx);
  btn.disabled = true; btn.textContent = 'Saving…';
  API.updatePart(p.sprucePN, fields).then(function(updated){
    PARTS[idx] = updated;
    replaceCard(idx);
    toast('Updated ' + updated.sprucePN + ' — ' + fmt(updated.onHand) + ' on hand');
  }).catch(function(e){
    btn.disabled = false; btn.textContent = 'Save';
    toast('Could not save: ' + (e && e.message || e), true);
  });
}

// Delete lives on each part card, as a small quiet link with a confirm step —
// this tab is used all day for logging and deleting a bin should never be a
// one-tap accident.
function askDeleteCard(idx){
  var p = PARTS[idx];
  if (!p) return;
  var card = document.getElementById('card-' + idx);
  if (!card) return;
  card.querySelector('.cardfoot').innerHTML = '<div class="confirm">'
    + '<p>Remove <b>' + esc(p.sprucePN) + '</b> from inventory?'
    + (p.onHand > 0 ? ' It still shows <b>' + fmt(p.onHand) + ' on hand</b>.' : '')
    + '</p><div class="btns">'
    + '<button class="no" onclick="BS.cancelDelete(' + idx + ')">Cancel</button>'
    + '<button class="yes" onclick="BS.doDeleteCard(' + idx + ')">Yes, delete</button>'
    + '</div></div>';
}

function cancelDelete(idx){
  var card = document.getElementById('card-' + idx);
  if (!card) return;
  card.querySelector('.cardfoot').innerHTML = footHtml(idx);
}

function doDeleteCard(idx){
  var p = PARTS[idx];
  if (!p) return;
  var card = document.getElementById('card-' + idx);
  if (card) card.querySelector('.cardfoot').innerHTML = '<div class="confirm"><p>Deleting…</p></div>';
  var pn = p.sprucePN;
  API.deletePart(pn).then(function(){
    var i = findIdx(pn);
    if (i > -1) PARTS.splice(i, 1);
    modeByIdx = {};                 // indexes shift after a splice
    delete IMG[pn]; delete FULL[pn];
    toast('Deleted ' + pn);
    runSearch(document.getElementById('q').value);
  }).catch(function(e){
    toast('Could not delete: ' + (e && e.message || e), true);
    cancelDelete(idx);
  });
}

function doAddPart(){
  var pn = (document.getElementById('np').value||'').trim();
  if (!pn){ toast('Enter a part number', true); document.getElementById('np').focus(); return; }
  if (findIdx(pn) > -1){ toast('That part is already in inventory', true); return; }
  var data = {
    sprucePN:  pn,
    desc:      (document.getElementById('nd').value||'').trim(),
    commonPN:  (document.getElementById('nc').value||'').trim(),
    opening:   parseFloat(document.getElementById('no').value) || 0,
    reorderPt: document.getElementById('nr').value === '' ? '' : (parseFloat(document.getElementById('nr').value)||0),
    unitCost:  document.getElementById('nu').value === '' ? '' : (parseFloat(document.getElementById('nu').value)||0)
  };
  var btn = document.getElementById('addBtn');
  btn.disabled = true; btn.textContent = 'Adding…';
  API.addPart(data).then(function(p){
    PARTS.push(p);
    PARTS.sort(function(a,b){ return a.sprucePN.localeCompare(b.sprucePN); });
    toast('Added ' + p.sprucePN);
    renderManage();
  }).catch(function(e){
    btn.disabled = false; btn.textContent = 'Add to inventory';
    toast('Could not add: ' + (e && e.message || e), true);
  });
}

/* ---- Part photos ------------------------------------------------------
   The thumbnail square does double duty. No photo yet -> tapping it opens
   the camera. Photo already there -> tapping it opens the full-size viewer,
   which is where Replace and Delete live. */
function thumbHtml(p, idx){
  var u = IMG[p.sprucePN];
  if (u){
    return '<div class="thumb has" id="thumb-' + idx + '" onclick="BS.openPhoto(' + idx + ')"'
         + ' title="Tap to view full size">'
         + '<img src="' + esc(u) + '" alt="">'
         + '<span class="cam">🔍</span></div>';
  }
  return '<div class="thumb" id="thumb-' + idx + '" onclick="BS.pickPhoto(' + idx + ', true)"'
       + ' title="Tap to take a photo">'
       + '<span class="ico">📷</span><span class="cam">+</span></div>';
}

function paintThumbs(){
  curMatches.slice(0, shownLimit).forEach(function(m){
    var el = document.getElementById('thumb-' + m.idx);
    if (!el) return;
    var u = IMG[m.p.sprucePN];
    if (u && !el.querySelector('img')){
      var tmp = document.createElement('div');
      tmp.innerHTML = thumbHtml(m.p, m.idx);
      el.parentNode.replaceChild(tmp.firstChild, el);
    }
  });
}

function loadImagesFor(list){
  if (imgBusy) return;
  var need = [];
  list.forEach(function(m){
    var pn = m.p.sprucePN;
    if (IMG[pn] === undefined && need.indexOf(pn) === -1) need.push(pn);
  });
  if (!need.length) return;
  imgBusy = true;
  API.getImages(need).then(function(map){
    var got = 0;
    for (var pn in map){ if (map.hasOwnProperty(pn)){ IMG[pn] = map[pn] || ''; got++; } }
    imgBusy = false;
    paintThumbs();
    if (got > 0 && got < need.length) setTimeout(function(){ loadImagesFor(list); }, 300);
  }).catch(function(e){
    imgBusy = false;
    need.forEach(function(pn){ IMG[pn] = ''; });
    if (!window.__imgErrShown){
      window.__imgErrShown = true;
      toast('Photos unavailable: ' + (e && (e.message || e)), true);
    }
  });
}

// useCamera=true jumps straight to the camera (what you want at the bin).
function pickPhoto(idx, useCamera){
  var inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  if (useCamera) inp.setAttribute('capture', 'environment');
  inp.onchange = function(){ if (inp.files && inp.files[0]) uploadPhoto(idx, inp.files[0]); };
  inp.click();
}

function resizeToDataUrl(im, max, quality){
  var w = im.width, h = im.height;
  if (w > h && w > max){ h = Math.round(h * max / w); w = max; }
  else if (h >= w && h > max){ w = Math.round(w * max / h); h = max; }
  var cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(im, 0, 0, w, h);
  return cv.toDataURL('image/jpeg', quality);
}

// Photos are stored as text in a spreadsheet cell, which holds 50,000
// characters. Shrink step by step and take the first version that fits.
var MAX_UPLOAD_CHARS = 46000;

function encodeWithinLimit(im, limit){
  var steps = [[900,0.72],[800,0.68],[700,0.64],[600,0.60],
               [520,0.55],[440,0.48],[360,0.42],[280,0.38]];
  var out = '';
  for (var i = 0; i < steps.length; i++){
    out = resizeToDataUrl(im, steps[i][0], steps[i][1]);
    if (out.length <= limit) return out;
  }
  return '';
}

function uploadPhoto(idx, file){
  var pn = PARTS[idx].sprucePN;
  toast('Uploading photo…');
  var reader = new FileReader();
  reader.onload = function(){
    var im = new Image();
    im.onload = function(){
      var full = encodeWithinLimit(im, MAX_UPLOAD_CHARS);
      if (!full){ toast('Could not shrink that photo enough — try again', true); return; }
      var thumb = resizeToDataUrl(im, 160, 0.72);
      API.saveImage(pn, full, thumb).then(function(stored){
        IMG[pn]  = stored || thumb;
        FULL[pn] = full;
        replaceCard(idx);
        if (document.getElementById('photoModal').style.display === 'flex' && photoIdx === idx){
          openPhoto(idx);
        }
        toast('Photo saved');
      }).catch(function(e){
        toast('Upload failed: ' + (e && e.message || e), true);
      });
    };
    im.onerror = function(){ toast('Could not read that image', true); };
    im.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* ---- Full-size photo viewer ------------------------------------------ */
function openPhoto(idx){
  var p = PARTS[idx];
  if (!p) return;
  photoIdx = idx;
  document.getElementById('pmTitle').textContent = p.sprucePN;
  document.getElementById('pmSub').textContent = p.desc || '';
  document.getElementById('pmConfirmSlot').innerHTML = '';
  document.getElementById('pmBtns').style.display = 'flex';
  document.getElementById('photoModal').style.display = 'flex';

  var box = document.getElementById('pmImg');
  var cached = FULL[p.sprucePN];
  if (cached){ box.innerHTML = '<img src="' + cached + '" alt="">'; return; }

  var thumb = IMG[p.sprucePN] || '';
  box.innerHTML = (thumb ? '<img class="pending" src="' + esc(thumb) + '" alt="">' : '')
                + '<div class="pmnote">Loading full size…</div>';

  API.getFullImage(p.sprucePN).then(function(d){
    if (photoIdx !== idx) return;
    if (d){
      FULL[p.sprucePN] = d;
      box.innerHTML = '<img src="' + d + '" alt="">';
    } else {
      box.innerHTML = (thumb ? '<img src="' + esc(thumb) + '" alt="">' : '')
                    + '<div class="pmnote">Full-size image unavailable.</div>';
    }
  }).catch(function(e){
    if (photoIdx !== idx) return;
    box.innerHTML = '<div class="pmnote">Could not load: ' + esc(e && e.message || e) + '</div>';
  });
}

function closePhoto(){
  document.getElementById('photoModal').style.display = 'none';
  document.getElementById('pmImg').innerHTML = '';
  document.getElementById('pmConfirmSlot').innerHTML = '';
  photoIdx = -1;
}

function replacePhoto(){
  if (photoIdx < 0) return;
  var idx = photoIdx;
  closePhoto();
  pickPhoto(idx, false);
}

function askDeletePhoto(){
  if (photoIdx < 0) return;
  var p = PARTS[photoIdx];
  document.getElementById('pmBtns').style.display = 'none';
  document.getElementById('pmConfirmSlot').innerHTML = ''
    + '<div class="pmconfirm">'
    + '  <p>Delete the photo for <b>' + esc(p.sprucePN) + '</b>?<br>'
    + '     The part itself stays in inventory.</p>'
    + '  <div class="btns">'
    + '    <button class="no" onclick="BS.cancelDeletePhoto()">Cancel</button>'
    + '    <button class="yes" onclick="BS.doDeletePhoto()">Yes, delete</button>'
    + '  </div>'
    + '</div>';
}

function cancelDeletePhoto(){
  document.getElementById('pmConfirmSlot').innerHTML = '';
  document.getElementById('pmBtns').style.display = 'flex';
}

function doDeletePhoto(){
  if (photoIdx < 0) return;
  var idx = photoIdx;
  var pn = PARTS[idx].sprucePN;
  document.getElementById('pmConfirmSlot').innerHTML = '<div class="pmconfirm"><p>Deleting…</p></div>';
  API.deleteImage(pn).then(function(){
    IMG[pn] = '';
    delete FULL[pn];
    closePhoto();
    replaceCard(idx);
    toast('Photo deleted');
  }).catch(function(e){
    toast('Could not delete photo: ' + (e && e.message || e), true);
    cancelDeletePhoto();
  });
}

/* ---- Tabs ------------------------------------------------------------- */
function switchTab(t){
  curTab = t;
  ['parts','reorder','labels','year','manage'].forEach(function(k){
    document.getElementById('tab-' + k).className = (k===t ? 'on' : '');
  });
  document.getElementById('searchwrap').style.display = (t==='parts' ? 'block' : 'none');
  if (t==='parts'){
    // Each tab writes its own subtitle, so Parts restores its own on the way
    // back - otherwise it keeps whatever Manage or Reorder left there.
    sub.textContent = PARTS.length + ' parts · record take / add below';
    shownLimit = 25; runSearch(document.getElementById('q').value);
  }
  else if (t==='reorder') renderReorder();
  else if (t==='labels')  renderLabels();
  else if (t==='manage')  renderManage();
  else renderYear();
}

/* ---- Reorder list ----------------------------------------------------- */
function lowStockParts(){ return PARTS.filter(isLow); }

function renderReorder(){
  var low = lowStockParts();
  var withPt = PARTS.filter(function(p){ return p.reorderPt != null; }).length;
  sub.textContent = low.length + ' part' + (low.length===1?'':'s') + ' at or below reorder point';
  if (!low.length){
    view.innerHTML = '<div class="empty">Nothing needs reordering right now.<br><br>'
      + withPt + ' of ' + PARTS.length + ' parts have a reorder point set. '
      + 'Parts appear here automatically once on-hand drops to or below that number - '
      + 'set more reorder points in the Inventory tab to get more out of this list.</div>';
    return;
  }
  var html = '<button class="copybtn" onclick="BS.copyOrderList()">Copy order list</button>';
  html += low.map(function(p){
    return '<div class="card low">'
      + '<div class="chead"><div><div class="pn">' + esc(p.sprucePN) + '<span class="badge low">LOW</span></div>'
      + '<div class="common">' + esc(p.desc||'') + '</div></div>'
      + '<div class="oh low"><span class="n">' + fmt(p.onHand) + '</span><small>ON HAND · RO ' + fmt(p.reorderPt) + '</small></div></div>'
      + '<a class="reorder" href="' + esc(p.reorderUrl) + '" target="_blank" rel="noopener">Reorder on Aircraft Spruce ↗</a>'
      + '</div>';
  }).join('');
  view.innerHTML = html;
}

function copyOrderList(){
  var txt = lowStockParts().map(function(p){
    return p.sprucePN + '  (on hand ' + fmt(p.onHand) + ', reorder at ' + fmt(p.reorderPt) + ')  ' + (p.desc||'');
  }).join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(function(){ toast('Order list copied'); })
      .catch(function(){ fallbackCopy(txt); });
  } else fallbackCopy(txt);
}
function fallbackCopy(txt){
  var ta = document.createElement('textarea');
  ta.value = txt; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Order list copied'); }
  catch(e){ toast('Could not copy automatically', true); }
  document.body.removeChild(ta);
}

/* ---- QR labels --------------------------------------------------------
   Was a separate Labels.html that pointed its QR codes at a Google Form.
   Now the codes point at this site: scanning one opens the part's own card
   with the search already filled in, so a mechanic scans, taps Take out,
   and is done - no form, no second app. */
var labelSel = [];
var BLANK = ' BLANK';

function labelUrl(pn){
  var base = location.origin + '/#bench';
  return (pn === BLANK) ? base : base + '?p=' + encodeURIComponent(pn);
}

function renderLabels(){
  renderLabelsCount();
  view.innerHTML = ''
    + '<div class="lblbar noprint">'
    + '  <input id="lpn" type="text" list="lpnlist" placeholder="Type a part number or bin...">'
    + '  <datalist id="lpnlist"></datalist>'
    + '  <button onclick="BS.addLabelFromInput()">Add</button>'
    + '</div>'
    + '<div class="lblbar noprint">'
    + '  <button onclick="BS.addAllLabels()">Add ALL parts</button>'
    + '  <button class="ghost" onclick="BS.addLowLabels()">Add low-stock only</button>'
    + '  <button class="ghost" onclick="BS.addBlankLabel()">Blank label</button>'
    + '  <button class="danger" onclick="BS.clearLabels()">Clear</button>'
    + '  <button class="gold" onclick="window.print()">Print</button>'
    + '</div>'
    + '<div class="count noprint" style="margin-bottom:10px">Scanning a label opens that part'
    + ' straight to its take/add card. Print, cut, and stick one on each bin.</div>'
    + '<div id="grid"></div>';
  document.getElementById('lpnlist').innerHTML = PARTS.map(function(p){
    return '<option value="' + esc(p.sprucePN) + '">'
      + esc((p.binName ? p.binName + ' - ' : '') + (p.desc||'').slice(0,44)) + '</option>';
  }).join('');
  var inp = document.getElementById('lpn');
  inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') addLabelFromInput(); });
  paintLabels();
}

function paintLabels(){
  var g = document.getElementById('grid');
  if (!g) return;
  if (!labelSel.length){
    g.innerHTML = '<div class="empty">No labels yet - add parts above.</div>';
    return;
  }
  g.innerHTML = '';
  labelSel.forEach(function(pn, i){
    var p = PARTS[findIdx(pn)] || null;
    var card = document.createElement('div'); card.className = 'label';

    var x = document.createElement('button'); x.className = 'x noprint'; x.textContent = '×';
    x.onclick = function(){ labelSel.splice(i,1); paintLabels(); renderLabelsCount(); };
    card.appendChild(x);

    var t = document.createElement('div'); t.className = 'pn';
    t.textContent = (pn === BLANK) ? 'Bench Stock' : pn;
    card.appendChild(t);

    var q = document.createElement('div'); q.className = 'qr';
    card.appendChild(q);

    if (p && p.binName){
      var b = document.createElement('div'); b.className = 'bin';
      b.textContent = 'BIN ' + p.binName;
      card.appendChild(b);
    }
    var cap = document.createElement('div'); cap.className = 'cap';
    cap.textContent = (pn === BLANK) ? 'Scan to open bench stock'
                                     : ((p && p.desc) ? p.desc.slice(0,40) : 'Scan to take / restock');
    card.appendChild(cap);

    g.appendChild(card);
    try {
      new QRCode(q, { text: labelUrl(pn), width: 130, height: 130, correctLevel: QRCode.CorrectLevel.M });
    } catch(e){ q.textContent = 'QR error'; }
  });
}

function renderLabelsCount(){
  sub.textContent = labelSel.length
    ? (labelSel.length + ' label' + (labelSel.length===1?'':'s') + ' ready to print')
    : 'Print QR labels for your bins';
}
function pushLabel(pn){ if (labelSel.indexOf(pn) === -1) labelSel.push(pn); }

function addLabelFromInput(){
  var el = document.getElementById('lpn');
  var v = (el.value || '').trim();
  if (!v) return;
  var i = findIdx(v);
  if (i > -1) v = PARTS[i].sprucePN;   // normalise a common P/N to the Spruce P/N
  pushLabel(v);
  el.value = '';
  paintLabels(); renderLabelsCount();
}
function addAllLabels(){ PARTS.forEach(function(p){ pushLabel(p.sprucePN); }); paintLabels(); renderLabelsCount(); }
function addLowLabels(){ lowStockParts().forEach(function(p){ pushLabel(p.sprucePN); }); paintLabels(); renderLabelsCount(); }
function addBlankLabel(){ pushLabel(BLANK); paintLabels(); renderLabelsCount(); }
function clearLabels(){ labelSel = []; paintLabels(); renderLabelsCount(); }

/* ---- Year-end summary ------------------------------------------------- */
function yearData(){
  var t = { opening:0, withdrawn:0, ending:0, beginValue:0, value:0, valueUsed:0 };
  var rows = PARTS.map(function(p){
    var op = Number(p.opening)||0, oh = Number(p.onHand)||0, uc = Number(p.unitCost)||0;
    var w = op - oh, bv = op * uc, v = oh * uc;
    t.opening+=op; t.withdrawn+=w; t.ending+=oh; t.beginValue+=bv; t.value+=v;
    return { pn:p.sprucePN, desc:p.desc, opening:op, withdrawn:w, ending:oh,
             unitCost:uc, beginValue:bv, value:v };
  });
  t.valueUsed = t.beginValue - t.value;
  return { rows:rows, totals:t };
}

function renderYear(){
  var d = yearData();
  sub.textContent = 'Opening vs. ending counts and value';
  var html = '<button class="copybtn" onclick="BS.exportYearPdf()">Export as PDF</button>';
  html += '<div class="totals">'
    + '<div class="tbox"><div class="lbl">OPENING COUNT</div><div class="val">' + fmt(d.totals.opening) + '</div></div>'
    + '<div class="tbox"><div class="lbl">ENDING COUNT</div><div class="val">' + fmt(d.totals.ending) + '</div></div>'
    + '<div class="tbox"><div class="lbl">BEGINNING VALUE</div><div class="val">' + money(d.totals.beginValue) + '</div></div>'
    + '<div class="tbox"><div class="lbl">ENDING VALUE</div><div class="val">' + money(d.totals.value) + '</div></div>'
    + '<div class="tbox"><div class="lbl">TOTAL WITHDRAWN</div><div class="val">' + fmt(d.totals.withdrawn) + '</div></div>'
    + '<div class="tbox"><div class="lbl">VALUE USED</div><div class="val">' + money(d.totals.valueUsed) + '</div></div>'
    + '</div>';
  var slice = d.rows.slice(0, yearLimit);
  html += slice.map(function(r){
    return '<div class="yrow"><div class="ypn">' + esc(r.pn) + '</div>'
      + '<div class="ydesc">' + esc(r.desc||'') + '</div>'
      + '<div class="ynums">'
      + '<div><span class="n">' + fmt(r.opening) + '</span><span class="k">OPENING</span></div>'
      + '<div><span class="n">' + fmt(r.withdrawn) + '</span><span class="k">WITHDRAWN</span></div>'
      + '<div><span class="n">' + fmt(r.ending) + '</span><span class="k">ENDING</span></div>'
      + '</div>'
      + '<div class="ynums">'
      + '<div><span class="n">' + money(r.beginValue) + '</span><span class="k">BEGIN VALUE</span></div>'
      + '<div><span class="n">' + money(r.value) + '</span><span class="k">END VALUE</span></div>'
      + '</div></div>';
  }).join('');
  if (d.rows.length > yearLimit){
    html += '<button class="more" onclick="BS.yearMore()">Show more (' + (d.rows.length - yearLimit) + ' more)</button>';
  }
  view.innerHTML = html;
}
function yearMore(){ yearLimit += 25; renderYear(); }

/* ---- Year-end PDF export ---------------------------------------------
   The logo is a file now rather than inline data, so paint it through a
   canvas to get the data URL jsPDF wants. Same-origin, so this is allowed. */
function logoDataUrl(){
  var img = document.querySelector('.bs-logo');
  if (!img || !img.complete || !img.naturalWidth) return '';
  try {
    var cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cv.getContext('2d').drawImage(img, 0, 0);
    return cv.toDataURL('image/png');
  } catch(e){ return ''; }
}

function exportYearPdf(){
  if (!window.jspdf || !window.jspdf.jsPDF){ toast('PDF library still loading - try again', true); return; }
  var d = yearData();
  var doc = new window.jspdf.jsPDF({ orientation:'portrait', unit:'pt', format:'letter' });
  var W = doc.internal.pageSize.getWidth();
  var today = new Date();
  var stamp = today.toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});

  var logo = logoDataUrl();
  if (logo){ try { doc.addImage(logo, 'PNG', 40, 32, 54, 54); } catch(e){} }
  doc.setFont('helvetica','bold'); doc.setFontSize(15);
  doc.text('C&J Aviation LLC', 106, 52);
  doc.setFont('helvetica','normal'); doc.setFontSize(11.5);
  doc.text('Year-End Bench Stock Inventory Summary', 106, 69);
  doc.setFontSize(9); doc.setTextColor(110);
  doc.text('Generated ' + stamp + '  ·  ' + d.rows.length + ' parts', 106, 83);
  doc.setTextColor(0);
  doc.setDrawColor(200); doc.line(40, 98, W-40, 98);

  var ty = 118;
  var boxes = [
    ['Opening count',   fmt(d.totals.opening)],
    ['Ending count',    fmt(d.totals.ending)],
    ['Total withdrawn', fmt(d.totals.withdrawn)],
    ['Beginning value', money(d.totals.beginValue)],
    ['Ending value',    money(d.totals.value)],
    ['Value used',      money(d.totals.valueUsed)]
  ];
  var bw = (W - 80) / 3;
  boxes.forEach(function(b,i){
    var x = 40 + (i % 3) * bw;
    var y = ty + Math.floor(i / 3) * 48;
    doc.setFillColor(244,246,249); doc.rect(x, y, bw-6, 42, 'F');
    doc.setFontSize(7.5); doc.setTextColor(110);
    doc.text(b[0].toUpperCase(), x+8, y+15);
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(0);
    doc.text(String(b[1]), x+8, y+33);
    doc.setFont('helvetica','normal');
  });

  var body = d.rows.map(function(r){
    return [r.pn, (r.desc||'').slice(0,38), fmt(r.opening), fmt(r.withdrawn),
            fmt(r.ending), money(r.unitCost), money(r.beginValue), money(r.value)];
  });
  doc.autoTable({
    startY: ty + 106,
    head: [['Part number','Description','Opening','Withdrawn','Ending','Unit cost','Begin value','End value']],
    body: body,
    styles: { fontSize: 7, cellPadding: 2.6, overflow: 'linebreak' },
    headStyles: { fillColor: [11,37,69], textColor: 255, fontSize: 7.6 },
    alternateRowStyles: { fillColor: [247,249,252] },
    columnStyles: {
      0:{cellWidth:76}, 1:{cellWidth:'auto'},
      2:{cellWidth:40,halign:'right'}, 3:{cellWidth:46,halign:'right'},
      4:{cellWidth:36,halign:'right'}, 5:{cellWidth:44,halign:'right'},
      6:{cellWidth:50,halign:'right'}, 7:{cellWidth:48,halign:'right'}
    },
    margin: { left:40, right:40, bottom:42 },
    didDrawPage: function(data){
      var page = doc.internal.getNumberOfPages();
      var H = doc.internal.pageSize.getHeight();
      doc.setFontSize(8); doc.setTextColor(130);
      doc.text('C&J Aviation LLC - Year-End Bench Stock Summary', 40, H-24);
      doc.text('Page ' + data.pageNumber + ' of ' + page, W-40, H-24, {align:'right'});
      doc.setTextColor(0);
    }
  });

  var fy = doc.lastAutoTable.finalY + 16;
  if (fy > doc.internal.pageSize.getHeight() - 60){ doc.addPage(); fy = 60; }
  doc.setFont('helvetica','bold'); doc.setFontSize(9.5);
  doc.text('TOTALS - ' + d.rows.length + ' parts · beginning value ' + money(d.totals.beginValue)
           + ' · ending value ' + money(d.totals.value)
           + ' · value used ' + money(d.totals.valueUsed), 40, fy);

  var name = 'CJ-Aviation-Year-End-' + today.toISOString().slice(0,10) + '.pdf';
  try { doc.save(name); toast('PDF exported'); }
  catch(e){
    try { window.open(doc.output('bloburl'), '_blank'); toast('PDF opened in new tab'); }
    catch(e2){ toast('Could not create PDF', true); }
  }
}

/* ---- Start ------------------------------------------------------------ */
/* ---- Admin-site glue ----------------------------------------------------
   The admin site's vBench() renders the DOM skeleton (tabs, search, #view, photo modal,
   toast) inside <div class="bs">; render() then calls BS.mount(deeplink). Everything above is
   the Benchstock app as it was, private to this closure; the inline handlers in its markup
   reach it through window.BS. */
var BS_DEEPLINK = '';
function bindDom_(){
  view    = document.getElementById('view');
  sub     = document.getElementById('sub');
  countEl = document.getElementById('count');
  toastEl = document.getElementById('toast');
}
function mount(deeplink){
  BS_DEEPLINK = deeplink || '';
  bindDom_();
  if (!view || !toastEl){ console.error('Bench Stock: skeleton missing'); return; }
  if (PARTS.length){
    // Already loaded once this visit: paint instantly, refresh the numbers in the background.
    var input = document.getElementById('q');
    input.addEventListener('input', function(){ shownLimit = 25; runSearch(input.value); });
    INITIAL_PN = String(BS_DEEPLINK || '').trim(); BS_DEEPLINK = '';
    if (INITIAL_PN){ input.value = INITIAL_PN; curTab = 'parts'; }
    shownLimit = 25;
    switchTab(curTab || 'parts');
    API.getParts().then(function(parts){
      PARTS = parts || [];
      if (curTab === 'parts') runSearch(document.getElementById('q').value);
    }).catch(function(e){ console.error('Bench Stock refresh', e); });
  } else {
    booted = false;
    boot();
  }
}
/* Printing labels: the admin site's own print rules would hide the label grid, so mark the
   body while this view prints (mr-only does the same job for the Missing Receipt form). */
window.addEventListener('beforeprint', function(){ if (document.getElementById('bs-root')) document.body.classList.add('bench-print'); });
window.addEventListener('afterprint',  function(){ document.body.classList.remove('bench-print'); });

window.BS = { mount: mount, switchTab: switchTab, closePhoto: closePhoto, replacePhoto: replacePhoto, askDeletePhoto: askDeletePhoto, addAllLabels: addAllLabels, addBlankLabel: addBlankLabel, addLabelFromInput: addLabelFromInput, addLowLabels: addLowLabels, askDeleteCard: askDeleteCard, bumpCard: bumpCard, cancelDelete: cancelDelete, cancelDeletePhoto: cancelDeletePhoto, clearLabels: clearLabels, closeEdit: closeEdit, copyOrderList: copyOrderList, doAddPart: doAddPart, doDeleteCard: doDeleteCard, doDeletePhoto: doDeletePhoto, exportYearPdf: exportYearPdf, openEdit: openEdit, openPhoto: openPhoto, pickPhoto: pickPhoto, saveEdit: saveEdit, setModeCard: setModeCard, showMore: showMore, signOutDevice: signOutDevice, submitCard: submitCard, updLabel: updLabel, yearMore: yearMore };
})();
