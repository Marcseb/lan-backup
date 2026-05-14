import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { StorageAccessFramework, getInfoAsync as legacyGetInfoAsync } from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { router, useNavigation } from "expo-router";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FileListItem } from "@/components/FileListItem";
import { ServerStatusCard } from "@/components/ServerStatusCard";
import { useSettings } from "@/context/SettingsContext";
import { type SelectedFile, useTransfer } from "@/context/TransferContext";
import { useColors } from "@/hooks/useColors";
import type { DiskInfo } from "@/utils/serverApi";
import { getDiskInfo, pingServer, uploadFile } from "@/utils/serverApi";

interface FileProgress {
  progress: number | null;
  done: boolean;
  error: string | null;
}

export default function BackupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { settings, isConfigured, updateSetting } = useSettings();
  const {
    selectedFiles,
    setSelectedFiles,
    removeFile,
    status,
    setStatus,
    setProgress,
    addHistoryRecord,
  } = useTransfer();

  const [connected, setConnected] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [diskInfo, setDiskInfo] = useState<DiskInfo | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fingerprintMismatch, setFingerprintMismatch] = useState(false);
  const [fileProgress, setFileProgress] = useState<Record<string, FileProgress>>({});
  const [isScanning, setIsScanning] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const cancelRef = useRef(false);
  const scanCancelledRef = useRef(false);

  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setShowHelp(true)}
          style={{ marginRight: 16, padding: 4 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="help-circle" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.mutedForeground]);

  const checkServer = useCallback(async () => {
    if (!isConfigured) return;
    setChecking(true);
    setServerError(null);
    setFingerprintMismatch(false);

    try {
      const ping = await pingServer(settings, settings.serverFingerprint);

      if (ping.fingerprintMismatch) {
        setConnected(false);
        setFingerprintMismatch(true);
        setServerError(ping.error ?? null);
        return;
      }

      if (!ping.ok) {
        setConnected(false);
        setServerError(ping.error ?? "Cannot reach server");
        return;
      }

      if (ping.id && !settings.serverFingerprint) {
        await updateSetting("serverFingerprint", ping.id);
      }

      const disk = await getDiskInfo(settings);
      setDiskInfo(disk);
      setConnected(true);
    } catch (e) {
      setConnected(false);
      setServerError(String(e));
    } finally {
      setChecking(false);
    }
  }, [settings, isConfigured, updateSetting]);

  useEffect(() => {
    if (isConfigured) {
      checkServer();
    }
  }, [isConfigured, settings.serverIp, settings.serverPort, settings.authToken]);

  const pickFiles = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: "*/*",
      });
      if (result.canceled) return;
      if (!result.assets || result.assets.length === 0) return;
      const newFiles: SelectedFile[] = result.assets.map((a) => ({
        uri: a.uri,
        name: a.name,
        size: a.size ?? 0,
        mimeType: a.mimeType,
      }));
      setSelectedFiles((prev) => {
        const existingUris = new Set(prev.map((f) => f.uri));
        return [...prev, ...newFiles.filter((f) => !existingUris.has(f.uri))];
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      Alert.alert("File Picker Error", String(e));
    }
  }, [setSelectedFiles]);

  const pickFolder = useCallback(async () => {
    if (Platform.OS === "ios") {
      Alert.alert(
        "Not supported on iOS",
        "iOS does not allow apps to select entire folders. Use the file picker (+ button) to select multiple files individually."
      );
      return;
    }
    if (Platform.OS === "web") {
      Alert.alert("Not supported", "Folder selection is not available on web.");
      return;
    }
    scanCancelledRef.current = false;
    try {
      const permission =
        await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) return;

      setIsScanning(true);
      const newFiles: SelectedFile[] = [];
      let skipped = 0;

      // Derive the selected folder's display name from the granted tree URI.
      // Tree URIs look like: .../tree/primary%3ADCIM%2FCamera
      // Decoded last segment may be "primary:DCIM/Camera" (nested) or "primary:Camera" (root-level).
      const decodedRoot = decodeURIComponent(permission.directoryUri);
      const rootLastSeg = decodedRoot.split("/").pop() || "backup";
      const rootFolderName = rootLastSeg.includes(":")
        ? rootLastSeg.split(":").pop()!
        : rootLastSeg;

      // Recursively collect all files under a SAF directory URI.
      //
      // legacyGetInfoAsync.isDirectory is unreliable for SAF document URIs — it
      // often returns false even for real directories.  Instead we probe each
      // entry by attempting readDirectoryAsync: success → directory (recurse);
      // exception → file (add to list).
      //
      // parentRelPath is the relative path of the PARENT directory, e.g. "Camera/SubFolder".
      // Each file gets relativePath = "Camera/SubFolder/photo.jpg" which the server
      // uses to recreate the exact folder structure.
      const processEntry = async (
        uri: string,
        depth: number,
        parentRelPath: string
      ): Promise<void> => {
        if (depth > 20) return; // guard against extremely deep trees
        if (scanCancelledRef.current) return;

        const decoded = decodeURIComponent(uri);
        const entryName = decoded.split("/").pop() || "item";
        const currentRelPath = `${parentRelPath}/${entryName}`;

        // --- try as directory ---
        let children: string[] | null = null;
        try {
          children = await StorageAccessFramework.readDirectoryAsync(uri);
        } catch {
          children = null;
        }

        if (children !== null) {
          for (const child of children) {
            await processEntry(child, depth + 1, currentRelPath);
          }
          return;
        }

        // --- treat as file ---
        try {
          const info = await legacyGetInfoAsync(uri);
          if (!info.exists) {
            skipped++;
            return;
          }
          const size = (info as { size?: number }).size ?? 0;
          newFiles.push({ uri, name: entryName, size, relativePath: currentRelPath });
        } catch {
          skipped++;
        }
      };

      // Seed the traversal from the granted root
      let rootEntries: string[] = [];
      try {
        rootEntries = await StorageAccessFramework.readDirectoryAsync(
          permission.directoryUri
        );
      } catch (e) {
        Alert.alert("Folder Error", `Could not read folder: ${String(e)}`);
        return;
      }

      for (const entry of rootEntries) {
        await processEntry(entry, 0, rootFolderName);
      }

      if (newFiles.length === 0) {
        Alert.alert(
          "No readable files",
          skipped > 0
            ? `Scanned ${skipped} item(s) but none were readable files.`
            : "The selected folder (and all sub-folders) appear to be empty."
        );
        return;
      }

      setSelectedFiles((prev) => {
        const existingUris = new Set(prev.map((f) => f.uri));
        return [...prev, ...newFiles.filter((f) => !existingUris.has(f.uri))];
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const subfolderNote = skipped > 0 ? ` (${skipped} item(s) skipped)` : "";
      if (newFiles.length > 0) {
        Alert.alert(
          "Folder scanned",
          `${newFiles.length} file(s) found across all sub-folders.${subfolderNote}`
        );
      }
    } catch (e) {
      if (!scanCancelledRef.current) {
        Alert.alert("Folder Error", String(e));
      }
    } finally {
      setIsScanning(false);
      scanCancelledRef.current = false;
    }
  }, [setSelectedFiles]);

  const startBackup = useCallback(async () => {
    if (!isConfigured || !connected || selectedFiles.length === 0) return;
    if (status === "running") return;

    cancelRef.current = false;
    setStatus("running");

    const initProgress: Record<string, FileProgress> = {};
    for (const f of selectedFiles) {
      initProgress[f.uri] = { progress: 0, done: false, error: null };
    }
    setFileProgress(initProgress);

    let totalBytes = selectedFiles.reduce((a, f) => a + f.size, 0);
    let bytesSent = 0;
    const successFiles: SelectedFile[] = [];
    const failedFiles: { file: SelectedFile; error: string }[] = [];

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    for (let i = 0; i < selectedFiles.length; i++) {
      if (cancelRef.current) break;
      const file = selectedFiles[i];

      setProgress({
        currentFile: file.name,
        currentIndex: i + 1,
        totalFiles: selectedFiles.length,
        bytesSent,
        totalBytes,
      });

      try {
        await uploadFile(settings, file, (_sent, total) => {
          setFileProgress((prev) => ({
            ...prev,
            [file.uri]: { progress: _sent / total, done: false, error: null },
          }));
        });
        bytesSent += file.size;
        successFiles.push(file);
        setFileProgress((prev) => ({
          ...prev,
          [file.uri]: { progress: 1, done: true, error: null },
        }));
      } catch (e) {
        const errMsg = String(e).replace(/^Error:\s*/, "");
        failedFiles.push({ file, error: errMsg });
        setFileProgress((prev) => ({
          ...prev,
          [file.uri]: { progress: null, done: false, error: errMsg },
        }));
      }
    }

    const finalStatus = cancelRef.current
      ? "cancelled"
      : failedFiles.length > 0 && successFiles.length === 0
      ? "error"
      : "success";

    const historyRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      files: selectedFiles.map((f) => ({ name: f.name, size: f.size })),
      status: finalStatus,
      errorMessage:
        failedFiles.length > 0
          ? `${failedFiles.length} file(s) failed: ${failedFiles[0].error}`
          : undefined,
      serverIp: settings.serverIp,
      targetFolder: settings.targetFolder,
      bytesSent,
      totalBytes,
    };

    await addHistoryRecord(historyRecord);
    setStatus(finalStatus);
    setProgress(null);
    Haptics.notificationAsync(
      finalStatus === "success"
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    );

    setTimeout(() => {
      setStatus("idle");
      if (finalStatus === "success") {
        setSelectedFiles([]);
        setFileProgress({});
      } else {
        setSelectedFiles(failedFiles.map((x) => x.file));
      }
    }, 2000);
  }, [isConfigured, connected, selectedFiles, status, settings, addHistoryRecord, setStatus, setProgress, setSelectedFiles]);

  const cancelTransfer = useCallback(() => {
    cancelRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, []);

  const isRunning = status === "running";
  const totalBytes = selectedFiles.reduce((a, f) => a + f.size, 0);
  const canBackup = isConfigured && connected === true && selectedFiles.length > 0 && !isRunning;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Platform.OS === "web" ? 67 + 16 : 16,
            paddingBottom: tabBarHeight + 80,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {!isConfigured ? (
          <View style={[styles.setupCard, { backgroundColor: colors.accent, borderColor: colors.accentForeground }]}>
            <Feather name="settings" size={24} color={colors.accentForeground} />
            <Text style={[styles.setupTitle, { color: colors.accentForeground }]}>
              Set up your server
            </Text>
            <Text style={[styles.setupBody, { color: colors.accentForeground }]}>
              Configure your server IP and auth token in Settings to get started.
            </Text>
            <TouchableOpacity
              style={[styles.setupBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.navigate("/(tabs)/settings")}
            >
              <Text style={[styles.setupBtnText, { color: colors.primaryForeground }]}>
                Go to Settings
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ServerStatusCard
            serverIp={`${settings.serverIp}:${settings.serverPort}`}
            connected={connected}
            checking={checking}
            diskInfo={diskInfo}
            error={serverError}
            onRefresh={checkServer}
            fingerprintMismatch={fingerprintMismatch}
          />
        )}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Selected Files
          </Text>
          {selectedFiles.length > 0 && !isRunning && (
            <TouchableOpacity
              onPress={() => {
                setSelectedFiles([]);
                setFileProgress({});
              }}
            >
              <Text style={[styles.clearText, { color: colors.destructive }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {selectedFiles.length === 0 ? (
          <View style={[styles.emptyFiles, { borderColor: colors.border }]}>
            <Feather name="inbox" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No files selected
            </Text>
          </View>
        ) : (
          <View style={styles.fileList}>
            {selectedFiles.map((file) => {
              const fp = fileProgress[file.uri];
              return (
                <FileListItem
                  key={file.uri}
                  file={file}
                  onRemove={!isRunning ? () => removeFile(file.uri) : undefined}
                  progress={fp?.progress ?? null}
                  done={fp?.done ?? false}
                  error={fp?.error ?? null}
                />
              );
            })}
          </View>
        )}

        {selectedFiles.length > 0 && (
          <Text style={[styles.totalSize, { color: colors.mutedForeground }]}>
            Total: {selectedFiles.length} {selectedFiles.length === 1 ? "file" : "files"} — {" "}
            {(totalBytes / 1024 / 1024).toFixed(1)} MB
          </Text>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            bottom: tabBarHeight,
            paddingBottom: 8,
          },
        ]}
      >
        {!isRunning ? (
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[styles.pickBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              onPress={pickFiles}
              activeOpacity={0.7}
            >
              <Feather name="plus" size={20} color={colors.primary} />
            </TouchableOpacity>
            {isScanning ? (
              <TouchableOpacity
                style={[styles.pickBtn, { backgroundColor: "#ef4444", borderColor: "#ef4444" }]}
                onPress={() => { scanCancelledRef.current = true; }}
                activeOpacity={0.7}
              >
                <Feather name="x" size={20} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.pickBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                onPress={pickFolder}
                activeOpacity={0.7}
              >
                <Feather name="folder" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.backupBtn,
                {
                  backgroundColor: canBackup ? colors.primary : colors.secondary,
                  flex: 1,
                },
              ]}
              onPress={startBackup}
              disabled={!canBackup}
              activeOpacity={0.8}
            >
              <Feather
                name="upload-cloud"
                size={20}
                color={canBackup ? colors.primaryForeground : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.backupBtnText,
                  { color: canBackup ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {status === "success"
                  ? "Done!"
                  : status === "error"
                  ? "Failed"
                  : "Start Backup"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.cancelBtn, { backgroundColor: colors.destructive }]}
            onPress={cancelTransfer}
            activeOpacity={0.8}
          >
            <Feather name="x" size={20} color={colors.destructiveForeground} />
            <Text style={[styles.backupBtnText, { color: colors.destructiveForeground }]}>
              Cancel Transfer
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Help Modal ── */}
      <Modal
        visible={showHelp}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowHelp(false)}
      >
        <View style={[helpStyles.container, { backgroundColor: colors.background }]}>
          <View style={[helpStyles.header, { borderBottomColor: colors.border }]}>
            <Text style={[helpStyles.title, { color: colors.foreground }]}>Help</Text>
            <TouchableOpacity onPress={() => setShowHelp(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={helpStyles.body} showsVerticalScrollIndicator={false}>

            {/* What is LAN Backup */}
            <View style={[helpStyles.section, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={helpStyles.sectionTitleRow}>
                <Feather name="smartphone" size={18} color={colors.primary} />
                <Text style={[helpStyles.sectionTitle, { color: colors.foreground }]}>What is LAN Backup?</Text>
              </View>
              <Text style={[helpStyles.body2, { color: colors.mutedForeground }]}>
                LAN Backup lets you transfer files and folders from your phone to a computer on the same Wi-Fi network — no cloud, no account, no USB cable required.{"\n\n"}
                Files travel directly over your local network using a small companion server that runs on your computer. All transfers are protected by a secret auth token and a server fingerprint that detects unexpected server changes.
              </Text>
            </View>

            {/* Installation */}
            <View style={[helpStyles.section, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={helpStyles.sectionTitleRow}>
                <Feather name="monitor" size={18} color={colors.primary} />
                <Text style={[helpStyles.sectionTitle, { color: colors.foreground }]}>Installing the companion server</Text>
              </View>
              <Text style={[helpStyles.body2, { color: colors.mutedForeground }]}>
                The companion server is a single JavaScript file that runs on your computer (macOS, Windows, or Linux). Node.js 18 or later is required.
              </Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}>1. Copy <Text style={helpStyles.code}>server.js</Text> from the project's <Text style={helpStyles.code}>companion-server/</Text> folder to your computer.</Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}>2. Open a terminal in the same folder and run:</Text>
              <View style={[helpStyles.codeBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[helpStyles.codeText, { color: colors.foreground }]}>{"# macOS / Linux\nLB_TOKEN=your_secret node server.js\n\n# Windows\nset LB_TOKEN=your_secret\nnode server.js"}</Text>
              </View>
              <Text style={[helpStyles.step, { color: colors.foreground }]}>3. The server listens on port <Text style={helpStyles.code}>7823</Text> by default. Files are saved to <Text style={helpStyles.code}>~/LAN-Backup</Text>.</Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}>4. Keep the terminal open while doing backups.</Text>
            </View>

            {/* Settings */}
            <View style={[helpStyles.section, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={helpStyles.sectionTitleRow}>
                <Feather name="settings" size={18} color={colors.primary} />
                <Text style={[helpStyles.sectionTitle, { color: colors.foreground }]}>Configuring the app</Text>
              </View>
              <Text style={[helpStyles.body2, { color: colors.mutedForeground }]}>
                Open the <Text style={{ fontFamily: "Inter_600SemiBold" }}>Settings</Text> tab and fill in the following fields:
              </Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}><Text style={helpStyles.code}>Server IP</Text> — tap <Text style={helpStyles.code}>Detect computers on this network</Text> to scan your Wi-Fi and pick your computer automatically. Or enter its IP address manually (e.g. <Text style={helpStyles.code}>192.168.1.10</Text>).</Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}><Text style={helpStyles.code}>Port</Text> — leave at <Text style={helpStyles.code}>7823</Text> unless you changed it with <Text style={helpStyles.code}>LB_PORT</Text>.</Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}><Text style={helpStyles.code}>Auth Token</Text> — the exact same value you used for <Text style={helpStyles.code}>LB_TOKEN</Text> when starting the server.</Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}><Text style={helpStyles.code}>Target Folder</Text> — an optional sub-folder name inside the backup directory (e.g. <Text style={helpStyles.code}>phone</Text>).</Text>
              <Text style={[helpStyles.tip, { color: colors.mutedForeground, borderLeftColor: colors.primary }]}>
                💡 Tap <Text style={{ fontFamily: "Inter_600SemiBold" }}>Test Connection</Text> after saving to verify the connection. A green status means you're ready to back up.
              </Text>
            </View>

            {/* Download & Support */}
            <View style={[helpStyles.section, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={helpStyles.sectionTitleRow}>
                <Feather name="download" size={18} color={colors.primary} />
                <Text style={[helpStyles.sectionTitle, { color: colors.foreground }]}>Get the companion server</Text>
              </View>
              <Text style={[helpStyles.body2, { color: colors.mutedForeground }]}>
                The latest version of <Text style={helpStyles.code}>server.js</Text> is available on GitHub. Open the link on your computer to download it.
              </Text>
              <TouchableOpacity
                style={[helpStyles.linkBtn, { backgroundColor: colors.primary }]}
                onPress={() => Linking.openURL("https://github.com/Marcseb/lan-backup")}
                activeOpacity={0.8}
              >
                <Feather name="github" size={16} color={colors.primaryForeground} />
                <Text style={[helpStyles.linkBtnText, { color: colors.primaryForeground }]}>
                  github.com/Marcseb/lan-backup
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[helpStyles.section, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
              <View style={helpStyles.sectionTitleRow}>
                <Text style={{ fontSize: 18 }}>☕</Text>
                <Text style={[helpStyles.sectionTitle, { color: "#9a3412" }]}>Support this project</Text>
              </View>
              <Text style={[helpStyles.body2, { color: "#c2410c" }]}>
                LAN Backup is free and open source. If it saves you time, a coffee is always appreciated!
              </Text>
              <TouchableOpacity
                style={[helpStyles.linkBtn, { backgroundColor: "#f97316" }]}
                onPress={() => Linking.openURL("https://buymeacoffee.com/marcsebastien")}
                activeOpacity={0.8}
              >
                <Text style={[helpStyles.linkBtnText, { color: "#fff" }]}>☕  Buy me a coffee</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    gap: 16,
  },
  setupCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    gap: 10,
  },
  setupTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  setupBody: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  setupBtn: {
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 4,
  },
  setupBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  clearText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  emptyFiles: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 40,
    alignItems: "center",
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  fileList: { gap: 8 },
  totalSize: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 0,
  },
  footerRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  pickBtn: {
    width: 50,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backupBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 50,
    borderRadius: 14,
    gap: 8,
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 50,
    borderRadius: 14,
    gap: 8,
  },
  backupBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});

const helpStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  body: {
    padding: 16,
    gap: 16,
  },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    flexShrink: 1,
  },
  body2: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  step: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  code: {
    fontFamily: "monospace",
    fontSize: 13,
  },
  codeBlock: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginVertical: 2,
  },
  codeText: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
  },
  tip: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginTop: 4,
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  linkBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
