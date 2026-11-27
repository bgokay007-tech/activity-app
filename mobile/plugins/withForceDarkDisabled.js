const { withAndroidStyles } = require('expo/config-plugins');

// OEM Force Dark (Android 10+) bazı telefonlarda marka lime (#C8F54A) dolgularını
// koyu orman yeşiline çevirip telefona göre farklı gösteriyordu. Uygulama zaten
// koyu temalı — Force Dark'a izin verme.
module.exports = function withForceDarkDisabled(config) {
    return withAndroidStyles(config, (config) => {
        const styles = config.modResults;
        const appTheme = styles.resources?.style?.find(
            (s) => s.$.name === 'AppTheme' || s.$.name === 'AppTheme.NoActionBar'
        ) || styles.resources?.style?.[0];
        if (!appTheme) return config;
        if (!appTheme.item) appTheme.item = [];
        const exists = appTheme.item.some(
            (i) => i.$?.name === 'android:forceDarkAllowed'
        );
        if (!exists) {
            appTheme.item.push({
                $: { name: 'android:forceDarkAllowed', 'tools:targetApi': 'q' },
                _: 'false',
            });
        } else {
            const item = appTheme.item.find((i) => i.$?.name === 'android:forceDarkAllowed');
            if (item) item._ = 'false';
        }
        if (!styles.resources.$) styles.resources.$ = {};
        if (!styles.resources.$['xmlns:tools']) {
            styles.resources.$['xmlns:tools'] = 'http://schemas.android.com/tools';
        }
        return config;
    });
};
