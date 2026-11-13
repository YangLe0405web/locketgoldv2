# Locket Studio iOS

Target: iPhone, iOS 17+. `capacitor.config.json` has no remote server URL. Assets and the social API adapter are bundled. No PC server is required for the native networking routes.

Build locally on macOS, or run **Build iPhone IPA** in GitHub Actions on `codex/ios-standalone`:

1. `npm ci`
2. `node scripts/build-mobile.cjs`
3. `npx cap copy ios` (do not run `cap sync`, which overwrites the customized Swift package)
4. Run the Xcode command in `.github/workflows/ios.yml`.

The artifact is **LocketStudio-unsigned.ipa**. It is not signed by Apple and cannot be installed directly without the user's signing tool. No certificate, Apple login or private key is committed.

The iPhone build uses native HTTPS for Firebase/Locket requests, with the existing route logic shared from `server.js`. Authentication, messaging and posting still require acceptance by Locket's service; a successful build does not verify these against a real account. This is an unofficial client.

## AI limitations

The iOS plugin uses Apple's Core ML Stable Diffusion pipeline and Apple's palettized SD 1.5 image-to-image model, downloaded on demand (~1.6 GB compressed, extra disk space needed for extraction). It does **not** use the desktop InstructPix2Pix model and does not contact Gemini/OpenAI. Keep the app open while downloading or generating. Low-memory mode is enabled, but iPhone 11 speed, memory stability and identity preservation need physical-device testing. Arbitrary reference-image transformation is explicitly unsupported in this first native build.

Model source/license: https://huggingface.co/apple/coreml-stable-diffusion-v1-5-palettized

Pipeline source/license: https://github.com/apple/ml-stable-diffusion

Camera face tracking may download its small detector on first use. The free client cannot grant paid Locket entitlements. No claim of feature parity, background widgets or remote push notifications is made.
