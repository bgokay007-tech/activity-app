# AcTiViTy — Claude / agent girişi

Bu depoda çalışırken **önce** proje skill'ini oku ve uygula:

`.claude/skills/activity-app/SKILL.md`

İhtiyaç oldukça aynı klasördeki `references/*.md` dosyalarını aç (uydurma).

## Her zaman (kazındı)

- İş bitince sormadan: ilgili dosyaları commit + `git push -u origin HEAD` (`main`). Force-push yok.
- `mobile/` UI değiştiyse ayrıca EAS Update (`development` + `preview`), `EAS_SKIP_AUTO_FINGERPRINT=1`.
- Metro (CI yok): `cd mobile && npx expo start --dev-client --tunnel --port 8081`.
- Form/klavye: `.cursor/rules/klavye-form.mdc` + skill `references/ekran-guvenli-alan.md`.

Detaylı always-on kurallar: `.cursor/rules/*.mdc` (Cursor ile aynı kaynak).

## Yeni kural / skill

Kullanıcı sohbette “kazı”, “skill yap”, “kural ekle” veya komut listesi verirse:
yeni rule → `.cursor/rules/<ad>.mdc` (+ gerekirse buraya 1–2 satır özet);
yeni/uzun skill → `.claude/skills/...` ve Cursor kopyası `.cursor/skills/...`.
İkisini de güncelle; tek tarafta bırakma.
