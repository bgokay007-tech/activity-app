---
name: activity-app
description: >-
  AcTiViTy monorepo rehberi. Bu depodaki HER işte kullan — endpoint, ekran, dal,
  Prisma, bildirim, i18n, rezervasyon/turnuva/ilan, deploy, commit/push, EAS.
  Kullanıcı "ekran", "endpoint", "rezervasyon", "turnuva", "ilan", "dal", "expo",
  "railway", "bildirim" dese bile projeyi adıyla anmasa skill'i uygula.
---

# AcTiViTy (Cursor)

Kanonik içerik Claude skill'inde. **Şimdi oku ve onu takip et:**

`.claude/skills/activity-app/SKILL.md`

Referanslar (aynı klasör):

- `references/backend.md`
- `references/mobile.md`
- `references/deploy.md`
- `references/yeni-dal.md`
- `references/ekran-guvenli-alan.md`
- `references/otomatik-tamamlama.md`

Always-on kısa kurallar: `.cursor/rules/` (`canli-push`, `canli-metro`, `klavye-form`, …).

## Yeni skill / rule

Kullanıcı sohbette komut veya “kazı / skill yap” derse oluştur:

- Kısa sert kural → `.cursor/rules/<ad>.mdc` (`alwaysApply: true` veya glob)
- Uzun iş akışı → `.claude/skills/<ad>/SKILL.md` + buraya ince pointer
- `CLAUDE.md` / `AGENTS.md` özetini güncelle
- Commit + push (canli-push)
