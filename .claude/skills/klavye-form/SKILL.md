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
3. Öneri yönü:
   - **Üst alanlar** → liste **aşağı** açılsın.
   - **Alt alanlar / klavyeye yakın** → liste **yukarı** açılsın (klavye örtmesin).
4. Öneriye dokununca **klavye kapanmasın**; **ilk tıklamada** öneri seçilsin
   (yön ne olursa olsun aynı).

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

1. **Yön (akıllı):**
   - Formun / ekranın **üst** yarısındaki alan: `top: '100%'` (aşağı).
   - **Alt** yarı veya klavye açıkken alt input: `bottom: '100%'` (yukarı).
   - Ölçüm yoksa güvenli varsayılan: klavye görünürken yukarı, değilse aşağı.
2. Parent’ta `zIndex` / `elevation` yeterli olsun; altındaki kardeş satırlar öneriyi yutmasın.
3. Öneri `ScrollView`/`FlatList`: **`keyboardShouldPersistTaps="always"`** — ilk dokunuş seçer, klavyeyi indirmez (aşağı/yukarı fark etmez).
4. Seçimde `Keyboard.dismiss()` **yapma**. `blurOnSubmit={false}` uygunsa kullan.
5. İl/ilçe/kişi alanlarında mevcut bileşenleri kullan — düz `TextInput` + uydurma dropdown yok.

```js
// Üst alan — aşağı
{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, zIndex: 200, elevation: 10 }
// Alt / klavye yanı — yukarı
{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 2, zIndex: 200, elevation: 10 }
```

## Form görünür kalsın

- Yeterli `paddingBottom` + gerekirse `onFocus` ile `scrollTo` / `scrollToEnd` (klavye animasyonu ~300ms sonra).
- Modal’da `KeyboardSafeModal` veya aynı Modal kalıbı.

## Kontrol listesi (forma dokundun mu?)

- [ ] `behavior="height"` yok
- [ ] Modal ise `adjustNothing` + padding KAV
- [ ] Kayan kapsayıcıda `keyboardShouldPersistTaps`
- [ ] Üst alanda öneri aşağı, alt/klavye yanında yukarı
- [ ] Öneri listesinde `"always"`; seçimde `Keyboard.dismiss` yok
- [ ] İlk dokunuşta seçiliyor, klavye inmiyor
- [ ] Alt input klavye açıkken görünüyor
