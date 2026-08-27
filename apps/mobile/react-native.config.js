// React Native autolinking overrides.
//
// @react-native-ml-kit/text-recognition ships both an Android and an iOS
// implementation, but iOS already does OCR through Apple Vision
// (modules/with-vision-ocr + lib/ocr). Letting it autolink on iOS would add
// the Google ML Kit pods to a shipping iOS binary for no functional gain:
// a bigger download, a second OCR engine to reason about, and new native code
// in the build that produces App Store releases.
//
// Setting the ios platform to null keeps the dependency Android-only.
module.exports = {
  dependencies: {
    "@react-native-ml-kit/text-recognition": {
      platforms: {
        ios: null,
      },
    },
  },
};
