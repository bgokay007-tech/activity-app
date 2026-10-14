import { forwardRef, useContext, useEffect } from 'react';
import { Platform } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import {
    KeyboardAwareScrollView, KeyboardController, AndroidSoftInputModes,
} from 'react-native-keyboard-controller';

// Form kapsayıcısı: odaklanan TextInput'u klavyenin üstüne kendisi kaydırır, her alana
// tek tek onFocus/scrollTo yazmaya gerek kalmaz. ScrollView yerine birebir kullanılır.
//
// app.json'da Android "pan" duruyor (geçirilmemiş eski ekranlar ona güveniyor). Pan
// açıkken pencere de kaydığı için bu bileşen çift kaydırıyordu — ekran odaktayken
// adjustResize'a geçip odaktan çıkınca varsayılana dönüyoruz.
// Modal içinde adjustWindow={false} ver: Modal kendi penceresinde (RN 0.81 her zaman
// adjustResize), arkadaki ekranın modunu değiştirmek o ekranın input'larını pan'sız bırakıyordu.
//
// Modal'da KeyboardAvoidingView (padding) + bu bileşen sadece sheet maxHeight'a dayanmış
// uzun formlarda doğru: KAV sheet'i kısaltır, bu da içeride kaydırır. İçeriği kısa olup
// sheet'in tamamen yukarı kalktığı formlarda ikisi birden kaydırır — orada düz ScrollView kalsın.
function useResizeWhileFocused(adjustWindow) {
    const navigation = useContext(NavigationContext);
    useEffect(() => {
        if (Platform.OS !== 'android' || !adjustWindow) return undefined;
        const toResize = () => KeyboardController.setInputMode(AndroidSoftInputModes.SOFT_INPUT_ADJUST_RESIZE);
        const toDefault = () => KeyboardController.setDefaultMode();
        if (!navigation) {
            toResize();
            return toDefault;
        }
        if (navigation.isFocused()) toResize();
        const offFocus = navigation.addListener('focus', toResize);
        const offBlur = navigation.addListener('blur', toDefault);
        return () => { offFocus(); offBlur(); toDefault(); };
    }, [navigation, adjustWindow]);
}

const KeyboardAwareForm = forwardRef(function KeyboardAwareForm(
    { children, bottomOffset = 24, keyboardShouldPersistTaps = 'handled', adjustWindow = true, ...rest },
    ref,
) {
    useResizeWhileFocused(adjustWindow);
    return (
        <KeyboardAwareScrollView
            ref={ref}
            bottomOffset={bottomOffset}
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            {...rest}
        >
            {children}
        </KeyboardAwareScrollView>
    );
});

export default KeyboardAwareForm;
