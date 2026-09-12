---
name: klavye-form
description: >-
  Form + klavye + öneri listesi davranışı. TextInput, Modal form, autocomplete,
  mention, şehir/kişi önerisi veya "klavye formu kapatıyor" / "öneriye iki kez
  tıklıyorum" şikayetinde kullan. AcTiViTy mobil formlarında zorunlu.
---

# Klavye formu kapatmasın / öneri ilk dokunuşta seçilsin

Kullanıcı kazıdı (özet, birebir niyet):

1. Forma yazmak için tıklanınca **aşağıdan açılan klavye formu kapatmasın**.
2. Yazarken **form görünür kalsın** — ne yazıldığını formda görebilsin.
3. Öneri/autocomplete varsa liste **yukarı** açılsın (klavye ile çakışıp kapanmasın / örtülmesin).
4. Öneriye dokununca **klavye kapanmasın**; **ilk tıklamada** öneri seçilsin.

Detaylı kalıp + güvenli alan:  
[ekran-guvenli-alan.md](../activity-app/references/ekran-guvenli-alan.md)  
Otomatik tamamlama bileşenleri:  
[otomatik-tamamlama.md](../activity-app/references/otomatik-tamamlama.md)

## Yasak / zorunlu

| | |
|---|---|
| YASAK | `KeyboardAvoidingView behavior="height"` |
| Modal | `android_keyboardInputMode="adjustNothing"` + `behavior="padding"` (iOS+Android) |
| Tam ekran | iOS `padding`, Android `undefined` (`app.json` pan) |
| Her ScrollView/FlatList | `keyboardShouldPersistTaps` — form `"handled"`, **öneri listesi `"always"`** |
| Sabit alt buton + klavye | YASAK — butonu ScrollView içine al |
| Hazır sarmalayıcı | `mobile/src/components/KeyboardSafeModal.js` |

## Öneri listesi (autocomplete / @mention / şehir / kişi)

1. Liste varsayılan: **input’un üstüne** (`position:'absolute'`, `bottom: '100%'` veya eşdeğeri). Klavye altta; alta açılan dropdown klavyenin arkasında kalır / ilk dokunuş boşa gider.
2. Parent’ta `zIndex` / `elevation` yeterli olsun; altındaki kardeş satırlar öneriyi yutmasın (TeamSlotInviteField yorumları).
3. Öneri `ScrollView`/`FlatList`: **`keyboardShouldPersistTaps="always"`** — ilk dokunuş seçer, klavyeyi indirmez.
4. Seçim sonrası odak politikası: başka alana geçilmiyorsa `blurOnSubmit={false}`; seçince klavyeyi bilinçli kapatma (`Keyboard.dismiss`) **yapma** (kullanıcı istemedi).
5. İl/ilçe/kişi alanlarında mevcut bileşenleri kullan — düz `TextInput` + uydurma dropdown yok.

## Form görünür kalsın

- Yeterli `paddingBottom` + gerekirse `onFocus` ile `scrollTo` / `scrollToEnd` (klavye animasyonu ~300ms sonra).
- Modal’da `KeyboardSafeModal` veya aynı Modal kalıbı.

## Kontrol listesi (forma dokundun mu?)

- [ ] `behavior="height"` yok
- [ ] Modal ise `adjustNothing` + padding KAV
- [ ] Kayan kapsayıcıda `keyboardShouldPersistTaps`
- [ ] Öneri varsa yukarı açılıyor + listede `"always"`
- [ ] Alt input klavye açıkken görünüyor
- [ ] Öneriye tek dokunuşla seçiliyor, klavye inmiyor
