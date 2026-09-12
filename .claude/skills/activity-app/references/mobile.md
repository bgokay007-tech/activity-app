# Mobil kalıpları

`mobile/` — Expo SDK 54, React Native 0.81, React 19, Redux Toolkit, React Navigation 7.
Asıl ürün burası. Şablon olarak `src/screens/main/MyReservationsScreen.js` (412 satır) oku:
liste + kart bileşeni + API çağrısı + socket + i18n + stil, hepsi tek dosyada ve tipik.

**Kod yazmadan önce:** `mobile/AGENTS.md` Expo'nun sürümler arası değiştiğini ve sürüme özel
dokümanın okunması gerektiğini söylüyor. Bir Expo API'sinden emin değilsen tahmin etme,
`package.json`'daki pinli sürümün dokümanına bak.

**Canlı görünüm:** UI değişiyorsa Metro tüneli ayakta olsun —
`npx expo start --dev-client --tunnel --port 8081` (`CI` yok). Kullanıcı APK ile bakar.

## Klasör düzeni

```
mobile/src/
├── screens/
│   ├── auth/        Login, Register
│   ├── main/        kullanıcı ekranları (34 dosya)
│   ├── business/    işletme paneli
│   └── admin/       admin portalı
├── components/      paylaşılan bileşenler (modal'lar, Avatar, TrailCard…)
├── navigation/      index.js — tek dosya, tab + stack + bildirim/deep-link yönlendirmesi
├── services/        api.js, socket.js, musicPlayer.js, trailTracking.js
├── store/           Redux store + slices (auth, lang, notification)
├── i18n/            index.js — tek dosya, `en` ve `tr` nesneleri (~2.300 satır)
├── theme/           colors.js, scale.js
├── hooks/           useT.js
└── utils/           languages, priceProration, share, subCategoryLabels
```

## Ekran iskeleti

```js
import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';

export default function MyThingScreen({ navigation }) {
    const t = useT();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    // Ekrana her dönüşte tazelenir — useEffect yerine useFocusEffect, çünkü kullanıcı
    // başka ekranda değişiklik yapıp geri geldiğinde liste bayat kalıyordu.
    useFocusEffect(useCallback(() => {
        let alive = true;
        (async () => {
            try {
                const { data } = await api.get('/things');
                if (alive) setItems(data);
            } catch (e) {
                Alert.alert(t.error, e?.response?.data?.message || t.somethingWrong);
            } finally { if (alive) setLoading(false); }
        })();
        return () => { alive = false; };
    }, []));

    if (loading) return <View style={s.center}><ActivityIndicator color={colors.purple} /></View>;

    return (
        <View style={s.root}>
            <FlatList
                data={items}
                keyExtractor={i => i.id}
                contentContainerStyle={s.list}
                renderItem={({ item }) => <ThingCard item={item} />}
            />
        </View>
    );
}

const s = StyleSheet.create({
    root:   { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list:   { padding: 14, gap: 10 },
});
```

Konvansiyonlar:

- **Fonksiyon bileşeni + default export.** `React` import edilmez (yeni JSX transform).
- **`useFocusEffect`**, sekmeler arası dönüşte veri tazelemek için `useEffect`'e tercih edilir.
- **StyleSheet dosyanın en altında, adı `s`.** Inline stil sadece dinamik değer için
  (`style={[s.badge, { borderColor: sc }]}`).
- Aynı ekranda kullanılan yardımcı kart bileşenleri (`function ReservationCard(...)`) aynı
  dosyada, ana bileşenin üstünde tanımlanır. Başka ekranda da lazımsa `components/`'a taşı.
- İkonografi emoji ile (`'🎾'`, `'📋 İptal Talebi'`). İkon kütüphanesi yok.

## Güvenli alan ve klavye

Ekranın altına bir şey sabitliyorsan (buton satırı, bottom sheet, sekme çubuğu üstü bar) ya
da ekranda `TextInput` varsa **`references/ekran-guvenli-alan.md` dosyasını oku ve uygula.**
Bu iki konu projede en çok tekrar eden hata kaynağı: buton Android gezinme çubuğunun altında
kalıyor, klavye formu kapatıyor, `behavior="height"` kaydırmayı bozuyor. Oradaki kalıplar
gerçek düzeltmelerden çıkarıldı.

## Tema

`theme/colors.js` koyu tema paleti — renkleri buradan al, hex yazma:

```
bg #030712 · surface #111827 · surface2 #1f2937 · border #374151
text #f9fafb · textSecondary #9ca3af · textMuted #6b7280
purple #9333ea (birincil aksan) · green · yellow · red · blue
```

Mevcut kodda `#fff`, `#f87171` gibi doğrudan hex'ler de var; yeni kodda paletteki karşılığı
varsa onu kullan.

`theme/scale.js` (`scale`, `verticalScale`, `moderateScale`) sadece birkaç ekranda
(Trail ekranları, SubCategoryScreen) kullanılıyor. Yeni ekranda zorunlu değil — çevresindeki
dosya ne yapıyorsa ona uy.

## API çağrıları

Her istek `services/api.js`'teki tek axios örneğinden geçer. Token'ı request interceptor'ı
AsyncStorage'dan ekler; sen `Authorization` başlığı yazma.

```js
const { data } = await api.get(`/venues/${id}`);
await api.post('/equipment', payload);
await api.patch(`/equipment/offers/${offerId}`, { status: 'ACCEPTED' });
```

`validateStatus: () => true` ayarı yüzünden **axios kendi başına hiçbir durumu reddetmez**;
interceptor 4xx/5xx'i `Error`'a çevirip fırlatır ve `err.response`'u üstüne iliştirir. Bu
yüzden hata mesajı her zaman şu şekilde okunur:

```js
catch (e) { Alert.alert(t.error, e?.response?.data?.message || t.somethingWrong); }
```

401 gelirse token silinip `logout()` dispatch edilir — ekranda ayrıca ele alma.

Socket olayları için `services/socket.js`:

```js
import { onSocket } from '../../services/socket';
useEffect(() => onSocket('reservation:updated', ({ id }) => { /* ... */ }), []);
```

## i18n

`src/i18n/index.js` içinde iki büyük düz nesne var: `const en = {...}` ve `const tr = {...}`
(tr, ~1155. satırda başlar). Bileşende:

```js
const t = useT();
<Text>{t.myReservations}</Text>
```

Kurallar:

- **Anahtar her iki nesneye de eklenir.** Sadece `en`'e eklersen Türkçe'de anahtar adı ham
  görünür — bu depoda geçmişte defalarca olmuş bir hata.
- Anahtar adı camelCase ve özellik önekli (`resStatusPending`, `fpBackToLogin`,
  `actAlertSave`). İlgili anahtarları dosyada mevcut bölüm yorumunun (`// Auth — Login`)
  altına, komşularının yanına ekle; sona rastgele atma.
- Değişken içeren metinler fonksiyon olarak yazılır:
  `fpCodeSent: email => \`Code sent to ${email}\``.
- Dal/kategori adları için i18n değil `utils/subCategoryLabels.js` → `getSubCategoryLabel(sub, lang)`.

## Navigasyon

`src/navigation/index.js` tek dosya: alt sekmeler (Home / Messages / Alerts / Profile) +
her sekmenin native stack'i + bildirim ve deep-link yönlendirmesi.

Yeni ekran eklerken:

1. İlgili stack'e `<Stack.Screen name="Thing" component={ThingScreen} />` ekle.
2. `navigation.navigate('Thing', { ... })` ile aç.
3. Ekran bir bildirimden açılacaksa `navigateFromNotif` içindeki zincire de bir dal ekle
   (backend'in gönderdiği `type` ile eşleşmeli).
4. Paylaşılabilir olacaksa `resolveDeepLinkAndNavigate` içine `activityapp://<tür>/<id>`
   kalıbıyla ekle.

## State

Redux Toolkit ama kapsamı dar: sadece `auth`, `lang`, `notification` slice'ları global.
Ekrana ait veri `useState` ile lokal tutulur — yeni slice açmadan önce gerçekten global
olması gerekiyor mu diye düşün.

```js
const lang = useSelector(s => s.lang?.lang || 'en');
const user = useSelector(s => s.auth?.user);
```
