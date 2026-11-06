# sotto-api

Sotto backend + admin felület (Next.js 16, App Router, TypeScript strict, Mongoose, Tailwind 4, Framer Motion, lucide-react).
Projekt típusa: **külső (nem KEDD)**. Részletes terv: `../MASTER_PROMPT.md`, dizájn: `../docs/design/`, projektinfó: `../AGENTS.md`.

## Gyors indítás (Docker nélkül)

```bash
npm install
cp .env.example .env.local         # töltsd ki (lásd lent); a .env.local SOHA nem kerül gitbe
npm run db:dev                     # külön terminál: fejlesztői MongoDB, kiírja a DATABASE_URL-t (adat: .data/mongo)
npm run db:check                   # kapcsolat + indexek szinkronizálása
npm run db:seed                    # (opcionális) szintetikus adatok az admin kipróbálásához
npm run dev                        # http://localhost:3000 (foglalt port esetén a Next másikat választ)
```

Éles-közeli MongoDB: natív `mongod` vagy Atlas – elég a `DATABASE_URL`.
Telefonos teszt LAN-on: `npx next dev -H 0.0.0.0`, az app `EXPO_PUBLIC_API_URL`-je a gép LAN IP-je.

## Környezeti változók (Zod-validált, lásd `src/lib/env.ts`)

`DATABASE_URL`, `JWT_SECRET` (≥32), `ADMIN_SESSION_SECRET` (≥32, külön a JWT-től), `ADMIN_PASSWORD` (≥12), `ADMIN_ID`, `ADMIN_TOTP_SECRET` (opcionális),
`CONFIG_ENCRYPTION_KEY` (32 bájt base64; a média API kulcsok nyugalmi titkosítása), `MODERATION_PUBLIC_KEY` (X25519 publikus; a privát kulcs sosem a szerveren van),
`CRON_SECRET`, `LOCAL_MEDIA_DIR` (csak dev). Generálás: `openssl rand -hex 32` / `openssl rand -base64 32`.

## Parancsok

| Parancs | Mit csinál |
|---|---|
| `npm run dev` / `build` / `start` | Next fejlesztés / build / production |
| `npm test` | Vitest (mongodb-memory-server, Docker nélkül) |
| `npm run typecheck` / `lint` | TypeScript / ESLint |
| `npm run db:dev` / `db:check` / `db:seed` | Dev MongoDB / indexek / szintetikus adat |

## Szerkezet

- `src/protocol/` – kliens↔szerver protokoll (Zod sémák, állandók, kulcscsomagolás). **Forrás**; a `sotto-app` másolja.
- `src/models/` – Mongoose modellek (indexek, TTL: audit 30 nap, refresh token).
- `src/lib/` – env, db, http (boríték/hibák), auth (jelszó, JWT, munkamenetek, admin), crypto (szerveroldali), ratelimit, audit, media (adapterek + beállítások).
- `src/app/api/` – Route Handlerek: `auth/*`, `keys/backup`, `config/media`, `admin/*`.
- `src/app/admin/` – admin felület (login + védett keret: dashboard, users, reports, audit, moderation-log, settings/media).
- `src/proxy.ts` – az `/admin` oldalak védelme (Next 16 proxy).

## Biztonsági tudnivalók

- A szerver **nem lát** üzenettartalmat, privát kulcsot, recovery kódot. A Recovery Code a kliensen készül; a szerver csak a verifikátor hash-ét tárolja.
- Média API kulcsok: admin adja meg, AES-szerű nyugalmi titkosítással (XChaCha20-Poly1305) tárolva; a telefonos kulcsot az eszköz **publikus** kulcsára zárva küldjük (`GET /api/config/media`).
- **Ismert kockázat:** a NovaStore NAS szolgáltatás kulcsainak nincs műveletenkénti hatóköre (a telefonos kulcs listázhat/törölhet a mappában). Éles használat előtt szűkített kulcs vagy feltöltő proxy kell.
- Admin: közös jelszó (+ opcionális TOTP), HttpOnly/SameSite=Strict süti, 5 próbálkozás/15 perc/IP, minden kísérlet auditálva.
- Jelentett üzenet visszafejtése a böngészőben történik a moderációs privát kulccsal (nem megy a szerverre); minden megtekintés auditált.

## API végpontok (felhasználói; mind `{ ok, data | error }` borítékkal)

| Terület | Végpontok |
|---|---|
| Auth | `POST /api/auth/{register,login,refresh,logout,reset-password}` |
| Kulcsok | `GET/POST /api/keys/backup`, `GET /api/config/media` (eszköz-pubkeyre zárt telefonos kulcs), `GET /api/config/moderation` |
| Társas | `GET /api/users/search?q=`, `GET /api/friends`, `POST /api/friends/requests`, `POST /api/friends/requests/:id/{accept,decline,cancel}`, `DELETE /api/friends/:userId`, `GET/POST /api/blocks`, `DELETE /api/blocks/:userId` |
| Beszélgetés | `GET /api/conversations`, `GET /api/conversations/:id/devices`, `PUT /api/conversations/:id/prefs` (némítás), `GET/PUT /api/contacts/:userId/prefs` (titkosított becenév/szín) |
| Üzenetek | `POST /api/messages`, `GET /api/messages/sync?cursor=`, `POST /api/messages/:id/read`, `DELETE /api/messages/:id` (csak feladó) |
| Eszközök | `GET /api/devices`, `DELETE /api/devices/:deviceId`, `PUT /api/devices/push` |
| Jelentés | `POST /api/reports` |
| Fiók | `DELETE /api/account`, `POST /api/account/restore`, `GET/PUT /api/account/settings` (kereshetőség, ismerőskérelem-szabály), `POST /api/account/password` (jelszócsere; a többi eszköz kilép) |
| Admin (felhasználó) | `POST /api/admin/users/:id/{suspend,restore,delete}` (`{reason}`; a `delete` azonnali, végleges törlés) |
| Cron | `POST /api/cron/purge` (`x-cron-secret`; fiók-purge + hivatkozatlan média takarítás) |

Szabályok röviden: üzenet = ciphertext + borítékok (`identity:<userId>` + minden aktív eszköz) + Ed25519 aláírás (a szerver ellenőrzi); a lista eltérése `409 DEVICE_LIST_CHANGED`;
küldési korlát 10/perc + 5/5 mp; a szinkron-kurzor monoton sorszám (üzenet, törlés, olvasás közös folyam); a tiltás generikus `BLOCKED`/`CONVERSATION_ARCHIVED` hibát ad; a push csak „feladó neve + New message”.
Ütemezés (pl. naponta): `curl -X POST -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/purge`.

## Ismert korlátok (jelenlegi állapot)

Kész: teljes backend (auth, kulcsok, társas gráf, üzenetek, szinkron, push, jelentés, fiók-törlés + purge) és az admin felület. **Még nincs:** a mobilapp (`sotto-app`); a sebességkorlátozó memóriabeli (egy példányra; Redis adapter váz van); a Expo push küldés valós Expo-szerverrel nincs élesben tesztelve (csak mockolt fetch-csel).
