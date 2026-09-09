const {
    withProjectBuildGradle,
    withSettingsGradle,
    withAndroidManifest,
} = require('expo/config-plugins');

// Huawei Wear Engine Kit (com.huawei.hms:wearengine) sadece Huawei'nin kendi Maven
// deposunda. Expo managed workflow'da android/ her prebuild/EAS'te yeniden üretildiği
// için depo kaydı buradan enjekte edilir. AGP 8+ settings.gradle
// dependencyResolutionManagement kullanır — sadece allprojects'e eklemek yetmez,
// FAIL_ON_PROJECT_REPOS / PREFER_SETTINGS altında kök build.gradle yok sayılır.
const HUAWEI_MAVEN_URL = 'https://developer.huawei.com/repo/';
const HUAWEI_PACKAGES = ['com.huawei.health', 'com.huawei.wearengine'];

function addMavenToSettingsGradle(contents, url) {
    if (contents.includes(url)) return contents;
    return contents.replace(
        /dependencyResolutionManagement\s*\{[\s\S]*?repositories\s*\{/,
        (match) => `${match}\n        maven { url '${url}' }`
    );
}

module.exports = function withHuaweiWearEngineRepo(config) {
    config = withSettingsGradle(config, (config) => {
        if (config.modResults.language !== 'groovy') return config;
        config.modResults.contents = addMavenToSettingsGradle(
            config.modResults.contents,
            HUAWEI_MAVEN_URL
        );
        return config;
    });

    config = withProjectBuildGradle(config, (config) => {
        if (config.modResults.language !== 'groovy') return config;
        if (config.modResults.contents.includes(HUAWEI_MAVEN_URL)) return config;

        config.modResults.contents = config.modResults.contents.replace(
            /allprojects\s*\{\s*repositories\s*\{/,
            (match) => `${match}\n        maven { url '${HUAWEI_MAVEN_URL}' }`
        );
        return config;
    });

    // Android 11+ package visibility: Wear Engine, Huawei Sağlık'ı görmezse
    // getBondedDevices boş döner ve skor bildirimi saate hiç gitmez.
    return withAndroidManifest(config, (config) => {
        const manifest = config.modResults.manifest;
        if (!manifest.queries) manifest.queries = [{}];
        const queries = manifest.queries[0];
        if (!queries.package) queries.package = [];
        const existing = new Set(
            queries.package.map((p) => p.$ && p.$['android:name']).filter(Boolean)
        );
        for (const pkg of HUAWEI_PACKAGES) {
            if (!existing.has(pkg)) {
                queries.package.push({ $: { 'android:name': pkg } });
            }
        }
        return config;
    });
};
