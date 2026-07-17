import { fetch } from "expo/fetch";
import {
  uploadAsync,
  FileSystemUploadType,
  copyAsync,
  deleteAsync,
  cacheDirectory,
} from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "react-native";
import type { ImageQuality, Settings } from "@/context/SettingsContext";
import type { SelectedFile } from "@/context/TransferContext";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "heic", "heif", "webp"]);

function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(filename.split(".").pop()?.toLowerCase() ?? "");
}

const QUALITY_MAP: Record<ImageQuality, { compress: number; maxDimension: number }> = {
  low:    { compress: 0.4, maxDimension: 1024 },
  medium: { compress: 0.65, maxDimension: 1920 },
  high:   { compress: 0.85, maxDimension: 2560 },
};

function getImageDimensions(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), () => resolve(null));
  });
}

export async function compressImageIfNeeded(
  file: SelectedFile,
  quality: ImageQuality
): Promise<{ uri: string; isTemp: boolean }> {
  if (!isImageFile(file.name)) return { uri: file.uri, isTemp: false };

  const { compress, maxDimension } = QUALITY_MAP[quality];
  const actions: ImageManipulator.Action[] = [];

  try {
    const dims = await getImageDimensions(file.uri);
    if (dims) {
      const longest = Math.max(dims.width, dims.height);
      if (longest > maxDimension) {
        const scale = maxDimension / longest;
        actions.push({
          resize: {
            width: Math.round(dims.width * scale),
            height: Math.round(dims.height * scale),
          },
        });
      }
    }

    const result = await ImageManipulator.manipulateAsync(
      file.uri,
      actions,
      { compress, format: ImageManipulator.SaveFormat.JPEG }
    );
    return { uri: result.uri, isTemp: true };
  } catch {
    return { uri: file.uri, isTemp: false };
  }
}

export interface DiskInfo {
  total: number;
  free: number;
  used: number;
  usagePercent: number;
}

export interface PingResult {
  id: string;
  version: string;
  hostname?: string;
}

export interface DiscoveredServer {
  ip: string;
  hostname: string;
  id: string;
}

export async function pingServerAt(
  ip: string,
  port: string
): Promise<{ ok: boolean; id: string | null; hostname: string | null; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`http://${ip}:${port}/ping`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, id: null, hostname: null, error: `Server returned ${res.status}` };
    }
    const data = (await res.json()) as PingResult;
    return { ok: true, id: data.id ?? null, hostname: data.hostname ?? null };
  } catch {
    clearTimeout(timer);
    return { ok: false, id: null, hostname: null, error: "Cannot reach server — check the IP and port" };
  }
}

export async function discoverServers(
  subnet: string,
  port: string,
  onProgress: (scanned: number, total: number, found: DiscoveredServer[]) => void,
  signal: AbortSignal
): Promise<DiscoveredServer[]> {
  const found: DiscoveredServer[] = [];
  const total = 254;
  let scanned = 0;
  const BATCH = 30;
  const TIMEOUT_MS = 500;

  const ips: string[] = [];
  for (let i = 1; i <= 254; i++) ips.push(`${subnet}${i}`);

  for (let start = 0; start < ips.length; start += BATCH) {
    if (signal.aborted) break;
    const batch = ips.slice(start, start + BATCH);
    await Promise.all(
      batch.map(async (ip) => {
        if (signal.aborted) return;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
          const res = await fetch(`http://${ip}:${port}/ping`, { signal: ctrl.signal });
          if (res.ok) {
            const data = (await res.json()) as PingResult;
            found.push({ ip, hostname: data.hostname ?? ip, id: data.id });
          }
        } catch {
          // timeout or unreachable — expected for most IPs
        } finally {
          clearTimeout(timer);
          scanned++;
          onProgress(scanned, total, [...found]);
        }
      })
    );
  }
  return found;
}

function baseUrl(settings: Settings) {
  return `http://${settings.serverIp.trim()}:${settings.serverPort.trim()}`;
}

function authHeaders(settings: Settings): Record<string, string> {
  return {
    Authorization: `Bearer ${settings.authToken}`,
    "X-Client": "LAN-Backup/1.0",
  };
}

export async function pingServer(
  settings: Settings,
  knownFingerprint: string | null
): Promise<{ ok: boolean; fingerprintMismatch: boolean; id: string | null; error?: string }> {
  try {
    const res = await fetch(`${baseUrl(settings)}/ping`, {
      method: "GET",
      headers: { "X-Client": "LAN-Backup/1.0" },
    });
    if (!res.ok) {
      return { ok: false, fingerprintMismatch: false, id: null, error: `Server returned ${res.status}` };
    }
    const data = (await res.json()) as PingResult;
    const serverId = data.id ?? null;

    if (knownFingerprint && serverId && serverId !== knownFingerprint) {
      return { ok: false, fingerprintMismatch: true, id: serverId, error: "Server fingerprint mismatch — possible impersonation" };
    }
    return { ok: true, fingerprintMismatch: false, id: serverId };
  } catch (e) {
    return { ok: false, fingerprintMismatch: false, id: null, error: String(e) };
  }
}

export async function getDiskInfo(settings: Settings): Promise<DiskInfo> {
  const res = await fetch(`${baseUrl(settings)}/disk`, {
    method: "GET",
    headers: authHeaders(settings),
  });
  if (res.status === 401) throw new Error("Unauthorized — check your auth token");
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return (await res.json()) as DiskInfo;
}

export interface ExportFile {
  name: string;
  size: number;
  mtime: number;
}

export async function listExportFiles(settings: Settings): Promise<{ files: ExportFile[]; exportDir: string }> {
  const res = await fetch(`${baseUrl(settings)}/export/list`, {
    method: "GET",
    headers: authHeaders(settings),
  });
  if (res.status === 401) throw new Error("Unauthorized — check your auth token");
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return (await res.json()) as { files: ExportFile[]; exportDir: string };
}

export async function downloadExportFile(
  settings: Settings,
  filename: string,
  destUri: string,
  onProgress?: (received: number, total: number) => void
): Promise<void> {
  const safeFilename = filename.split("/").pop() ?? filename;
  const url = `${baseUrl(settings)}/export/file?name=${encodeURIComponent(safeFilename)}`;

  const { downloadAsync, createDownloadResumable } = await import("expo-file-system/legacy");
  void downloadAsync; // keep import happy

  const task = createDownloadResumable(
    url,
    destUri,
    { headers: authHeaders(settings) },
    (progress) => {
      onProgress?.(progress.totalBytesWritten, progress.totalBytesExpectedToWrite);
    }
  );

  const result = await task.downloadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`Download failed: ${result?.status ?? "unknown"}`);
  }
}

// ── Peer-to-peer server sync ──────────────────────────────────────────────────

export interface PeerSyncDestination {
  url: string;
  token: string;
  fingerprint: string | null;
}

export interface PeerTransferStart {
  transferId: string;
  files: string[];
  destinations: string[];
}

export interface PeerFileProgress {
  done: boolean;
  error: string | null;
}

export interface PeerTransferStatus {
  status: "running" | "done" | "error";
  sourceFiles: string[];
  destinations: string[];
  progress: Record<string, Record<string, PeerFileProgress>>;
  startedAt: number;
  error: string | null;
}

export async function startPeerSync(
  settings: Settings,
  destinations: PeerSyncDestination[]
): Promise<PeerTransferStart> {
  const res = await fetch(`${baseUrl(settings)}/peer-transfer`, {
    method: "POST",
    headers: { ...authHeaders(settings), "Content-Type": "application/json" },
    body: JSON.stringify({ destinations }),
  });
  if (res.status === 401) throw new Error("Unauthorized — check your auth token");
  if (res.status === 409) throw new Error("A peer transfer is already in progress on this server");
  if (!res.ok) {
    let msg = `Server error: ${res.status}`;
    try { const d = (await res.json()) as { error?: string }; if (d.error) msg = d.error; } catch { }
    throw new Error(msg);
  }
  return (await res.json()) as PeerTransferStart;
}

export async function pollPeerSync(
  settings: Settings,
  transferId: string
): Promise<PeerTransferStatus> {
  const res = await fetch(`${baseUrl(settings)}/peer-transfer/${encodeURIComponent(transferId)}`, {
    headers: authHeaders(settings),
  });
  if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
  return (await res.json()) as PeerTransferStatus;
}

export interface UploadResult {
  filename: string;
  size: number;
  checksum: string;
  success: boolean;
}

export async function uploadFile(
  settings: Settings,
  file: SelectedFile,
  onProgress?: (sent: number, total: number) => void
): Promise<UploadResult> {
  onProgress?.(0, file.size);

  // SAF content:// URIs cannot be read directly by either the new v19 File API
  // or the legacy uploadAsync native module.  Copy to a cache file:// path
  // first, upload from there, then remove the temp copy.
  const isSaf = file.uri.startsWith("content://");
  const tempUri = isSaf
    ? `${cacheDirectory}lb_upload_${Date.now()}_${file.name}`
    : null;

  try {
    if (isSaf && tempUri) {
      await copyAsync({ from: file.uri, to: tempUri });
    }

    const uploadUri = tempUri ?? file.uri;

    const res = await uploadAsync(
      `${baseUrl(settings)}/upload`,
      uploadUri,
      {
        httpMethod: "POST",
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: "file",
        mimeType: "application/octet-stream",
        parameters: {
          targetFolder: settings.targetFolder,
          filename: file.name,
          ...(file.relativePath ? { relativePath: file.relativePath } : {}),
        },
        headers: authHeaders(settings),
        onUploadProgress: ({ totalByteSent, totalBytesExpectedToSend }) => {
          onProgress?.(totalByteSent, totalBytesExpectedToSend || file.size);
        },
      }
    );

    if (res.status === 401) throw new Error("Unauthorized — check your auth token");
    if (res.status === 429) throw new Error("Rate limited by server — slow down");
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Upload failed: ${res.status} ${res.body}`);
    }

    const result = JSON.parse(res.body) as UploadResult;
    onProgress?.(file.size, file.size);
    return result;
  } finally {
    if (tempUri) {
      await deleteAsync(tempUri, { idempotent: true }).catch(() => {});
    }
  }
}
