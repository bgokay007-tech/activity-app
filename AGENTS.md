# AcTiViTy — agent girişi (Cursor / Claude / diğer)

1. Oku: `.claude/skills/activity-app/SKILL.md` (kanonik proje rehberi).
2. Always-on kurallar: `.cursor/rules/*.mdc` (push, OTA, klavye, **dört dil i18n**, **spor-özel etiket**).
3. Claude girişi: `CLAUDE.md`. Cursor skill pointer: `.cursor/skills/activity-app/SKILL.md`.
4. Kullanıcı metni: her zaman `en` + `tr` + `ru` + `de` → skill `i18n-dort-dil`.

Kullanıcı yeni komut/kural yazarsa skill veya rule olarak depoya kazı; sohbette unutulmasın.

## Cursor Cloud specific instructions

- Node 22 image üzerinde hazır. PostgreSQL 16 `install` ile gelir. `service postgresql start` policy-rc.d yüzünden açılmaz; `start` `pg_ctlcluster 16 main start` kullanır.
- Yerel veritabanı: `postgresql://activity:activity@127.0.0.1:5432/activity`. `backend/.env` yoksa boot sırasında yazılır (git’e girmez).
- API `http://127.0.0.1:5000`, web Vite `http://127.0.0.1:5173` (`frontend/vite.config.js`). Geliştirici girişi: `dev@activity.local` / `devpass123` (kullanıcı adı `devlocal`).
- `frontend` içinde `npm ci` main’deki kilit dosyasında emnapi sapması yüzünden düşer; kurulum `npm install` ile devam eder.
- Mobil `BASE_URL` canlı Railway adresidir. Yerel API’ye çevirmeyi commit etme.
