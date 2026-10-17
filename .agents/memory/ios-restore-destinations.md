---
name: iOS restore destinations
description: Why LAN Backup restores use the native share sheet instead of an app-owned folder on iOS.
---

iOS standalone builds use the native Files export picker for each restored file; Expo Go falls back to its native share sheet. The user chooses the destination per file. Do not promise a persistent folder selection or direct network-to-Files streaming.

**Why:** Expo Go cannot load app-specific native modules and keeps each project's document directory in a private sandbox. A custom native module can hand a downloaded cache file to iOS's Files export picker, but destination authorization remains a user action for every file.

**How to apply:** In the standalone build, process files sequentially through the native export picker and keep each temporary file until the picker closes. In Expo Go, retain the share-sheet fallback. A persistent folder authorization or one-action multi-file export needs additional native work.