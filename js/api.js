/* C&J Aviation Admin — API transport + sign-in
 * ---------------------------------------------------------------
 * Replaces Apps Script's google.script.run with a fetch() call to the
 * Admin Site JSON API (Api.gs). The chainable shape is kept exactly, so
 * every existing call site keeps working unchanged:
 *
 *   google.script.run.withSuccessHandler(ok).withFailureHandler(bad).getBootstrap();
 */
(function () {
  var CFG = window.CJ_CONFIG || {};
  var API_URL = CFG.apiUrl;
  var SESSION_KEY = 'cj_session';

  /* ---- session storage ------------------------------------------------ */
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function setSession(s) {
    try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  /* ---- raw call --------------------------------------------------------- */
  function call(fn, args, extra) {
    var body = { fn: fn, args: args || [] };
    var s = getSession();
    if (s && s.session) body.session = s.session;
    if (extra) for (var k in extra) body[k] = extra[k];
    return fetch(API_URL, {
      method: 'POST',
      // text/plain = no CORS preflight (Apps Script cannot answer OPTIONS)
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    }).then(function (r) {
      return r.text().then(function (t) {
        var j; try { j = JSON.parse(t); } catch (e) { throw new Error('The server sent something that was not JSON (' + r.status + ')'); }
        if (!j.ok) {
          var err = new Error(j.error || 'Request failed');
          err.code = j.code;
          if (j.code === 'AUTH') { setSession(null); window.dispatchEvent(new CustomEvent('cj:signedout')); }
          throw err;
        }
        return j.result;
      });
    });
  }

  /* ---- google.script.run look-alike ------------------------------------- */
  function Runner() { this._ok = null; this._bad = null; }
  Runner.prototype.withSuccessHandler = function (f) { this._ok = f; return this; };
  Runner.prototype.withFailureHandler = function (f) { this._bad = f; return this; };
  Runner.prototype.withUserObject = function () { return this; };
  Runner.prototype._go = function (fn, args) {
    var self = this;
    call(fn, args).then(function (res) { if (self._ok) self._ok(res); },
                        function (err) { if (self._bad) self._bad(err); else console.error(err); });
  };
  var runProxy = (typeof Proxy !== 'undefined') ? new Proxy({}, {
    get: function (_, name) {
      if (name === 'withSuccessHandler' || name === 'withFailureHandler' || name === 'withUserObject') {
        return function (f) { var r = new Runner(); return r[name](f); };
      }
      return function () { new Runner()._go(String(name), Array.prototype.slice.call(arguments)); };
    }
  }) : null;
  // Runner instances need the same dynamic method lookup
  Runner.prototype = new Proxy(Runner.prototype, {
    get: function (target, name, receiver) {
      if (name in target) return target[name];
      if (typeof name !== 'string' || name.charAt(0) === '_') return undefined;
      return function () { receiver._go(name, Array.prototype.slice.call(arguments)); };
    }
  });
  Runner.prototype.constructor = Runner;

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = runProxy;
  window.google.script.host = { close: function () {}, setHeight: function () {}, setWidth: function () {} };

  /* ---- public auth API -------------------------------------------------- */
  window.CJ = {
    call: call,
    session: getSession,
    /** Exchange a Google ID token for a session. */
    login: function (idToken) {
      return call('login', [], { idToken: idToken }).then(function (res) { setSession(res); return res; });
    },
    logout: function () {
      var s = getSession();
      setSession(null);
      if (s && s.session) call('logout', [], { session: s.session }).catch(function () {});
      try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) {}
    },
    /** Resolve true if the stored session is still good on the server. */
    check: function () {
      var s = getSession();
      if (!s || !s.session) return Promise.resolve(false);
      return call('whoami').then(function () { return true; }, function () { return false; });
    }
  };
})();
