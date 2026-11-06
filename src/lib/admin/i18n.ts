/** Admin felület fordítások (HU alap, EN váltó). Hiányzó kulcs → angol fallback, fejlesztői módban naplózva. */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const LANGS = ["hu", "en"] as const;
export type Lang = (typeof LANGS)[number];

const hu = {
  common: { save: "Mentés", cancel: "Mégse", retry: "Újra", loading: "Betöltés…", back: "Vissza", search: "Keresés", empty: "Nincs találat.", error: "Valami nem sikerült. Próbáld újra.", confirm: "Megerősítés", reason: "Indoklás", page: "Oldal", of: "/", total: "Összesen", logout: "Kijelentkezés", language: "Nyelv", copied: "Másolva", all: "Mind", none: "—" },
  nav: { dashboard: "Irányítópult", users: "Felhasználók", reports: "Jelentések", audit: "Audit napló", moderationLog: "Moderációs napló", media: "Média API" },
  login: { title: "Admin belépés", password: "Jelszó", totp: "Hitelesítő kód", submit: "Belépés", invalid: "Hibás adatok.", rateLimited: "Túl sok próbálkozás. Próbáld újra {{minutes}} perc múlva." },
  dashboard: { users: "Felhasználók", active: "Aktív (7 nap)", openReports: "Nyitott jelentés", pending: "Törlésre váró", messages: "Üzenet (24 óra)", media: "Médiafájl", signups: "Regisztrációk (7 nap)", countsOnly: "Csak darabszámok, tartalom nélkül." },
  users: { title: "Felhasználók", status: "Státusz", created: "Regisztráció", lastSeen: "Utolsó aktivitás", devices: "Eszközök", reports: "Jelentések", suspend: "Felfüggesztés", restore: "Visszaállítás", pending: "Törlésre váró fiókok", purgeAt: "Végleges törlés", daysLeft: "{{n}} nap", searchPh: "Felhasználónév…", noContent: "Üzenet- vagy ismerős-tartalom nem látható.", friends: "Ismerősök", blocks: "Letiltások", suspendTitle: "Fiók felfüggesztése", restoreTitle: "Fiók visszaállítása", suspendedReason: "Felfüggesztés oka", deviceRevoked: "visszavont", delete: "Törlés", deleteTitle: "Fiók végleges törlése", deleteWarn: "Visszavonhatatlan: a fiók, üzenetei és médiafájljai azonnal törlődnek. A törlés megerősítéséhez írd be a felhasználónevet:", deleteConfirmName: "Felhasználónév" },
  status: { active: "Aktív", suspended: "Felfüggesztett", deleted_pending: "Törlésre vár", purged: "Törölt", open: "Nyitott", reviewed: "Áttekintve", dismissed: "Elutasítva", actioned: "Intézkedve", valid: "Érvényes", expired: "Lejárt", none: "Nincs" },
  reports: { title: "Jelentések", reporter: "Jelentő", target: "Jelentett", reason: "Ok", grant: "Hozzáférés", note: "Megjegyzés", viewContent: "Tartalom megtekintése", noGrant: "A jelentő nem osztott meg tartalmat.", grantExpired: "A hozzáférés lejárt.", pasteKey: "Illeszd be a moderációs privát kulcsot. A kulcs nem hagyja el a böngészőt.", keyPh: "Privát kulcs (base64)", decrypt: "Visszafejtés", logged: "Ez a megtekintés naplózva lesz.", sigOk: "A feladótól származik.", sigBad: "Az aláírás érvénytelen.", decryptFailed: "Nem sikerült visszafejteni. Ellenőrizd a kulcsot.", decision: "Döntés", dismiss: "Elutasítás", review: "Áttekintve", action: "Intézkedés", suspendTarget: "A jelentett fiók felfüggesztése", message: "Üzenet", sentAt: "Küldve", createdAt: "Jelentve", clear: "Tartalom elrejtése", expiresAt: "Lejár" },
  audit: { title: "Audit napló", retention: "A napló 30 napig őrződik.", actor: "Szereplő", action: "Művelet", target: "Cél", ip: "IP", time: "Idő", filterAction: "Művelet előtag…" },
  mod: { title: "Moderációs napló", decision: "Döntés", reason: "Indoklás", admin: "Admin" },
  media: { title: "Média API", url: "API URL", folder: "Célmappa", phoneKey: "Telefonos kulcs", serverKey: "Szerveres kulcs", keyHint: "A kulcs mentés után nem jelenik meg újra. Üresen hagyva a meglévő marad.", test: "Kapcsolat tesztelése", testOk: "Kapcsolat rendben.", rotate: "Kulcs forgatása", rotateTitle: "Új telefonos kulcs", version: "Verzió", distributed: "{{n}} / {{total}} eszköz kapta meg", scopeWarning: "A kulcsoknak nincs műveletenkénti hatóköre: a telefonos kulcs listázhat és törölhet a mappában. Éles használat előtt szűkített hatókörű kulcs kell.", expires: "Telefonos kulcs lejárata", notConfigured: "A médiatár még nincs beállítva.", saved: "Mentve.", rotated: "A kulcs elforgatva.", testFailed: "A teszt sikertelen." },
  confirm: { title: "Biztos vagy benne?" },
};

const en: typeof hu = {
  common: { save: "Save", cancel: "Cancel", retry: "Retry", loading: "Loading…", back: "Back", search: "Search", empty: "No results.", error: "Something went wrong. Please try again.", confirm: "Confirm", reason: "Reason", page: "Page", of: "/", total: "Total", logout: "Log out", language: "Language", copied: "Copied", all: "All", none: "—" },
  nav: { dashboard: "Dashboard", users: "Users", reports: "Reports", audit: "Audit log", moderationLog: "Moderation log", media: "Media API" },
  login: { title: "Admin sign-in", password: "Password", totp: "Authenticator code", submit: "Sign in", invalid: "Incorrect details.", rateLimited: "Too many attempts. Try again in {{minutes}} minutes." },
  dashboard: { users: "Users", active: "Active (7 days)", openReports: "Open reports", pending: "Pending deletion", messages: "Messages (24 h)", media: "Media files", signups: "Sign-ups (7 days)", countsOnly: "Counts only, no content." },
  users: { title: "Users", status: "Status", created: "Registered", lastSeen: "Last seen", devices: "Devices", reports: "Reports", suspend: "Suspend", restore: "Restore", pending: "Accounts pending deletion", purgeAt: "Permanent deletion", daysLeft: "{{n}} days", searchPh: "Username…", noContent: "Message and friend content is never shown.", friends: "Friends", blocks: "Blocks", suspendTitle: "Suspend account", restoreTitle: "Restore account", suspendedReason: "Suspension reason", deviceRevoked: "revoked", delete: "Delete", deleteTitle: "Permanently delete account", deleteWarn: "Irreversible: the account, its messages and media files are deleted immediately. Type the username to confirm:", deleteConfirmName: "Username" },
  status: { active: "Active", suspended: "Suspended", deleted_pending: "Pending deletion", purged: "Deleted", open: "Open", reviewed: "Reviewed", dismissed: "Dismissed", actioned: "Actioned", valid: "Valid", expired: "Expired", none: "None" },
  reports: { title: "Reports", reporter: "Reporter", target: "Reported", reason: "Reason", grant: "Access", note: "Note", viewContent: "View content", noGrant: "The reporter didn't share any content.", grantExpired: "Access has expired.", pasteKey: "Paste the moderation private key. The key never leaves your browser.", keyPh: "Private key (base64)", decrypt: "Decrypt", logged: "This view will be logged.", sigOk: "Sent by the reported user.", sigBad: "Invalid signature.", decryptFailed: "Couldn't decrypt. Check the key.", decision: "Decision", dismiss: "Dismiss", review: "Reviewed", action: "Take action", suspendTarget: "Suspend the reported account", message: "Message", sentAt: "Sent", createdAt: "Reported", clear: "Hide content", expiresAt: "Expires" },
  audit: { title: "Audit log", retention: "The log is kept for 30 days.", actor: "Actor", action: "Action", target: "Target", ip: "IP", time: "Time", filterAction: "Action prefix…" },
  mod: { title: "Moderation log", decision: "Decision", reason: "Reason", admin: "Admin" },
  media: { title: "Media API", url: "API URL", folder: "Target folder", phoneKey: "Phone key", serverKey: "Server key", keyHint: "The key isn't shown again after saving. Leave empty to keep the current one.", test: "Test connection", testOk: "Connection OK.", rotate: "Rotate key", rotateTitle: "New phone key", version: "Version", distributed: "{{n}} / {{total}} devices received it", scopeWarning: "Keys have no per-operation scope: the phone key can list and delete in the folder. A scoped key is required before production.", expires: "Phone key expiry", notConfigured: "Media storage isn't configured yet.", saved: "Saved.", rotated: "Key rotated.", testFailed: "The test failed." },
  confirm: { title: "Are you sure?" },
};

let initialized = false;
export function initI18n(lng: Lang) {
  if (!initialized) {
    i18n.use(initReactI18next).init({
      resources: { hu: { translation: hu }, en: { translation: en } },
      lng,
      fallbackLng: "en",
      interpolation: { escapeValue: false },
      saveMissing: process.env.NODE_ENV === "development",
      missingKeyHandler: (_l, _ns, key) => {
        console.warn(`[i18n] hiányzó fordítás: ${key}`);
      },
    });
    initialized = true;
  } else if (i18n.language !== lng) {
    void i18n.changeLanguage(lng);
  }
  return i18n;
}
