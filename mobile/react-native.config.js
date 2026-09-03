// EAS Build'de "RNGP - Autolinking: Could not find project.android.packageName in
// react-native config output!" hatasi aliniyordu -- react-native community CLI'nin
// autolinking icin android paket adini otomatik tespit edemedigi bilinen bir React
// Native hatasi (facebook/react-native #45307, #45403, #46134, #46443, #53680).
// Paket adi burada acikca belirtilince autolinking dogru calisiyor.
module.exports = {
  project: {
    android: {
      packageName: 'com.activity.app',
    },
  },
};
