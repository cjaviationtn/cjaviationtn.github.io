# C&J Aviation — Accounting/Admin site

The internal admin site for C&J Aviation LLC, served from GitHub Pages at
**https://cjaviationtn.org**.

It is a static front end. All data lives in the existing Google Sheets and is
read and written through the **Admin Site** Apps Script project (owned by
`cjaviationtn@gmail.com`), which exposes a small JSON API (`Api.gs`).

```
browser  →  cjaviationtn.org (GitHub Pages, this repo)
             │  Google sign-in → session token
             ▼
         Apps Script web app  /exec   (Api.gs)
             ▼
         C&J Accounting 2026 · Pay Tracker 2026 · P.O. System 2026
```

## Files

| Path | What it is |
|---|---|
| `index.html` | Page shell. Loads config, the API transport, then the app. |
| `config.js` | The only file to edit per environment: API URL, OAuth client ID, version. |
| `js/api.js` | Sign-in + a `google.script.run` work-alike backed by `fetch()`. |
| `js/app.js` | The whole front end — views, rendering, wiring. Plain ES5. |
| `css/app.css` | All styling. |
| `CNAME` | Custom domain for GitHub Pages. Do not delete. |

## Access

Only the Google accounts listed in `API_ALLOWED_EMAILS` in `Api.gs` can sign in.
To add someone, add their address there and redeploy the Apps Script web app.
`apiRevokeAllSessions()` signs everyone out.

## Deploying a change

1. Edit, commit, push to `main` — GitHub Pages republishes in about a minute.
2. Bump `siteVersion` in `config.js` so the footer chip shows what is live.

Back-end changes are deployed from the Apps Script editor:
**Deploy → Manage deployments → pencil → New version** (this keeps the URL —
*New deployment* mints a new URL and breaks the site).
