const { withProjectBuildGradle } = require('expo/config-plugins');

// Huawei Wear Engine Kit (com.huawei.wearengine, bkz.
// modules/wear-bridge/android/build.gradle) sadece Huawei'nin kendi Maven
// deposunda yayınlanıyor. Bu proje "managed" Expo workflow kullandığı için
// android/ klasörü commit'lenmiyor — her prebuild/EAS Build'de yeniden
// üretiliyor, bu yüzden depo kaydı buradan (config plugin) enjekte ediliyor.
const HUAWEI_MAVEN_URL = 'https://developer.huawei.com/repo/';

module.exports = function withHuaweiWearEngineRepo(config) {
    return withProjectBuildGradle(config, (config) => {
        if (config.modResults.language !== 'groovy') return config;
        if (config.modResults.contents.includes(HUAWEI_MAVEN_URL)) return config;

        config.modResults.contents = config.modResults.contents.replace(
            /allprojects\s*\{\s*repositories\s*\{/,
            (match) => `${match}\n        maven { url '${HUAWEI_MAVEN_URL}' }`
        );
        return config;
    });
};
