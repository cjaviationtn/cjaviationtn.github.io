/* C&J Aviation Admin — site configuration
 * apiUrl         : the Admin Site Apps Script web-app /exec URL (deployed as Execute as me · Anyone)
 * googleClientId : OAuth 2.0 Web client ID that allows https://cjaviationtn.org
 * siteVersion    : bump on every push; the page refetches this file to spot a stale copy
 * apiVersion     : the Apps Script API_VERSION this site expects (bump when Api/backend changes) */
window.CJ_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbwow6TV_yoeVzWN7SbEu-DugfIUfBT1NeOQpdm5ilLrMwOSA42N9H8BiEqu4vC4k3a8/exec',
  googleClientId: '211334963834-rsgqo4k7h6fto992ei6qbbpjb4cjdjcb.apps.googleusercontent.com',
  siteVersion: 'site 1.1.15',
  apiVersion: 13
};
