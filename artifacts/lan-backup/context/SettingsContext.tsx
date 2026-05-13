import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface Settings {
  serverIp: string;
  serverPort: string;
  authToken: string;
  targetFolder: string;
  serverFingerprint: string | null;
}

const DEFAULT_SETTINGS: Settings = {
  serverIp: "",
  serverPort: "7823",
  authToken: "",
  targetFolder: "backup",
  serverFingerprint: null,
};

const KEYS = {
  serverIp: "lb_server_ip",
  serverPort: "lb_server_port",
  authToken: "lb_auth_token",
  targetFolder: "lb_target_folder",
  serverFingerprint: "lb_server_fingerprint",
} as const;

interface SettingsContextValue {
  settings: Settings;
  isLoaded: boolean;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  saveAllSettings: (s: Settings) => Promise<void>;
  clearFingerprint: () => Promise<void>;
  isConfigured: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [ip, port, token, folder, fingerprint] = await Promise.all([
          SecureStore.getItemAsync(KEYS.serverIp),
          SecureStore.getItemAsync(KEYS.serverPort),
          SecureStore.getItemAsync(KEYS.authToken),
          SecureStore.getItemAsync(KEYS.targetFolder),
          SecureStore.getItemAsync(KEYS.serverFingerprint),
        ]);
        setSettings({
          serverIp: ip ?? DEFAULT_SETTINGS.serverIp,
          serverPort: port ?? DEFAULT_SETTINGS.serverPort,
          authToken: token ?? DEFAULT_SETTINGS.authToken,
          targetFolder: folder ?? DEFAULT_SETTINGS.targetFolder,
          serverFingerprint: fingerprint,
        });
      } catch {
        // SecureStore unavailable (web preview) — use defaults
      } finally {
        setIsLoaded(true);
      }
    }
    load();
  }, []);

  const updateSetting = useCallback(async <K extends keyof Settings>(
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
