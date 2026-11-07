<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Sotto projektinformációk
A projekt céljáról, felépítéséről, konfigurációjáról, korlátairól és szabályairól a gyökér `../AGENTS.md` és a `README.md` szól (külső, nem KEDD projekt). A fenti Next.js blokkot a `next dev` kezeli.


## Indítási napló
`src/instrumentation.ts` induláskor kiírja: `[sotto-api] v<verzió> | port <port> | <mód>` (a verzió a package.json-ból, a port a `PORT` környezeti változóból, amit a Next állít).

## Aktivitás (0.4.0)
`GET /api/presence`: elfogadott ismerősök `lastSeenAt` értéke; kölcsönös (`User.showActivity`, alapból true, `PUT /api/account/settings`). A `lastSeenAt`-ot a `/api/messages/sync` frissíti (20 mp).

## 0.5.0
`type: "audio"` (hangüzenet, médiával), `Device.notificationDetail` (`name`|`hidden`: a push címe „Sotto”, ha rejtett).

- 0.5.0: `PUT /api/devices/push` részleges: `pushToken` kihagyható (nem törli a tokent), `null` törli.
