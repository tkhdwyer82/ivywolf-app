// Adopts the UIScene life cycle, which the iOS 27 SDK requires at launch.
//
// Expo SDK 57 ships `ExpoAppSceneDelegate` (objc name `EXExpoAppSceneDelegate`) but the
// prebuild template doesn't wire it up yet. This plugin:
//   1. declares the scene manifest in Info.plist, pointing at Expo's scene delegate;
//   2. makes AppDelegate conform to `ExpoReactNativeFactoryProvider` so the scene delegate
//      can reach the React Native factory;
//   3. removes the window creation from `didFinishLaunchingWithOptions` — the scene
//      delegate now creates the window and starts React Native into it.
//
// Remove once the Expo template adopts scenes itself (expected in SDK 58).
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_DELEGATE_CLASS = 'EXExpoAppSceneDelegate';

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: SCENE_DELEGATE_CLASS,
          },
        ],
      },
    };
    return cfg;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle: expected a Swift AppDelegate');
    }
    let src = cfg.modResults.contents;

    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      const next = src.replace(
        /class AppDelegate: ExpoAppDelegate \{/,
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {'
      );
      if (next === src) {
        throw new Error('withSceneLifecycle: could not find AppDelegate class declaration');
      }
      src = next;
    }

    const windowSetup =
      /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;
    if (windowSetup.test(src)) {
      src = src.replace(
        windowSetup,
        '\n    // The window is created by ExpoAppSceneDelegate (see plugins/withSceneLifecycle.js).\n'
      );
    } else if (!src.includes('ExpoAppSceneDelegate')) {
      throw new Error('withSceneLifecycle: could not find window setup in AppDelegate');
    }

    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneAppDelegate(withSceneManifest(config));
};
