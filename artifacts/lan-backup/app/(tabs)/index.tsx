import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { StorageAccessFramework, getInfoAsync as legacyGetInfoAsync } from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { router, useNavigation } from "expo-router";
import React, { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FileListItem } from "@/components/FileListItem";
import { ServerStatusCard } from "@/components/ServerStatusCard";
import { useSettings } from "@/context/SettingsContext";
import { type SelectedFile, useTransfer } from "@/context/TransferContext";
import { useColors } from "@/hooks/useColors";
import type { DiskInfo, PeerTransferStatus } from "@/utils/serverApi";
import {
  compressImageIfNeeded,
  getDiskInfo,
  pingServer,
  uploadFile,
  startPeerSync,
  pollPeerSync,
} from "@/utils/serverApi";

interface FileProgress {
  progress: number | null;
  done: boolean;
  error: string | null;
}

export default function BackupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? (49 + insets.bottom);
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

  // ── Sync mode state ──
  const [tabMode, setTabMode] = useState<"backup" | "sync">("backup");
  const [syncStatus, setSyncStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [syncTransferId, setSyncTransferId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<PeerTransferStatus | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const pickFromFiles = useCallback(async () => {
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

  const pickFromPhotos = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "Please allow access to your photo library in Settings.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: true,
        quality: 1,
        exif: false,
      });
      if (result.canceled) return;
      const newFiles: SelectedFile[] = result.assets.map((a) => {
        const filename = a.fileName ?? a.uri.split("/").pop() ?? "photo";
        return {
          uri: a.uri,
          name: filename,
          size: a.fileSize ?? 0,
          mimeType: a.mimeType ?? "image/jpeg",
        };
      });
      setSelectedFiles((prev) => {
        const existingUris = new Set(prev.map((f) => f.uri));
        return [...prev, ...newFiles.filter((f) => !existingUris.has(f.uri))];
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      Alert.alert("Photo Picker Error", String(e));
    }
  }, [setSelectedFiles]);

  const pickFiles = useCallback(() => {
    if (Platform.OS === "ios") {
      Alert.alert("Add files", "Where do you want to pick from?", [
        { text: "Photos & Videos", onPress: pickFromPhotos },
        { text: "Files (iCloud / On My iPhone)", onPress: pickFromFiles },
        { text: "Cancel", style: "cancel" },
      ]);
    } else {
      pickFromFiles();
    }
  }, [pickFromFiles, pickFromPhotos]);

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
      const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) return;

      setIsScanning(true);
      const newFiles: SelectedFile[] = [];
      let skipped = 0;

      const decodedRoot = decodeURIComponent(permission.directoryUri);
      const rootLastSeg = decodedRoot.split("/").pop() || "backup";
      const rootFolderName = rootLastSeg.includes(":")
        ? rootLastSeg.split(":").pop()!
        : rootLastSeg;

      const processEntry = async (uri: string, depth: number, parentRelPath: string): Promise<void> => {
        if (depth > 20) return;
        if (scanCancelledRef.current) return;

        const decoded = decodeURIComponent(uri);
        const entryName = decoded.split("/").pop() || "item";
        const currentRelPath = `${parentRelPath}/${entryName}`;

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

        try {
          const info = await legacyGetInfoAsync(uri);
          if (!info.exists) { skipped++; return; }
          const size = (info as { size?: number }).size ?? 0;
          newFiles.push({ uri, name: entryName, size, relativePath: currentRelPath });
        } catch {
          skipped++;
        }
      };

      let rootEntries: string[] = [];
      try {
        rootEntries = await StorageAccessFramework.readDirectoryAsync(permission.directoryUri);
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
        Alert.alert("Folder scanned", `${newFiles.length} file(s) found across all sub-folders.${subfolderNote}`);
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
        const { uri: uploadUri, isTemp } = settings.compressImages
          ? await compressImageIfNeeded(file, settings.imageQuality)
          : { uri: file.uri, isTemp: false };

        const fileToUpload = isTemp ? { ...file, uri: uploadUri } : file;

        await uploadFile(settings, fileToUpload, (_sent, total) => {
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

    const finalStatus: "cancelled" | "error" | "success" = cancelRef.current
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

  // ── Server Sync polling ───────────────────────────────────────────────────────
  useEffect(() => {
    if (syncStatus !== "running" || !syncTransferId) {
      if (syncPollRef.current !== null) {
        clearInterval(syncPollRef.current);
        syncPollRef.current = null;
      }
      return;
    }
    syncPollRef.current = setInterval(async () => {
      try {
        const s = await pollPeerSync(settings, syncTransferId);
        setSyncProgress(s);
        if (s.status !== "running") {
          setSyncStatus(s.status as "done" | "error");
          if (syncPollRef.current !== null) {
            clearInterval(syncPollRef.current);
            syncPollRef.current = null;
          }
          Haptics.notificationAsync(
            s.status === "done"
              ? Haptics.NotificationFeedbackType.Success
              : Haptics.NotificationFeedbackType.Error
          );
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 1500);
    return () => {
      if (syncPollRef.current !== null) {
        clearInterval(syncPollRef.current);
        syncPollRef.current = null;
      }
    };
  }, [syncStatus, syncTransferId, settings]);

  const startSync = useCallback(async () => {
    if (!isConfigured || connected !== true) return;
    setSyncError(null);
    setSyncProgress(null);
    setSyncTransferId(null);
    setSyncStatus("running");
    try {
      const destinations = settings.peerServers.map((p) => ({
        url: `http://${p.ip.trim()}:${p.port.trim()}`,
        token: p.token,
        fingerprint: p.fingerprint,
      }));
      const result = await startPeerSync(settings, destinations);
      setSyncTransferId(result.transferId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      setSyncStatus("error");
      setSyncError(String(e).replace(/^Error:\s*/, ""));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [isConfigured, connected, settings]);

  // Derived values
  const isRunning = status === "running";
  const totalBytes = selectedFiles.reduce((a, f) => a + f.size, 0);
  const canBackup = isConfigured && connected === true && selectedFiles.length > 0 && !isRunning;
  const hasPeers = settings.restoreUnlocked && settings.peerServers.length > 0;
  const canStartSync = isConfigured && connected === true && syncStatus !== "running";

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
        {/* Server status */}
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

        {/* Mode toggle — only visible when pro unlocked and peers configured */}
        {hasPeers && (
          <View style={[syncStyles.modeToggle, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[syncStyles.modeBtn, tabMode === "backup" && { backgroundColor: colors.primary }]}
              onPress={() => setTabMode("backup")}
              activeOpacity={0.8}
            >
              <Feather
                name="upload-cloud"
                size={14}
                color={tabMode === "backup" ? colors.primaryForeground : colors.mutedForeground}
              />
              <Text style={[syncStyles.modeBtnText, { color: tabMode === "backup" ? colors.primaryForeground : colors.mutedForeground }]}>
                Backup
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[syncStyles.modeBtn, tabMode === "sync" && { backgroundColor: colors.primary }]}
              onPress={() => setTabMode("sync")}
              activeOpacity={0.8}
            >
              <Feather
                name="refresh-cw"
                size={14}
                color={tabMode === "sync" ? colors.primaryForeground : colors.mutedForeground}
              />
              <Text style={[syncStyles.modeBtnText, { color: tabMode === "sync" ? colors.primaryForeground : colors.mutedForeground }]}>
                Server Sync
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Backup mode content ── */}
        {tabMode === "backup" && (
          <>
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
                Total: {selectedFiles.length} {selectedFiles.length === 1 ? "file" : "files"} —{" "}
                {(totalBytes / 1024 / 1024).toFixed(1)} MB
              </Text>
            )}
          </>
        )}

        {/* ── Sync mode content ── */}
        {tabMode === "sync" && (
          <View style={{ gap: 12 }}>
            {/* Source */}
            <View style={{ gap: 6 }}>
              <Text style={[syncStyles.sectionLabel, { color: colors.mutedForeground }]}>SOURCE</Text>
              <View style={[syncStyles.serverCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[syncStyles.roleBadge, { backgroundColor: colors.primary }]}>
                  <Feather name="upload" size={12} color={colors.primaryForeground} />
                  <Text style={[syncStyles.roleBadgeText, { color: colors.primaryForeground }]}>SOURCE</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[syncStyles.serverName, { color: colors.foreground }]}>
                    {settings.serverIp}:{settings.serverPort}
                  </Text>
                  <Text style={[syncStyles.serverSub, { color: colors.mutedForeground }]}>
                    Sends files from its <Text style={{ fontFamily: "Inter_600SemiBold" }}>export/</Text> folder
                  </Text>
                </View>
              </View>
            </View>

            {/* Destinations */}
            <View style={{ gap: 6 }}>
              <Text style={[syncStyles.sectionLabel, { color: colors.mutedForeground }]}>
                DESTINATIONS ({settings.peerServers.length})
              </Text>
              {settings.peerServers.map((peer) => {
                const peerUrl = `http://${peer.ip.trim()}:${peer.port.trim()}`;
                const peerProg = syncProgress?.progress?.[peerUrl];
                const fileList = syncProgress?.sourceFiles ?? [];
                const doneCnt = fileList.filter((f) => peerProg?.[f]?.done && !peerProg?.[f]?.error).length;
                const errCnt = fileList.filter((f) => peerProg?.[f]?.error).length;
                const totalCnt = fileList.length;
                const pct = totalCnt > 0 ? Math.round((doneCnt / totalCnt) * 100) : 0;

                return (
                  <View key={peer.id} style={[syncStyles.serverCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[syncStyles.roleBadge, { backgroundColor: colors.success }]}>
                      <Feather name="download" size={12} color="#fff" />
                      <Text style={[syncStyles.roleBadgeText, { color: "#fff" }]}>DEST</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[syncStyles.serverName, { color: colors.foreground }]}>{peer.name}</Text>
                      <Text style={[syncStyles.serverSub, { color: colors.mutedForeground }]}>
                        {peer.ip}:{peer.port}
                      </Text>
                      {syncStatus === "running" && totalCnt > 0 && (
                        <View style={{ marginTop: 6, gap: 3 }}>
                          <View style={[syncStyles.progressTrack, { backgroundColor: colors.border }]}>
                            <View
                              style={[
                                syncStyles.progressFill,
                                { backgroundColor: colors.primary, width: `${pct}%` as `${number}%` },
                              ]}
                            />
                          </View>
                          <Text style={[syncStyles.progressText, { color: colors.mutedForeground }]}>
                            {doneCnt}/{totalCnt} files{errCnt > 0 ? ` · ${errCnt} error(s)` : ""}
                          </Text>
                        </View>
                      )}
                      {(syncStatus === "done" || syncStatus === "error") && totalCnt > 0 && (
                        <Text style={[syncStyles.progressText, { color: errCnt > 0 ? "#dc2626" : colors.success, marginTop: 4 }]}>
                          {errCnt > 0 ? `${errCnt} error(s) · ${doneCnt} succeeded` : `${doneCnt} files synced ✓`}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Error banner */}
            {syncError && (
              <View style={[syncStyles.errorBox, { backgroundColor: "#fee2e2", borderColor: "#fca5a5" }]}>
                <Feather name="alert-circle" size={14} color="#dc2626" style={{ marginTop: 1 }} />
                <Text style={[syncStyles.errorText, { color: "#dc2626" }]}>{syncError}</Text>
              </View>
            )}

            {/* Done banner */}
            {syncStatus === "done" && !syncError && (
              <View style={[syncStyles.errorBox, { backgroundColor: colors.successLight ?? "#f0fdf4", borderColor: colors.success }]}>
                <Feather name="check-circle" size={14} color={colors.success} style={{ marginTop: 1 }} />
                <Text style={[syncStyles.errorText, { color: colors.success }]}>Sync complete</Text>
              </View>
            )}

            {/* Info hint when idle */}
            {syncStatus === "idle" && (
              <View style={[syncStyles.infoBox, { backgroundColor: colors.accent, borderColor: colors.border }]}>
                <Feather name="info" size={13} color={colors.accentForeground} />
                <Text style={[syncStyles.infoText, { color: colors.accentForeground }]}>
                  Files in the source server's{" "}
                  <Text style={{ fontFamily: "Inter_600SemiBold" }}>export/</Text> folder will be
                  copied to all destination servers' <Text style={{ fontFamily: "Inter_600SemiBold" }}>backup/</Text> folder.
                  The phone acts as controller — files travel directly between computers.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Footer ── */}
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
        {tabMode === "sync" ? (
          /* Sync footer */
          syncStatus === "running" ? (
            <View style={syncStyles.runningRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[syncStyles.runningText, { color: colors.foreground }]}>
                Syncing… check progress above
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.backupBtn,
                {
                  backgroundColor: canStartSync ? colors.primary : colors.secondary,
                  flex: 1,
                },
              ]}
              onPress={startSync}
              disabled={!canStartSync}
              activeOpacity={0.8}
            >
              <Feather
                name="refresh-cw"
                size={20}
                color={canStartSync ? colors.primaryForeground : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.backupBtnText,
                  { color: canStartSync ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {syncStatus === "done" ? "Sync Again" : syncStatus === "error" ? "Retry Sync" : "Start Sync"}
              </Text>
            </TouchableOpacity>
          )
        ) : !isRunning ? (
          /* Backup footer — unchanged */
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
                styles.pickBtn,
                {
                  backgroundColor: settings.compressImages ? colors.primary : colors.secondary,
                  borderColor: settings.compressImages ? colors.primary : colors.border,
                },
              ]}
              onPress={() => updateSetting("compressImages", !settings.compressImages)}
              activeOpacity={0.7}
            >
              <Feather
                name="minimize-2"
                size={20}
                color={settings.compressImages ? colors.primaryForeground : colors.mutedForeground}
              />
            </TouchableOpacity>
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

            <View style={[helpStyles.section, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={helpStyles.sectionTitleRow}>
                <Feather name="smartphone" size={18} color={colors.primary} />
                <Text style={[helpStyles.sectionTitle, { color: colors.foreground }]}>What is LAN Backup?</Text>
              </View>
              <Text style={[helpStyles.body2, { color: colors.mutedForeground }]}>
                LAN Backup works entirely over your local Wi-Fi — no cloud, no account, no USB cable.{"\n\n"}
                <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Backup</Text>
                {"  "}Transfer files and folders from your phone to your computer.{"\n"}
                <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Restore</Text>
                {"  "}Send files from your computer back to your phone. <Text style={{ fontFamily: "Inter_500Medium" }}>(Pro)</Text>{"\n"}
                <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Server Sync</Text>
                {"  "}Push files from one computer to others over LAN. <Text style={{ fontFamily: "Inter_500Medium" }}>(Pro)</Text>{"\n\n"}
                All transfers use a secret auth token and a server fingerprint that alerts you if the server identity changes unexpectedly.
              </Text>
            </View>

            <View style={[helpStyles.section, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={helpStyles.sectionTitleRow}>
                <Feather name="monitor" size={18} color={colors.primary} />
                <Text style={[helpStyles.sectionTitle, { color: colors.foreground }]}>Installing the companion server</Text>
              </View>
              <Text style={[helpStyles.body2, { color: colors.mutedForeground }]}>
                The companion server runs on your computer (macOS, Windows, or Linux). A one-command installer handles Node.js and first-time setup automatically.
              </Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}>
                <Text style={helpStyles.code}>macOS / Linux</Text> — open Terminal and run:
              </Text>
              <View style={[helpStyles.codeBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[helpStyles.codeText, { color: colors.foreground }]}>{"mkdir -p ~/LAN_backup && cd ~/LAN_backup && \\\ncurl -fsSL https://raw.githubusercontent.com/\nMarcseb/lan-backup/main/setup.sh | bash"}</Text>
              </View>
              <Text style={[helpStyles.step, { color: colors.foreground }]}>
                <Text style={helpStyles.code}>Windows</Text> — open PowerShell and run:
              </Text>
              <View style={[helpStyles.codeBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[helpStyles.codeText, { color: colors.foreground }]}>{"mkdir ~\\LAN_backup; cd ~\\LAN_backup\nInvoke-WebRequest -Uri https://raw.githubusercontent.com/Marcseb/lan-backup/main/setup.ps1 -OutFile setup.ps1\npowershell.exe -ExecutionPolicy Bypass -File setup.ps1"}</Text>
              </View>
              <Text style={[helpStyles.step, { color: colors.foreground }]}>On first launch the server asks you to choose an auth token (random or your own). <Text style={helpStyles.code}>Copy it</Text> — it is shown only once.</Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}>A desktop shortcut is created so future restarts are just a double-click.</Text>
              <Text style={[helpStyles.tip, { color: colors.mutedForeground, borderLeftColor: colors.primary }]}>
                💡 Token shown only once — find it later in the server's <Text style={{ fontFamily: "Inter_600SemiBold" }}>.env</Text> file under <Text style={{ fontFamily: "Inter_600SemiBold" }}>LB_TOKEN</Text>.
              </Text>
            </View>

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
              <Text style={[helpStyles.step, { color: colors.foreground }]}><Text style={helpStyles.code}>Auth Token</Text> — the token chosen on first server launch (shown once in the terminal). Find it later in the server's <Text style={helpStyles.code}>.env</Text> file under <Text style={helpStyles.code}>LB_TOKEN</Text>.</Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}><Text style={helpStyles.code}>Target Folder</Text> — an optional sub-folder name inside the backup directory (e.g. <Text style={helpStyles.code}>phone</Text>).</Text>
              <Text style={[helpStyles.tip, { color: colors.mutedForeground, borderLeftColor: colors.primary }]}>
                💡 Tap <Text style={{ fontFamily: "Inter_600SemiBold" }}>Test Connection</Text> after saving to verify the connection. A green status means you're ready to back up.
              </Text>
            </View>

            <View style={[helpStyles.section, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={helpStyles.sectionTitleRow}>
                <Feather name="upload" size={18} color={colors.primary} />
                <Text style={[helpStyles.sectionTitle, { color: colors.foreground }]}>Backing up files</Text>
              </View>
              <Text style={[helpStyles.body2, { color: colors.mutedForeground }]}>
                Open the <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Backup</Text> tab, tap <Text style={helpStyles.code}>+</Text> to pick files or folders, then tap <Text style={helpStyles.code}>Start Backup</Text>. A progress bar shows each file being transferred. To cancel mid-transfer, tap <Text style={helpStyles.code}>Cancel</Text>.
              </Text>
            </View>

            <View style={[helpStyles.section, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={helpStyles.sectionTitleRow}>
                <Feather name="minimize-2" size={18} color={colors.primary} />
                <Text style={[helpStyles.sectionTitle, { color: colors.foreground }]}>Image compression</Text>
              </View>
              <Text style={[helpStyles.body2, { color: colors.mutedForeground }]}>
                The compression button (⊡) in the action bar lets you reduce the size of photos before they are sent. This is useful for documents like bills or receipts where a smaller, readable file is enough.
              </Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}>Tap <Text style={helpStyles.code}>⊡</Text> to toggle compression on or off for the current backup. The button turns blue when active.</Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}>In <Text style={helpStyles.code}>Settings → Image Compression Quality</Text>, choose the preset that suits your needs:</Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}><Text style={helpStyles.code}>Low</Text> — 40% quality, max 1024 px. Ideal for bills, receipts, and text documents.</Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}><Text style={helpStyles.code}>Medium</Text> — 65% quality, max 1920 px. Good balance for everyday photos.</Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}><Text style={helpStyles.code}>High</Text> — 85% quality, max 2560 px. Near-original quality with modest size reduction.</Text>
              <Text style={[helpStyles.tip, { color: colors.mutedForeground, borderLeftColor: colors.primary }]}>
                💡 Only image files (JPG, PNG, HEIC, WebP) are compressed. Videos, PDFs, and other files are always sent as-is.
              </Text>
            </View>

            <View style={[helpStyles.section, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={helpStyles.sectionTitleRow}>
                <Feather name="corner-left-down" size={18} color={colors.primary} />
                <Text style={[helpStyles.sectionTitle, { color: colors.foreground }]}>Restore — computer → phone (Pro)</Text>
              </View>
              <Text style={[helpStyles.body2, { color: colors.mutedForeground }]}>
                Restore lets you send files from your computer back to your phone over Wi-Fi. Like Server Sync, it requires the one-time <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>€5 Pro unlock</Text> (via PayPal inside the app).
              </Text>
              <Text style={[helpStyles.sectionTitle, { color: colors.foreground, fontSize: 13, marginTop: 8 }]}>Setting up</Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}>
                Place the files you want to send inside the <Text style={helpStyles.code}>export/</Text> sub-folder of your backup directory:
              </Text>
              <View style={[helpStyles.codeBlock, { backgroundColor: colors.muted, borderColor: colors.border, marginTop: 4 }]}>
                <Text style={[helpStyles.codeText, { color: colors.foreground }]}>
                  {"~/LAN-Backup/\n├── backup/   ← phone → computer\n└── export/   ← computer → phone\n    ├── photo.jpg\n    └── document.pdf"}
                </Text>
              </View>
              <Text style={[helpStyles.tip, { color: colors.mutedForeground, borderLeftColor: colors.primary }]}>
                💡 Any file type is supported — photos, documents, videos, archives.
              </Text>
            </View>

            <View style={[helpStyles.section, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={helpStyles.sectionTitleRow}>
                <Feather name="refresh-cw" size={18} color={colors.primary} />
                <Text style={[helpStyles.sectionTitle, { color: colors.foreground }]}>Server Sync (Pro)</Text>
              </View>
              <Text style={[helpStyles.body2, { color: colors.mutedForeground }]}>
                Server Sync lets you push files from one computer to one or more other computers on the same network — all without the phone carrying any data.
              </Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}>1. Unlock Pro features via the Restore tab (one-time €5).</Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}>2. In Settings → Peer Servers, add the destination computer(s).</Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}>3. Place files you want to sync in the source computer's <Text style={helpStyles.code}>export/</Text> folder.</Text>
              <Text style={[helpStyles.step, { color: colors.foreground }]}>4. On the Backup tab, tap <Text style={helpStyles.code}>Server Sync</Text> then <Text style={helpStyles.code}>Start Sync</Text>.</Text>
              <Text style={[helpStyles.tip, { color: colors.mutedForeground, borderLeftColor: colors.primary }]}>
                💡 Files land in the destination server's <Text style={{ fontFamily: "Inter_600SemiBold" }}>backup/</Text> folder. The phone is only a controller — no data passes through it.
              </Text>
            </View>

            <View style={[helpStyles.section, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={helpStyles.sectionTitleRow}>
                <Feather name="download" size={18} color={colors.primary} />
                <Text style={[helpStyles.sectionTitle, { color: colors.foreground }]}>Get the companion server</Text>
              </View>
              <Text style={[helpStyles.body2, { color: colors.mutedForeground }]}>
                The setup scripts (<Text style={helpStyles.code}>setup.sh</Text> / <Text style={helpStyles.code}>setup.ps1</Text>) and the latest <Text style={helpStyles.code}>server.js</Text> are on GitHub. Open the link on your computer to follow the install instructions.
              </Text>
              <TouchableOpacity
                style={[helpStyles.linkBtn, { backgroundColor: colors.primary }]}
                onPress={() => Linking.openURL("https://github.com/Marcseb/lan-backup/releases/latest")}
                activeOpacity={0.8}
              >
                <Feather name="github" size={16} color={colors.primaryForeground} />
                <Text style={[helpStyles.linkBtnText, { color: colors.primaryForeground }]}>
                  Download latest release
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[helpStyles.section, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={helpStyles.sectionTitleRow}>
                <Feather name="share-2" size={18} color={colors.primary} />
                <Text style={[helpStyles.sectionTitle, { color: colors.foreground }]}>Share this app</Text>
              </View>
              <Text style={[helpStyles.body2, { color: colors.mutedForeground }]}>
                To use LAN Backup, <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Expo Go</Text> must be installed first (free on App Store and Google Play). Then open this link in the phone's browser — it will launch the app in Expo Go automatically:
              </Text>
              <TouchableOpacity
                style={[helpStyles.linkBtn, { backgroundColor: colors.primary }]}
                onPress={() => Linking.openURL("https://local-file-sync-marcsebastienb.replit.app")}
                activeOpacity={0.8}
              >
                <Feather name="external-link" size={16} color={colors.primaryForeground} />
                <Text style={[helpStyles.linkBtnText, { color: colors.primaryForeground }]}>
                  local-file-sync-marcsebastienb.replit.app
                </Text>
              </TouchableOpacity>
              <Text style={[helpStyles.tip, { color: colors.mutedForeground, borderLeftColor: colors.primary }]}>
                💡 The page shows a QR code and store links if Expo Go isn't detected automatically. After opening, tap <Text style={{ fontFamily: "Inter_600SemiBold" }}>Add to Home Screen</Text> in the browser menu for a quick-access shortcut next time.
              </Text>
            </View>

            <View style={[helpStyles.section, { backgroundColor: "#fff7ed", borderColor: "#fed7aa" }]}>
              <View style={helpStyles.sectionTitleRow}>
                <Text style={{ fontSize: 18 }}>☕</Text>
                <Text style={[helpStyles.sectionTitle, { color: "#9a3412" }]}>Support this project</Text>
              </View>
              <Text style={[helpStyles.body2, { color: "#c2410c" }]}>
                LAN Backup is free and open source. If it saves you time, a contribution is always appreciated!
              </Text>
              <TouchableOpacity
                style={[helpStyles.linkBtn, { backgroundColor: "#f97316" }]}
                onPress={() => Linking.openURL("https://buymeacoffee.com/marcsebastien")}
                activeOpacity={0.8}
              >
                <Text style={[helpStyles.linkBtnText, { color: "#fff" }]}>☕  Buy me a coffee</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[helpStyles.linkBtn, { backgroundColor: "#003087", marginTop: 8 }]}
                onPress={() => Linking.openURL("https://www.paypal.com/donate/?business=7AUYVWJE39NMQ&no_recurring=0&item_name=Building+open+source+apps+that+are+secure%2C+practical%2C+and+keep+your+data+local%E2%80%94not+in+the+cloud.&currency_code=EUR")}
                activeOpacity={0.8}
              >
                <Text style={[helpStyles.linkBtnText, { color: "#fff" }]}>💙  Donate via PayPal</Text>
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

const syncStyles = StyleSheet.create({
  modeToggle: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  modeBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  serverCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  serverName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  serverSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  errorBox: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  infoBox: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  runningRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 50,
    gap: 10,
  },
  runningText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});

const helpStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  body: { padding: 20, gap: 16 },
  section: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  body2: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  step: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  tip: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 4,
  },
  code: {
    fontFamily: "Inter_600SemiBold",
  },
  codeBlock: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  codeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  linkBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
