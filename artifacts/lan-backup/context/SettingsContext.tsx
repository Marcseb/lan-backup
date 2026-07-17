import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type ImageQuality = "low" | "medium" | "high";

export interface PeerServer {
  id: string;
  name: string;
  ip: string;
  port: string;
  token: string;
  fingerprint: string | null;
}

export interface Settings {
  serverIp: string;
  serverPort: string;
  authToken: string;
  targetFolder: string;
  serverFingerprint: string | null;
  compressImages: boolean;
  imageQuality: ImageQuality;
  restoreUnlocked: boolean;
  restoreUnlockKey: string;
  restoreFolder: string;
  peerServers: PeerServer[];
}

const DEFAULT_SETTINGS: Settings = {
  serverIp: "",
  serverPort: "7823",
  authToken: "",
  targetFolder: "backup",
  serverFingerprint: null,
  compressImages: false,
  imageQuality: "low",
  restoreUnlocked: false,
  restoreUnlockKey: "",
  restoreFolder: "",
  peerServers: [],
};

const KEYS = {
  serverIp: "lb_server_ip",
  serverPort: "lb_server_port",
  authToken: "lb_auth_token",
  targetFolder: "lb_target_folder",
  serverFingerprint: "lb_server_fingerprint",
  compressImages: "lb_compress_images",
  imageQuality: "lb_image_quality",
  restoreUnlocked: "lb_restore_unlocked",
  restoreUnlockKey: "lb_restore_unlock_key",
  restoreFolder: "lb_restore_folder",
  peerServers: "lb_peer_servers",
} as const;

interface SettingsContextValue {
  settings: Settings;
  isLoaded: boolean;
  updateSetting: <K extends keyof Omit<Settings, "peerServers">>(key: K, value: Settings[K]) => Promise<void>;
  saveAllSettings: (s: Settings) => Promise<void>;
  clearFingerprint: () => Promise<void>;
  isConfigured: boolean;
  savePeerServers: (servers: PeerServer[]) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [
          ip, port, token, folder, fingerprint, compress, quality,
          restoreUnlocked, restoreUnlockKey, restoreFolder, peerServersRaw,
        ] = await Promise.all([
          SecureStore.getItemAsync(KEYS.serverIp),
          SecureStore.getItemAsync(KEYS.serverPort),
          SecureStore.getItemAsync(KEYS.authToken),
          SecureStore.getItemAsync(KEYS.targetFolder),
          SecureStore.getItemAsync(KEYS.serverFingerprint),
          SecureStore.getItemAsync(KEYS.compressImages),
          SecureStore.getItemAsync(KEYS.imageQuality),
          SecureStore.getItemAsync(KEYS.restoreUnlocked),
          SecureStore.getItemAsync(KEYS.restoreUnlockKey),
          SecureStore.getItemAsync(KEYS.restoreFolder),
          SecureStore.getItemAsync(KEYS.peerServers),
        ]);

        let peerServers: PeerServer[] = [];
        try { peerServers = JSON.parse(peerServersRaw ?? "[]"); } catch { peerServers = []; }

        setSettings({
          serverIp: ip ?? DEFAULT_SETTINGS.serverIp,
          serverPort: port ?? DEFAULT_SETTINGS.serverPort,
          authToken: token ?? DEFAULT_SETTINGS.authToken,
          targetFolder: folder ?? DEFAULT_SETTINGS.targetFolder,
          serverFingerprint: fingerprint,
          compressImages: compress === "true",
          imageQuality: (quality as ImageQuality) ?? DEFAULT_SETTINGS.imageQuality,
          restoreUnlocked: restoreUnlocked === "true",
          restoreUnlockKey: restoreUnlockKey ?? "",
          restoreFolder: restoreFolder ?? "",
          peerServers,
        });
      } catch {
        // SecureStore unavailable (web preview) — use defaults
      } finally {
        setIsLoaded(true);
      }
    }
    load();
  }, []);

  const updateSetting = useCallback(async <K extends keyof Omit<Settings, "peerServers">>(
    key: K,
    value: Settings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    try {
      if (value === null || value === "") {
        await SecureStore.deleteItemAsync(KEYS[key]);
      } else {
        await SecureStore.setItemAsync(KEYS[key], String(value));
      }
    } catch {
      // ignore on web
    }
  }, []);

  const savePeerServers = useCallback(async (servers: PeerServer[]) => {
    setSettings((prev) => ({ ...prev, peerServers: servers }));
    try {
      if (servers.length === 0) {
        await SecureStore.deleteItemAsync(KEYS.peerServers);
      } else {
        await SecureStore.setItemAsync(KEYS.peerServers, JSON.stringify(servers));
      }
    } catch {
      // ignore on web
    }
  }, []);

  const saveAllSettings = useCallback(async (s: Settings) => {
    setSettings(s);
    try {
      await Promise.all([
        SecureStore.setItemAsync(KEYS.serverIp, s.serverIp),
        SecureStore.setItemAsync(KEYS.serverPort, s.serverPort),
        SecureStore.setItemAsync(KEYS.authToken, s.authToken),
        SecureStore.setItemAsync(KEYS.targetFolder, s.targetFolder),
        s.serverFingerprint
          ? SecureStore.setItemAsync(KEYS.serverFingerprint, s.serverFingerprint)
          : SecureStore.deleteItemAsync(KEYS.serverFingerprint),
        SecureStore.setItemAsync(KEYS.compressImages, String(s.compressImages)),
        SecureStore.setItemAsync(KEYS.imageQuality, s.imageQuality),
        SecureStore.setItemAsync(KEYS.restoreUnlocked, String(s.restoreUnlocked)),
        s.restoreUnlockKey
          ? SecureStore.setItemAsync(KEYS.restoreUnlockKey, s.restoreUnlockKey)
          : SecureStore.deleteItemAsync(KEYS.restoreUnlockKey),
        s.restoreFolder
          ? SecureStore.setItemAsync(KEYS.restoreFolder, s.restoreFolder)
          : SecureStore.deleteItemAsync(KEYS.restoreFolder),
        s.peerServers.length > 0
          ? SecureStore.setItemAsync(KEYS.peerServers, JSON.stringify(s.peerServers))
          : SecureStore.deleteItemAsync(KEYS.peerServers),
      ]);
    } catch {
      // ignore on web
    }
  }, []);

  const clearFingerprint = useCallback(async () => {
    setSettings((prev) => ({ ...prev, serverFingerprint: null }));
    try {
      await SecureStore.deleteItemAsync(KEYS.serverFingerprint);
    } catch {
      // ignore
    }
  }, []);

  const isConfigured =
    settings.serverIp.trim().length > 0 && settings.authToken.trim().length > 0;

  return (
    <SettingsContext.Provider
      value={{
        settings,
        isLoaded,
        updateSetting,
        saveAllSettings,
        clearFingerprint,
        isConfigured,
        savePeerServers,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
