# Güvenli alan (alt gezinme çubuğu) ve klavye

Bu iki konu bu projede tekrar tekrar hata üretti ve düzeltmeleri git geçmişinde belgeli.
Ekranın altına bir şey sabitliyorsan veya ekranda `TextInput` varsa **bu dosyayı uygula** —
sonradan "buton telefonun alt çubuğunun altında kalıyor" veya "klavye formu kapatıyor,
kullanıcı yazdığını göremiyor" diye geri dönmek zorunda kalma.

## 1. Alt gezinme çubuğu / çentik — güvenli alan

`SafeAreaProvider` zaten `mobile/App.js`'te kurulu. Ekranlarda `SafeAreaView` **kullanılmıyor**;
her yerde `useSafeAreaInsets()` hook'u kullanılıyor, çünkü boşluğu tam olarak nereye
ekleyeceğine karar edebiliyorsun (kart ise içine, sabit bar ise altına).

```js
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const insets = useSafeAreaInsets();
```

### Kural

Ekranın **en altına yaslanan her şey** `insets.bottom` hesaba katmalı: kaydet/gönder buton
satırı, sekme çubuğu, mini oynatıcı, bottom sheet, modal footer, kayan liste içeriğinin sonu.
Android'de jest/dokunmatik gezinme çubuğu bunların üstüne biner; kullanıcı butona basamaz.

### Kullanılan kalıplar

Yeni kodda bunlardan birini seç, yenisini uydurma:

```js
// Ekranın altına sabit buton/aksiyon satırı
<View style={{ paddingHorizontal: 16, paddingTop: 8,
               paddingBottom: insets.bottom + (Platform.OS === 'ios' ? 8 : 10),
               borderTopWidth: 1, borderTopColor: colors.border }}>

// Kaydırılan içeriğin sonu (ScrollView / FlatList)
contentContainerStyle={{ padding: 13, paddingBottom: Math.max(20, insets.bottom + 16) }}

// Absolute konumlu çubuk (mini player gibi) — sekme çubuğunun üstüne oturur
style={[s.bar, { bottom: 56 + insets.bottom }]}

// Bottom sheet / alttan açılan modal
<View style={[sheet, { paddingBottom: Math.max(14, insets.bottom + 10) }]}>

// Üst taraf: kendi header'ını çizen ekranlar (stack header'ı gizliyse)
paddingTop: insets.top + (Platform.OS === 'ios' ? 8 : 14)
```

**`Math.max(...)` neden var:** `insets.bottom` bazı Android cihazlarda 0 döner. Sadece
`insets.bottom + 16` yazarsan o cihazlarda buton ekranın en dibine yapışır. `Math.max` bir
taban boşluk garantiler.

**Sekme çubuğu yüksekliği `56 + insets.bottom`** (`navigation/index.js`). Sekmeli bir
ekranda kayan içeriğin altına bu kadar boşluk bırakmazsan son satır sekme çubuğunun altında
kalır.

### Örnek düzeltme (git geçmişinden)

`fix: ekstra hizmetler ve sanatçı profili modallarında alt buton Android gezinme çubuğuyla
çakışıyordu` — çözüm tam olarak `ScrollView`'ın `contentContainerStyle`'ına
`paddingBottom: Math.max(20, insets.bottom + 16)` eklemekti.

## 2. Klavye formu kapatmasın

### Önce bunu bil: Android'de klavye zaten "pan" modunda

`mobile/app.json` içinde `android.softwareKeyboardLayoutMode: "pan"` ayarlı. Yani Android
klavye açılınca pencereyi **yeniden boyutlandırmaz, kaydırır** — bu iş zaten native tarafta
yapılıyor. Üstüne bir de `KeyboardAvoidingView behavior="height"` koymak çift kaydırmaya yol
açar; klavye kapanınca ekranın altında beyaz boşluk kalır ve `ScrollView` içeren modallarda
kaydırma jesti tamamen bozulur.

`behavior="height"` bu projede **kullanılmaz.** İki gerçek hata bundan çıktı:
`fix: Turnuva Oluştur'da kaydırma sorunu` ve `fix: Turnuva Oluştur formunda kaydırma yerine
metin seçimi başlıyordu`.

### Tam ekran form (Login, Register, Trail ekle…)

```js
<KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scrollRef} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
        ...
    </ScrollView>
</KeyboardAvoidingView>
```

Android'de `undefined` bilinçli: pan modu işi zaten yapıyor.

### Modal içindeki form (ilan oluştur, turnuva oluştur, hizmet ekle…)

```js
<Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}
       android_keyboardInputMode="adjustNothing">
    <View style={s.modalOverlay}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={s.modalBox}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    ...
                </ScrollView>
            </View>
        </KeyboardAvoidingView>
    </View>
</Modal>
```

Burada `behavior="padding"` her iki platformda da; `android_keyboardInputMode="adjustNothing"`
Android'in modal'ı ayrıca kaydırmasını kapatır. Çalışan referans: `SubCategoryScreen.js`
içindeki `CreateRivalModal` ve `CreateTournamentModal`.

### Öneri / autocomplete listesi — yön + ilk dokunuş

Kullanıcı kazıdı:

- **Üst alanlar** → öneri **aşağı** (`top: '100%'`).
- **Alt alanlar / klavyeye yakın** → öneri **yukarı** (`bottom: '100%'`), klavye örtmesin.
- Öneriye basınca **klavye kapanmasın**, seçim **ilk tıklamada** olsun (yön fark etmez).

```js
// Üst alan — aşağı
dropdownDown: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    marginTop: 2, zIndex: 200, elevation: 10,
}
// Alt / klavye yanı — yukarı
dropdownUp: {
    position: 'absolute', bottom: '100%', left: 0, right: 0,
    marginBottom: 2, zIndex: 200, elevation: 10,
}
// Öneri listesini saran ScrollView / FlatList — ZORUNLU
keyboardShouldPersistTaps="always"
```

Ölçüm yoksa: klavye görünürken yukarı, değilse aşağı. Parent satırda `zIndex` yükselt.
Seçimde `Keyboard.dismiss()` çağırma.

Ayrı skill özeti: `.claude/skills/klavye-form/SKILL.md`.

### `keyboardShouldPersistTaps` — her kaydırılan kapsayıcıda

- Form gövdesi: `"handled"` (yeterli çoğu yerde).
- **Öneri / arama sonuç listesi: `"always"`** — ilk dokunuş seçer, klavyeyi indirmez.

Bunu koymazsan klavye açıkken kullanıcının ilk dokunuşu sadece klavyeyi kapatır, butona
basmış olmaz. Kullanıcı "buton çalışmıyor" / "öneriye iki kez tıklıyorum" diye rapor eder.
Arama/otomatik tamamlama listelerinde `"always"` standart (`TimePickerModal`, slot davet).

### Kullanıcı yazdığını göremiyorsa

Uzun formlarda alanlar klavyenin arkasında kalabilir. Sırayla dene:

1. `ScrollView`'ın `contentContainerStyle`'ına yeterli `paddingBottom` ver
   (`Math.max(20, insets.bottom + 16)` genelde yeterli).
2. Yetmiyorsa `RegisterScreen` kalıbı: `ScrollView`'a `ref` verip alan odaklandığında/adım
   değiştiğinde kaydır. Gecikme klavye animasyonu içindir, keyfi değil:

```js
const scrollRef = useRef(null);
// Klavye açılma animasyonu bitmeden kaydırırsak hedef konum yanlış hesaplanıyor.
setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
```

3. Alt kısımda sabit bir buton varsa, klavye açıkken onu gizlemek yerine `ScrollView`'ın
   içine al — sabit buton + klavye kombinasyonu bu projede hep sorun çıkardı.

## Kontrol listesi

Alt kısma bir şey ekledin veya forma dokundun mu? Şunları geç:

- [ ] Alta yaslanan her öğe `insets.bottom` içeriyor mu (`Math.max` ile taban boşluk var mı)?
- [ ] Kayan içeriğin `paddingBottom`'ı son satırın sekme çubuğunun altında kalmasını önlüyor mu?
- [ ] `behavior="height"` kullanmadın, değil mi?
- [ ] Modal ise `android_keyboardInputMode="adjustNothing"` var mı?
- [ ] Her `ScrollView`/`FlatList`'te `keyboardShouldPersistTaps` var mı? (öneri listesi `"always"`)
- [ ] Formdaki en alttaki alan klavye açıkken görünüyor mu?
- [ ] Öneri yönü doğru mu (üst→aşağı, alt/klavye→yukarı); ilk dokunuş seçiyor mu?
- [ ] Eklediğin tüm metinler `t.anahtar` üzerinden mi geliyor ve anahtar hem `en` hem `tr`
      nesnesine eklendi mi?
