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
// adjustResize'a geçip odaktan çıkınca varsayılana dönüyoruz. Modal içinde de zararsız:
// Modal kendi penceresinde, adjustNothing orada ayrıca uygulanıyor.
function useResizeWhileFocused() {
    const navigation = useContext(NavigationContext);
    useEffect(() => {
        if (Platform.OS !== 'android') return undefined;
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
    }, [navigation]);
}

const KeyboardAwareForm = forwardRef(function KeyboardAwareForm(
    { children, bottomOffset = 24, keyboardShouldPersistTaps = 'handled', ...rest },
    ref,
) {
    useResizeWhileFocused();
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
