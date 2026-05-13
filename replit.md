# LAN Backup

A mobile app for securely backing up files from a phone to a computer on the same WiFi network.

## Run & Operate

- `pnpm --filter @workspace/lan-backup run dev` — run the Expo app (port 19921)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo (React Native), expo-router, expo-secure-store
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/lan-backup/` — Expo mobile app
- `artifacts/lan-backup/app/(tabs)/` — Backup, History, Settings screens
- `artifacts/lan-backup/context/` — SettingsContext (SecureStore), TransferContext (AsyncStorage)
- `artifacts/lan-backup/utils/serverApi.ts` — API calls to companion server
- `artifacts/lan-backup/components/` — ServerStatusCard, FileListItem, HistoryCard
- `artifacts/lan-backup/companion-server/server.js` — Node.js companion server (run on the user's computer)
- `artifacts/lan-backup/companion-server/README.md` — Setup instructions for companion server

## Architecture decisions

- **No app backend needed** — the phone connects directly to the companion server running on the user's computer over LAN (plain HTTP, authenticated with bearer token).
- **expo-secure-store** for all credentials — AES-256 hardware-backed (Keychain/Keystore); nothing in AsyncStorage or plain files.
- **TOFU (Trust On First Use)** — the companion server generates a random persistent ID on first run; the app stores it in SecureStore and detects mismatches on subsequent connections (impersonation detection).
- **Bearer token auth** — all sensitive endpoints (disk info, file upload) require `Authorization: Bearer <token>`; the token is user-configurable and compared with `crypto.timingSafeEqual` on the server.
- **Path traversal protection** — filenames are sanitized on the server; paths are resolved and validated to stay inside the backup root.

## Product

- Select files or folders from the phone using the native document picker
- Check target server disk space before transfer (shows used/free/percent)
- Upload files with per-file progress indicators
- Cancel transfers mid-flight
- Transfer history with status, file names, sizes, and timestamps
- All server credentials stored encrypted in device secure enclave
- TOFU fingerprint alerts the user if the server identity changes

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The companion server (`companion-server/server.js`) must be running on the target computer before transfers can start
- The auth token must match exactly between app settings and `LB_TOKEN` env var on the server
- expo-crypto is pinned to ~15.0.0 (v55+ crashes in Expo Go)
- expo-document-picker, expo-file-system, expo-secure-store are pinned to Expo SDK 54 expected versions
- `File` class imported from `expo-file-system` (not `expo/fetch`) for creating uploadable files

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
