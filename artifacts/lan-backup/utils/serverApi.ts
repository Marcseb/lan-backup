import { fetch } from "expo/fetch";
import {
  uploadAsync,
  FileSystemUploadType,
  copyAsync,
  deleteAsync,
  cacheDirectory,
} from "expo-file-system/legacy";
import type { Settings } from "@/context/SettingsContext";
import type { SelectedFile } from "@/context/TransferContext";

export interface DiskInfo {
  total: number;
  free: number;
  used: number;
  usagePercent: number;
}

export interface PingResult {
  id: string;
  version: string;
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
