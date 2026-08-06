import { Feather } from "@expo/vector-icons";
import {
  cacheDirectory,
  documentDirectory,
  readAsStringAsync,
  writeAsStringAsync,
  deleteAsync,
  EncodingType,
  StorageAccessFramework,
} from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { openURL } from "expo-linking";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { type ExportFile, downloadExportFile, listExportFiles, pingServer } from "@/utils/serverApi";

// Replit API server base URL (deployed)
const UNLOCK_API = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : "https://6ea29a26-a374-4b67-ac7b-a6eb0c7421ee-00-5bkvdz56o8j4.kirk.replit.dev/api";

const PAYPAL_DONATE_URL =
  "https://www.paypal.com/donate/?business=7AUYVWJE39NMQ&no_recurring=0&item_name=LAN+Backup+Restore+feature+unlock&currency_code=EUR";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface FileItemProps {
  file: ExportFile;
  selected: boolean;
  downloading: boolean;
  progress: number | null;
  onToggle: () => void;
}

function FileItem({ file, selected, downloading, progress, onToggle }: FileItemProps) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      style={[
        styles.fileRow,
        {
          backgroundColor: selected ? colors.accent : colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <View style={[styles.fileCheckbox, { borderColor: selected ? colors.primary : colors.border }]}>
        {selected && <View style={[styles.fileCheckboxDot, { backgroundColor: colors.primary }]} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={1}>
          {file.name}
        </Text>
        <Text style={[styles.fileMeta, { color: colors.mutedForeground }]}>
          {formatSize(file.size)} · {formatDate(file.mtime)}
        </Text>
        {downloading && progress !== null && (
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.primary, width: `${Math.round(progress * 100)}%` as `${number}%` },
              ]}
            />
          </View>
        )}
        {downloading && progress === null && (
          <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: "flex-start", marginTop: 4 }} />
        )}
      </View>
      {downloading && progress === 1 && (
        <Feather name="check-circle" size={18} color={colors.success} />
      )}
    </TouchableOpacity>
  );
}

// ── Device ID helper ──────────────────────────────────────────────────────────
async function getOrCreateDeviceId(): Promise<string> {
  const KEY = "lb_device_id";
  const stored = await SecureStore.getItemAsync(KEY);
  if (stored) return stored;
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  await SecureStore.setItemAsync(KEY, id);
  return id;
}

// ── Paywall screen ────────────────────────────────────────────────────────────
function PaywallScreen() {
  const colors = useColors();
  const { settings, updateSetting } = useSettings();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? (49 + insets.bottom);
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Activation-code sheet
  const [showCodeSheet, setShowCodeSheet] = useState(false);
  const [activationCode, setActivationCode] = useState("");
  const [activating, setActivating] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const activateCode = async () => {
    const trimmed = activationCode.trim().toUpperCase();
    if (!trimmed) { setCodeError("Please enter your activation code"); return; }
    setActivating(true);
    setCodeError(null);
    Keyboard.dismiss();
    try {
      const deviceId = await getOrCreateDeviceId();
      const res = await fetch(`${UNLOCK_API}/unlock/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed, deviceId }),
      });
      const data = (await res.json()) as { unlocked?: boolean; unlockKey?: string; error?: string };
      if (!res.ok) {
        setCodeError(data.error ?? `Error ${res.status} — try again`);
        return;
      }
      if (!data.unlocked || !data.unlockKey) {
        setCodeError("Unexpected response — contact the app owner");
        return;
      }
      await updateSetting("restoreUnlocked", true);
      await updateSetting("restoreUnlockKey", data.unlockKey);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCodeSheet(false);
    } catch (e) {
      setCodeError(`Connection error: ${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setActivating(false);
    }
  };

  const openPayPal = () => {
    openURL(PAYPAL_DONATE_URL);
  };

  const checkPayment = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter your PayPal email address");
      return;
    }
    setChecking(true);
    setError(null);
    Keyboard.dismiss();
    try {
      const res = await fetch(`${UNLOCK_API}/unlock/check?email=${encodeURIComponent(trimmed)}`);
      if (res.status === 404) {
        setError("Payment not found yet — it may take a few minutes. Try again shortly.");
        return;
      }
      if (!res.ok) {
        setError(`Server error ${res.status} — try again later`);
        return;
      }
      const data = (await res.json()) as { unlocked: boolean; unlockKey?: string };
      if (!data.unlocked || !data.unlockKey) {
        setError("Payment not confirmed yet. Please wait a moment and try again.");
        return;
      }
      await updateSetting("restoreUnlocked", true);
      await updateSetting("restoreUnlockKey", data.unlockKey);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(`Connection error: ${String(e).replace(/^Error:\s*/, "")}`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.paywallContent, { paddingBottom: tabBarHeight + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.paywallCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={[styles.paywallIconBg, { backgroundColor: "#003087" + "22" }]}>
            <Feather name="star" size={22} color="#003087" />
          </View>
          <Text style={[styles.paywallTitle, { color: colors.foreground, textAlign: "left" }]}>
            Pro Features — One-time €5
          </Text>
        </View>

        <Text style={[styles.paywallBody, { color: colors.mutedForeground, textAlign: "left" }]}>
          A single contribution unlocks two features permanently:
        </Text>
        <View style={{ gap: 6, marginTop: 2 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
            <Feather name="download-cloud" size={15} color="#003087" style={{ marginTop: 2 }} />
            <Text style={[styles.paywallBody, { color: colors.mutedForeground, textAlign: "left", flex: 1, marginTop: 0 }]}>
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Restore</Text>
              {" "}— download files from your computer's{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>export/</Text>{" "}
              folder back to your phone.
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
            <Feather name="refresh-cw" size={15} color="#003087" style={{ marginTop: 2 }} />
            <Text style={[styles.paywallBody, { color: colors.mutedForeground, textAlign: "left", flex: 1, marginTop: 0 }]}>
              <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Server Sync</Text>
              {" "}— push files from one computer's export/ folder to one or more other computers on the same network. Phone acts as controller only.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.paywallPayBtn, { backgroundColor: "#003087" }]}
          onPress={openPayPal}
          activeOpacity={0.85}
        >
          <Feather name="external-link" size={16} color="#fff" />
          <Text style={styles.paywallPayBtnText}>Pay €5 via PayPal to unlock</Text>
        </TouchableOpacity>

        <View style={[styles.paywallCheckSection, { borderColor: colors.border }]}>
          <Text style={[styles.paywallCheckLabel, { color: colors.foreground }]}>
            After payment, enter the email you used on PayPal:
          </Text>
          <View style={[styles.paywallEmailRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.paywallEmailInput, { color: colors.foreground }]}
            />
          </View>
          {error && (
            <View style={[styles.paywallError, { backgroundColor: "#fee2e2", borderColor: "#fca5a5" }]}>
              <Feather name="alert-circle" size={14} color="#dc2626" />
              <Text style={[styles.paywallErrorText, { color: "#dc2626" }]}>{error}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.paywallCheckBtn, { backgroundColor: colors.primary }]}
            onPress={checkPayment}
            disabled={checking}
            activeOpacity={0.8}
          >
            {checking ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Feather name="unlock" size={16} color={colors.primaryForeground} />
            )}
            <Text style={[styles.paywallCheckBtnText, { color: colors.primaryForeground }]}>
              {checking ? "Checking…" : "Check payment & unlock"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Activation code ── */}
        <View style={styles.paywallCodeDividerRow}>
          <View style={[styles.paywallCodeDivider, { backgroundColor: colors.border }]} />
          <Text style={[styles.paywallCodeDividerText, { color: colors.mutedForeground }]}>or</Text>
          <View style={[styles.paywallCodeDivider, { backgroundColor: colors.border }]} />
        </View>
        <TouchableOpacity
          style={[styles.paywallCodeBtn, { borderColor: colors.border }]}
          onPress={() => { setShowCodeSheet(true); setCodeError(null); setActivationCode(""); }}
          activeOpacity={0.7}
        >
          <Feather name="key" size={15} color={colors.mutedForeground} />
          <Text style={[styles.paywallCodeBtnText, { color: colors.foreground }]}>
            I have an activation code
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>

    {/* ── Activation code sheet ── */}
    <Modal
      visible={showCodeSheet}
      transparent
      animationType="slide"
      onRequestClose={() => setShowCodeSheet(false)}
    >
      <TouchableOpacity
        style={styles.codeSheetOverlay}
        activeOpacity={1}
        onPress={() => { Keyboard.dismiss(); setShowCodeSheet(false); }}
      />
      <View style={[styles.codeSheet, { backgroundColor: colors.card }]}>
        <View style={[styles.codeSheetHandle, { backgroundColor: colors.border }]} />

        <Text style={[styles.codeSheetTitle, { color: colors.foreground }]}>
          Enter activation code
        </Text>
        <Text style={[styles.codeSheetSubtitle, { color: colors.mutedForeground }]}>
          Enter the code provided by the app owner to unlock all Pro features.
        </Text>

        <View style={[styles.codeInput, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <TextInput
            value={activationCode}
            onChangeText={(t) => setActivationCode(t.toUpperCase())}
            placeholder="LB-A3F2C81B"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            style={[styles.codeInputText, { color: colors.foreground }]}
          />
        </View>

        {codeError && (
          <View style={[styles.paywallError, { backgroundColor: "#fee2e2", borderColor: "#fca5a5" }]}>
            <Feather name="alert-circle" size={14} color="#dc2626" />
            <Text style={[styles.paywallErrorText, { color: "#dc2626" }]}>{codeError}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.paywallCheckBtn, { backgroundColor: colors.primary, opacity: activating ? 0.7 : 1 }]}
          onPress={activateCode}
          disabled={activating}
          activeOpacity={0.8}
        >
          {activating ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Feather name="unlock" size={16} color={colors.primaryForeground} />
          )}
          <Text style={[styles.paywallCheckBtnText, { color: colors.primaryForeground }]}>
            {activating ? "Activating…" : "Activate"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.codeSheetCancel}
          onPress={() => setShowCodeSheet(false)}
          activeOpacity={0.7}
        >
          <Text style={[styles.codeSheetCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
    </>
  );
}

// ── Main Restore screen ───────────────────────────────────────────────────────
export default function RestoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? (49 + insets.bottom);
  const { settings, isConfigured, updateSetting } = useSettings();

  const [files, setFiles] = useState<ExportFile[]>([]);
  const [exportDir, setExportDir] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [fileProgress, setFileProgress] = useState<Record<string, number | null>>({});
  const [downloadResults, setDownloadResults] = useState<Record<string, "ok" | "error">>({});
  const cancelRef = useRef(false);

  const load = useCallback(async () => {
    if (!isConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const ping = await pingServer(settings, settings.serverFingerprint);
      if (!ping.ok) {
        setError(ping.error ?? "Cannot reach server");
        return;
      }
      const { files: f, exportDir: dir } = await listExportFiles(settings);
      setFiles(f.sort((a, b) => b.mtime - a.mtime));
      setExportDir(dir);
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ""));
    } finally {
      setLoading(false);
    }
  }, [settings, isConfigured]);

  useEffect(() => {
    if (settings.restoreUnlocked && isConfigured) {
      load();
    }
  }, [settings.restoreUnlocked, isConfigured, load]);

  useFocusEffect(
    useCallback(() => {
      if (settings.restoreUnlocked && isConfigured) {
        load();
      }
    }, [settings.restoreUnlocked, isConfigured, load])
  );

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // On iOS, SAF doesn't exist — files go straight to the app's documentDirectory
  // (visible in Files app → On My iPhone → LAN Backup).
  const IOS_DEST = "ios-documents";

  const pickRestoreFolder = async () => {
    if (Platform.OS === "ios") {
      await updateSetting("restoreFolder", IOS_DEST);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }
    try {
      const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) return;
      await updateSetting("restoreFolder", perm.directoryUri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Folder picker", "Could not open folder picker. Please try again.");
    }
  };

  // Auto-select iOS destination on first load so the user doesn't have to tap Choose.
  useEffect(() => {
    if (Platform.OS === "ios" && !settings.restoreFolder) {
      updateSetting("restoreFolder", IOS_DEST);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDownload = async () => {
    if (selected.size === 0) {
      Alert.alert("Nothing selected", "Select at least one file to download.");
      return;
    }
    if (!settings.restoreFolder) {
      Alert.alert("No destination folder", "Choose a destination folder in the section above first.");
      return;
    }

    cancelRef.current = false;
    setDownloading(true);
    setDownloadResults({});

    const toDownload = files.filter((f) => selected.has(f.name));
    const localResults: Record<string, "ok" | "error"> = {};

    for (const file of toDownload) {
      if (cancelRef.current) break;

      setFileProgress((prev) => ({ ...prev, [file.name]: null }));

      try {
        if (Platform.OS === "ios") {
          // iOS: SAF is unavailable — download directly to documentDirectory
          // (visible in Files app → On My iPhone → LAN Backup)
          const finalUri = `${documentDirectory}${file.name}`;
          await downloadExportFile(settings, file.name, finalUri, (recv, total) => {
            if (total > 0) {
              setFileProgress((prev) => ({ ...prev, [file.name]: recv / total }));
            }
          });
        } else {
          // Android: SAF flow — pick a content:// URI, copy via base64
          const destUri = await StorageAccessFramework.createFileAsync(
            settings.restoreFolder!,
            file.name,
            "application/octet-stream"
          );

          const cacheUri = `${cacheDirectory}lb_restore_${Date.now()}_${file.name}`;

          await downloadExportFile(settings, file.name, cacheUri, (recv, total) => {
            if (total > 0) {
              setFileProgress((prev) => ({ ...prev, [file.name]: recv / total }));
            }
          });

          const base64 = await readAsStringAsync(cacheUri, {
            encoding: EncodingType.Base64,
          });
          await writeAsStringAsync(destUri, base64, {
            encoding: EncodingType.Base64,
          });
          await deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
        }

        setFileProgress((prev) => ({ ...prev, [file.name]: 1 }));
        localResults[file.name] = "ok";
        setDownloadResults((prev) => ({ ...prev, [file.name]: "ok" }));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (e) {
        setFileProgress((prev) => ({ ...prev, [file.name]: null }));
        localResults[file.name] = "error";
        setDownloadResults((prev) => ({ ...prev, [file.name]: "error" }));

        // Token mismatch — surface immediately and stop the batch
        const msg = String(e);
        if (msg.includes("401") || msg.includes("Unauthorized")) {
          setDownloading(false);
          Alert.alert(
            "Authentication failed",
            "The server rejected your auth token. Check your token in Settings.",
            [{ text: "OK" }]
          );
          return;
        }
      }
    }

    setDownloading(false);
    setSelected(new Set());
    const anySucceeded = Object.values(localResults).some((r) => r === "ok");
    Haptics.notificationAsync(
      anySucceeded
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    );
  };

  // ── Not unlocked → show paywall ──
  if (!settings.restoreUnlocked) {
    return <PaywallScreen />;
  }

  // ── Not configured → nudge ──
  if (!isConfigured) {
    return (
      <View style={[styles.centeredBox, { backgroundColor: colors.background }]}>
        <Feather name="settings" size={36} color={colors.mutedForeground} />
        <Text style={[styles.centeredTitle, { color: colors.foreground }]}>Server not configured</Text>
        <Text style={[styles.centeredBody, { color: colors.mutedForeground }]}>
          Set your server IP and auth token in Settings first.
        </Text>
      </View>
    );
  }

  const folderLabel = settings.restoreFolder
    ? settings.restoreFolder === "ios-documents"
      ? "Files app (On My iPhone)"
      : settings.restoreFolder.split("%3A").pop()?.split("%2F").pop() ?? "Selected folder"
    : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === "web" ? 67 + 16 : 16,
            paddingBottom: insets.bottom + tabBarHeight + 32,
          },
        ]}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Destination folder */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>DESTINATION FOLDER</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.folderRow}>
              <Feather name="folder" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.folderLabel, { color: colors.foreground }]}>
                  {folderLabel ?? "No folder selected"}
                </Text>
                {!folderLabel && (
                  <Text style={[styles.folderHint, { color: colors.mutedForeground }]}>
                    Files will be saved here on your phone
                  </Text>
                )}
              </View>
              {Platform.OS !== "ios" && (
                <TouchableOpacity
                  onPress={pickRestoreFolder}
                  style={[styles.folderBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.folderBtnText, { color: colors.primary }]}>
                    {folderLabel ? "Change" : "Choose"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Export dir hint */}
        {exportDir && (
          <View style={[styles.exportDirHint, { backgroundColor: colors.accent, borderColor: colors.border }]}>
            <Feather name="monitor" size={13} color={colors.accentForeground} />
            <Text style={[styles.exportDirText, { color: colors.accentForeground }]} numberOfLines={2}>
              Server export folder: {exportDir}
            </Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={[styles.errorBox, { backgroundColor: "#fee2e2", borderColor: "#fca5a5" }]}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, flex: 1 }}>
              <Feather name="alert-circle" size={14} color="#dc2626" style={{ marginTop: 2 }} />
              <Text style={[styles.errorText, { color: "#dc2626", flex: 1 }]}>{error}</Text>
            </View>
            <TouchableOpacity
              onPress={load}
              style={{ marginTop: 10, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6 }}
              activeOpacity={0.7}
            >
              <Feather name="refresh-cw" size={13} color="#dc2626" />
              <Text style={{ color: "#dc2626", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* File list */}
        {loading && files.length === 0 ? (
          <View style={styles.centeredBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.centeredBody, { color: colors.mutedForeground }]}>Loading files…</Text>
          </View>
        ) : files.length === 0 && !error ? (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="inbox" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No files to restore</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              Place files in the{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>export/</Text> folder inside your
              backup directory on your computer, then pull to refresh.
            </Text>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.listHeader}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                FILES ({files.length})
              </Text>
              {selected.size > 0 && (
                <TouchableOpacity onPress={() => setSelected(new Set())}>
                  <Text style={[styles.clearSel, { color: colors.mutedForeground }]}>Clear selection</Text>
                </TouchableOpacity>
              )}
            </View>
            {files.map((f) => (
              <FileItem
                key={f.name}
                file={f}
                selected={selected.has(f.name)}
                downloading={downloading && selected.has(f.name)}
                progress={fileProgress[f.name] ?? null}
                onToggle={() => toggleSelect(f.name)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom action bar */}
      {files.length > 0 && (
        <View
          style={[
            styles.actionBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + tabBarHeight + 8,
            },
          ]}
        >
          <View style={styles.actionBarInner}>
            <Text style={[styles.selectionCount, { color: colors.mutedForeground }]}>
              {selected.size === 0
                ? "Select files above"
                : `${selected.size} file${selected.size > 1 ? "s" : ""} selected`}
            </Text>
            <TouchableOpacity
              style={[
                styles.downloadBtn,
                {
                  backgroundColor: selected.size === 0 || downloading ? colors.muted : colors.primary,
                  opacity: selected.size === 0 || downloading ? 0.6 : 1,
                },
              ]}
              onPress={startDownload}
              disabled={selected.size === 0 || downloading}
              activeOpacity={0.8}
            >
              {downloading ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Feather name="download" size={18} color={colors.primaryForeground} />
              )}
              <Text style={[styles.downloadBtnText, { color: colors.primaryForeground }]}>
                {downloading ? "Downloading…" : "Download to phone"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 16 },
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  folderLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  folderHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  folderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  folderBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  exportDirHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  exportDirText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  errorBox: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  fileCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  fileCheckboxDot: { width: 10, height: 10, borderRadius: 5 },
  fileName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  fileMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  progressTrack: { height: 3, borderRadius: 2, marginTop: 6, overflow: "hidden" },
  progressFill: { height: 3, borderRadius: 2 },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  clearSel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  emptyState: {
    alignItems: "center",
    gap: 10,
    padding: 32,
    borderRadius: 14,
    borderWidth: 1,
  },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyBody: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  centeredBox: { alignItems: "center", gap: 12, padding: 40 },
  centeredTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  centeredBody: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  actionBar: {
    borderTopWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  actionBarInner: { flexDirection: "row", alignItems: "center", gap: 12 },
  selectionCount: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
  },
  downloadBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  // Paywall
  paywallContent: { padding: 20, paddingTop: 32 },
  paywallCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
    gap: 16,
  },
  paywallIconRow: { alignItems: "center" },
  paywallIconBg: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  paywallTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  paywallBody: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, textAlign: "center" },
  paywallFeatureList: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 12, gap: 10 },
  paywallFeatureRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  paywallFeatureText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  paywallPayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
  },
  paywallPayBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
  paywallCheckSection: { borderTopWidth: 1, paddingTop: 16, gap: 10 },
  paywallCheckLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  paywallEmailRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  paywallEmailInput: { fontSize: 15, fontFamily: "Inter_400Regular" },
  paywallError: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  paywallErrorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  paywallCheckBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  paywallCheckBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  paywallAlreadyPaid: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 },
  // Activation code entry
  paywallCodeDividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4 },
  paywallCodeDivider: { flex: 1, height: 1 },
  paywallCodeDividerText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  paywallCodeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 13, borderRadius: 12, borderWidth: 1,
  },
  paywallCodeBtnText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  // Activation code modal sheet
  codeSheetOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
  },
  codeSheet: {
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 20,
  },
  codeSheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  codeSheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  codeSheetSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, marginTop: -4 },
  codeInput: {
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  codeInputText: {
    fontSize: 22, fontFamily: "Inter_700Bold",
    letterSpacing: 2, textAlign: "center",
  },
  codeSheetCancel: { alignItems: "center", paddingVertical: 6 },
  codeSheetCancelText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
