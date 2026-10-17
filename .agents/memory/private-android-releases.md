---
name: Private Android releases
description: Resource and signing constraints for future sideloaded Android builds
---

For privately installed Android updates, keep the original release signing identity and increase the app version code. Do not assume the generated native project still has its release signing configuration after an Expo prebuild.

**Why:** The first signed APK was built from a generated native directory that is ignored by Git. Its release-signing configuration was applied there, while the permanent, password-protected keystore backup is separate. Generating native files again can restore the default debug-signing configuration, which would prevent an update from installing over the original. The workspace also exhausted memory while compiling all four Android ABIs concurrently; a single ARM64 build with constrained parallelism completed.

**How to apply:** Before any later sideloaded release, restore the same keystore securely, ensure Gradle explicitly uses it for the release variant, increment the version code, constrain build parallelism, and verify the finished APK's package ID and signing certificate against the previous release. Check the target phone's CPU architecture before relying on an ARM64-only APK.