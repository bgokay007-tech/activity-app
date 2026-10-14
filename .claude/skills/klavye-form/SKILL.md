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

## Kütüphane: react-native-keyboard-controller

Alan alan elle yama yapmak yerine `react-native-keyboard-controller` (+ `react-native-reanimated` 3.x —
4.x yeni mimari ister, uygulama `newArchEnabled: false`). `App.js`'te
`<KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>` var;
translucent/preserve kaldırılırsa status/nav bar boşluğu iki kez eklenir.

- **Form = `KeyboardAwareForm`** (`mobile/src/components/KeyboardAwareForm.js`): ScrollView'un
  birebir yerine geçer, odaklanan input'u klavyenin üstüne kendisi kaydırır, `ref.scrollToEnd`
  çalışır. Ekran odaktayken Android'i `adjustResize`'a alır, çıkınca varsayılan `pan`'e döner
  (pan + aware scroll = çift kaydırma). İçine KAV koyma.
- `KeyboardAvoidingView` **her zaman** `react-native-keyboard-controller`'dan import edilir (API aynı;
  Modal penceresindeki klavyeyi de izler).
- Sabit alt buton gerekiyorsa `KeyboardStickyView` (aynı paket) — klavyeyle birlikte kalkar.
- Geçirilen ekranlar: Login, Register, BusinessRegister, ForgotPassword. Diğerleri dokunuldukça.
- Native modül ekledin mi → `app.json` `version` artır + yeni APK (`eas build --profile preview`).
  `runtimeVersion: appVersion`; artırmazsan OTA eski APK'ya gider, modül yok diye çöker.

## Yasak / zorunlu

| | |
|---|---|
| YASAK | `KeyboardAvoidingView behavior="height"`, `react-native`'den KAV import'u |
| Yeni/dokunulan form | `KeyboardAwareForm` |
| Modal | `KeyboardSafeModal` veya `android_keyboardInputMode="adjustNothing"` + `behavior="padding"` |
| Eski tam ekran | iOS `padding`, Android `undefined` (`app.json` pan) — dokunursan `KeyboardAwareForm`'a geçir |
| Her ScrollView/FlatList | `keyboardShouldPersistTaps` — form `"handled"`, **öneri listesi `"always"`** |
| Sabit alt buton + klavye | Form içine al veya `KeyboardStickyView` |
| Hazır sarmalayıcılar | `KeyboardAwareForm.js` (form), `KeyboardSafeModal.js` (alttan sheet) |

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

- `KeyboardAwareForm` kullan; elle `onFocus` + `scrollTo` gerekmez.
- Modal’da `KeyboardSafeModal` veya aynı Modal kalıbı.

## Kontrol listesi (forma dokundun mu?)

- [ ] `behavior="height"` yok; KAV `react-native-keyboard-controller`'dan
- [ ] Form kapsayıcısı `KeyboardAwareForm`
- [ ] Modal ise `adjustNothing` + padding KAV
- [ ] Kayan kapsayıcıda `keyboardShouldPersistTaps`
- [ ] Üst alanda öneri aşağı, alt/klavye yanında yukarı
- [ ] Öneri listesinde `"always"`; seçimde `Keyboard.dismiss` yok
- [ ] İlk dokunuşta seçiliyor, klavye inmiyor
- [ ] Alt input klavye açıkken görünüyor
