import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Network from "expo-network";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { discoverServers, getDiskInfo, pingServer, type DiscoveredServer } from "@/utils/serverApi";

function SettingsField({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  keyboardType,
  autoCapitalize,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  keyboardType?: "default" | "numeric" | "url" | "decimal-pad";
  autoCapitalize?: "none" | "sentences";
  hint?: string;
}) {
  const colors = useColors();
  const [showSecure, setShowSecure] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
      <View
        style={[
          styles.inputWrapper,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry={secure && !showSecure}
          keyboardType={keyboardType ?? "default"}
          autoCapitalize={autoCapitalize ?? "none"}
          autoCorrect={false}
          style={[styles.input, { color: colors.foreground }]}
        />
        {secure && (
          <TouchableOpacity onPress={() => setShowSecure((s) => !s)} hitSlop={8}>
            <Feather
              name={showSecure ? "eye-off" : "eye"}
              size={18}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        )}
      </View>
      {hint && (
        <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>{hint}</Text>
      )}
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings, saveAllSettings, clearFingerprint, updateSetting } = useSettings();

  const [localIp, setLocalIp] = useState(settings.serverIp);
  const [localPort, setLocalPort] = useState(settings.serverPort);
  const [localToken, setLocalToken] = useState(settings.authToken);
  const [localFolder, setLocalFolder] = useState(settings.targetFolder);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [showDiscovery, setShowDiscovery] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [discovered, setDiscovered] = useState<DiscoveredServer[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);

  const hasUnsaved =
    localIp !== settings.serverIp ||
    localPort !== settings.serverPort ||
    localToken !== settings.authToken ||
    localFolder !== settings.targetFolder;

  const save = async () => {
    await saveAllSettings({
      ...settings,
      serverIp: localIp.trim(),
      serverPort: localPort.trim() || "7823",
      authToken: localToken.trim(),
      targetFolder: localFolder.trim() || "backup",
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTestResult(null);
  };

  const testConnection = async () => {
    if (!localIp.trim() || !localToken.trim()) {
      setTestResult({ ok: false, message: "IP address and auth token are required" });
      return;
    }
    setTesting(true);
    setTestResult(null);

    const tempSettings = {
      ...settings,
      serverIp: localIp.trim(),
      serverPort: localPort.trim() || "7823",
      authToken: localToken.trim(),
    };

    try {
      const ping = await pingServer(tempSettings, null);
      if (!ping.ok) {
        setTestResult({ ok: false, message: ping.error ?? "Cannot reach server" });
        return;
      }
      const disk = await getDiskInfo(tempSettings);
      setTestResult({
        ok: true,
        message: `Connected — ${(disk.free / 1e9).toFixed(1)} GB free (${disk.usagePercent.toFixed(0)}% used)`,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setTestResult({ ok: false, message: String(e).replace(/^Error:\s*/, "") });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setTesting(false);
    }
  };

  const startScan = async () => {
    setScanError(null);
    setDiscovered([]);
    setScanProgress(0);
    setScanning(true);

    let ip: string;
    try {
      ip = await Network.getIpAddressAsync();
    } catch {
      setScanError("Could not read your phone's IP address. Make sure you are on a Wi-Fi network.");
      setScanning(false);
      return;
    }

    const parts = ip.split(".");
    if (parts.length !== 4) {
      setScanError(`Unexpected IP format: ${ip}`);
      setScanning(false);
      return;
    }
    const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.`;
    const port = localPort.trim() || "7823";

    const ctrl = new AbortController();
    scanAbortRef.current = ctrl;

    try {
      await discoverServers(
        subnet,
        port,
        (scanned, total, found) => {
          setScanProgress(Math.round((scanned / total) * 100));
          setDiscovered(found);
        },
        ctrl.signal
      );
    } finally {
      setScanning(false);
      scanAbortRef.current = null;
    }
  };

  const stopScan = () => {
    scanAbortRef.current?.abort();
  };

  const openDiscovery = () => {
    setShowDiscovery(true);
    startScan();
  };

  const closeDiscovery = () => {
    stopScan();
    setShowDiscovery(false);
  };

  const selectServer = (server: DiscoveredServer) => {
    setLocalIp(server.ip);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeDiscovery();
  };

  const handleClearFingerprint = () => {
    Alert.alert(
      "Clear Trusted Server",
      "This will remove the saved server fingerprint. The next connection will re-trust the server automatically. Do this only if the server is genuinely different.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            clearFingerprint();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Platform.OS === "web" ? 67 + 16 : 16,
          paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 32,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* ── Discovery Modal ── */}
      <Modal
        visible={showDiscovery}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeDiscovery}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Available computers
            </Text>
            <TouchableOpacity onPress={closeDiscovery} hitSlop={12}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Progress bar */}
          {scanning && (
            <View style={styles.progressContainer}>
              <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { backgroundColor: colors.primary, width: `${scanProgress}%` },
                  ]}
                />
              </View>
              <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
                Scanning… {scanProgress}%
              </Text>
            </View>
          )}

          {scanError && (
            <View style={[styles.scanError, { backgroundColor: "#fee2e2", borderColor: colors.destructive }]}>
              <Feather name="alert-circle" size={14} color={colors.destructive} />
              <Text style={[styles.scanErrorText, { color: colors.destructive }]}>{scanError}</Text>
            </View>
          )}

          {/* Results */}
          <ScrollView style={styles.discoveryList} showsVerticalScrollIndicator={false}>
            {discovered.length === 0 && !scanning && !scanError && (
              <View style={styles.emptyState}>
                <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No LAN Backup servers found on this network.{"\n"}
                  Make sure the companion server is running on your computer.
                </Text>
              </View>
            )}
            {discovered.length === 0 && scanning && (
              <View style={styles.emptyState}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  Looking for servers…
                </Text>
              </View>
            )}
            {discovered.map((server) => {
              const displayName =
                server.hostname && server.hostname !== server.ip
                  ? server.hostname
                  : "LAN Backup Server";
              return (
                <TouchableOpacity
                  key={server.ip}
                  style={[styles.serverRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => selectServer(server)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.serverIcon, { backgroundColor: colors.accent }]}>
                    <Feather name="monitor" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.serverName, { color: colors.foreground }]}>
                      {displayName}
                    </Text>
                    <Text style={[styles.serverIp, { color: colors.mutedForeground }]}>
                      {server.ip}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {!scanning && (
            <TouchableOpacity
              style={[styles.rescanBtn, { borderColor: colors.border, backgroundColor: colors.secondary }]}
              onPress={startScan}
              activeOpacity={0.7}
            >
              <Feather name="refresh-cw" size={16} color={colors.primary} />
              <Text style={[styles.rescanBtnText, { color: colors.primary }]}>Scan again</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          SERVER CONNECTION
        </Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsField
            label="Server IP Address"
            value={localIp}
            onChangeText={setLocalIp}
            placeholder="192.168.1.100"
            keyboardType="url"
          />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <SettingsField
            label="Port"
            value={localPort}
            onChangeText={setLocalPort}
            placeholder="7823"
            keyboardType="numeric"
            hint="Default: 7823"
          />
        </View>
        <TouchableOpacity
          style={[styles.scanBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          onPress={openDiscovery}
          activeOpacity={0.7}
        >
          <Feather name="radio" size={16} color={colors.primary} />
          <Text style={[styles.scanBtnText, { color: colors.primary }]}>
            Detect computers on this network
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          AUTHENTICATION
        </Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsField
            label="Auth Token"
            value={localToken}
            onChangeText={setLocalToken}
            placeholder="Enter your secret token"
            secure
            hint="Must match the token set in the companion server"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          BACKUP DESTINATION
        </Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingsField
            label="Target Folder"
            value={localFolder}
            onChangeText={setLocalFolder}
            placeholder="backup"
            hint="Folder name created inside the server's backup directory"
          />
        </View>
      </View>

      {testResult && (
        <View
          style={[
            styles.testResult,
            {
              backgroundColor: testResult.ok ? colors.successLight : "#fee2e2",
              borderColor: testResult.ok ? colors.success : colors.destructive,
            },
          ]}
        >
          <Feather
            name={testResult.ok ? "check-circle" : "alert-circle"}
            size={16}
            color={testResult.ok ? colors.success : colors.destructive}
          />
          <Text
            style={[
              styles.testResultText,
              { color: testResult.ok ? colors.success : colors.destructive },
            ]}
          >
            {testResult.message}
          </Text>
        </View>
      )}

      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.testBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          onPress={testConnection}
          disabled={testing}
          activeOpacity={0.7}
        >
          <Feather
            name={testing ? "loader" : "wifi"}
            size={18}
            color={colors.primary}
          />
          <Text style={[styles.testBtnText, { color: colors.primary }]}>
            {testing ? "Testing..." : "Test Connection"}
          </Text>
        </TouchableOpacity>

        {hasUnsaved && (
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            onPress={save}
            activeOpacity={0.8}
          >
            <Feather name="save" size={18} color={colors.primaryForeground} />
            <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
              Save Settings
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          SECURITY
        </Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.securityRow}>
            <Feather name="lock" size={16} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.securityTitle, { color: colors.foreground }]}>
                Encrypted storage
              </Text>
              <Text style={[styles.securitySub, { color: colors.mutedForeground }]}>
                All credentials are stored with AES-256 encryption in the device's secure enclave
              </Text>
            </View>
          </View>
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <View style={styles.securityRow}>
            <Feather
              name="shield"
              size={16}
              color={settings.serverFingerprint ? colors.success : colors.mutedForeground}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.securityTitle, { color: colors.foreground }]}>
                Server fingerprint (TOFU)
              </Text>
              <Text style={[styles.securitySub, { color: colors.mutedForeground }]}>
                {settings.serverFingerprint
                  ? `Trusted: …${settings.serverFingerprint.slice(-8)}`
                  : "No fingerprint saved yet — auto-trusted on first connection"}
              </Text>
            </View>
            {settings.serverFingerprint && (
              <TouchableOpacity onPress={handleClearFingerprint}>
                <Text style={[styles.clearFpText, { color: colors.destructive }]}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          COMPANION SERVER
        </Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.infoBox, { backgroundColor: colors.accent }]}>
            <Feather name="info" size={14} color={colors.accentForeground} />
            <Text style={[styles.infoText, { color: colors.accentForeground }]}>
              Run the companion server on your computer:{"\n"}
              <Text style={styles.infoCode}>node companion-server/server.js</Text>
              {"\n"}
              Set the same auth token there. The server file is included in this project.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    gap: 20,
  },
  section: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  separator: {
    height: 1,
    marginHorizontal: 16,
  },
  field: {
    padding: 14,
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  fieldHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 15,
  },
  testResult: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  testResultText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  buttons: {
    gap: 10,
  },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  testBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 14,
    gap: 8,
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  securityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
  },
  securityTitle: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  securitySub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
    marginTop: 2,
  },
  clearFpText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    margin: 14,
    padding: 12,
    borderRadius: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  infoCode: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginTop: 2,
  },
  scanBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  modalContainer: {
    flex: 1,
    paddingTop: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 6,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  scanError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 20,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  scanErrorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  discoveryList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  serverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  serverIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  serverName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  serverIp: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  rescanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    margin: 16,
  },
  rescanBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
