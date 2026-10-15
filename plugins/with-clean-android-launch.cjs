const { AndroidConfig, withAndroidColors, withAndroidStyles, withDangerousMod } = require('@expo/config-plugins');
const { readdir, rm, writeFile } = require('node:fs/promises');
const { join } = require('node:path');

// Keep this in prebuild configuration so regenerating Android cannot restore
// the starter template's full-screen construction-grid drawable.
module.exports = function withCleanAndroidLaunch(config) {
  config = withAndroidColors(config, config => {
    config.modResults = AndroidConfig.Colors.assignColorValue(config.modResults, {
      name: 'splashscreen_background', value: '#F6F7F2',
    });
    return config;
  });
  config = withAndroidStyles(config, config => {
    for (const [name, value] of Object.entries({
      'android:windowBackground': '@color/splashscreen_background',
      'android:windowSplashScreenBackground': '@color/splashscreen_background',
      'android:windowSplashScreenAnimatedIcon': '@android:color/transparent',
    })) {
      config.modResults = AndroidConfig.Styles.assignStylesValue(config.modResults, {
        add: true, name, value, parent: { name: 'Theme.App.SplashScreen', parent: 'AppTheme' },
      });
    }
    return config;
  });
  return withDangerousMod(config, ['android', async config => {
    const resources = join(config.modRequest.platformProjectRoot, 'app/src/main/res');
    for (const directory of await readdir(resources)) {
      if (!directory.startsWith('drawable')) continue;
      for (const file of await readdir(join(resources, directory))) {
        if (file.startsWith('splashscreen_logo.')) await rm(join(resources, directory, file));
      }
    }
    // The starter's unused launcher layer also references the draft drawable.
    await writeFile(join(resources, 'drawable/ic_launcher_background.xml'),
      '<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="@color/iconBackground"/></layer-list>\n');
    return config;
  }]);
};
