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
import { type PeerServer, useSettings } from "@/context/SettingsContext";
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
  const { settings, saveAllSettings, clearFingerprint, updateSetting, savePeerServers } = useSettings();

  const [localIp, setLocalIp] = useState(settings.serverIp);
  const [localPort, setLocalPort] = useState(settings.serverPort);
  const [localToken, setLocalToken] = useState(settings.authToken);
  const [localFolder, setLocalFolder] = useState(settings.targetFolder);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [showDiscovery, setShowDiscovery] = useState(false);
  const [discoveryMode, setDiscoveryMode] = useState<"primary" | "peer">("primary");
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [discovered, setDiscovered] = useState<DiscoveredServer[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);

  // Peer server addition flow
  const [addingPeer, setAddingPeer] = useState<{
    ip: string; port: string; hostname: string; fingerprint: string | null;
  } | null>(null);
  const [peerToken, setPeerToken] = useState("");
  const [peerName, setPeerName] = useState("");

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
    setDiscoveryMode("primary");
    setShowDiscovery(true);
    startScan();
  };

  const openPeerDiscovery = () => {
    setDiscoveryMode("peer");
    setShowDiscovery(true);
    startScan();
  };

  const closeDiscovery = () => {
    stopScan();
    setShowDiscovery(false);
  };

  const selectServer = (server: DiscoveredServer) => {
    if (discoveryMode === "peer") {
      setAddingPeer({
        ip: server.ip,
        port: localPort.trim() || "7823",
        hostname: server.hostname || server.ip,
        fingerprint: server.id || null,
      });
      setPeerToken("");
      setPeerName(server.hostname || server.ip);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      closeDiscovery();
    } else {
      setLocalIp(server.ip);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      closeDiscovery();
    }
  };

  const confirmAddPeer = async () => {
    if (!addingPeer || !peerToken.trim()) return;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const newPeer: PeerServer = {
      id,
      name: peerName.trim() || addingPeer.hostname,
      ip: addingPeer.ip,
      port: addingPeer.port,
      token: peerToken.trim(),
      fingerprint: addingPeer.fingerprint,
    };
    await savePeerServers([...settings.peerServers, newPeer]);
    setAddingPeer(null);
    setPeerToken("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const removePeer = (peerId: string) => {
    Alert.alert(
      "Remove peer server",
      "Remove this server from the sync destinations?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            savePeerServers(settings.peerServers.filter((p) => p.id !== peerId));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          },
        },
      ]
    );
  };

  const QUALITY_LABELS: Record<string, string> = {
    low:    "Low — small file, readable text (bills, receipts)",
    medium: "Medium — balanced quality and size",
    high:   "High — near-original quality",
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
              {discoveryMode === "peer" ? "Select peer server" : "Available computers"}
            </Text>
            <TouchableOpacity onPress={closeDiscovery} hitSlop={12}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {discoveryMode === "peer" && (
            <View style={[styles.peerHintBanner, { backgroundColor: colors.accent, borderBottomColor: colors.border }]}>
              <Feather name="info" size={13} color={colors.accentForeground} />
              <Text style={[styles.peerHintText, { color: colors.accentForeground }]}>
                Select the computer you want to add as a sync destination.
              </Text>
            </View>
          )}

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
              const isPrimary = server.ip === settings.serverIp;
              const isPeer = settings.peerServers.some((p) => p.ip === server.ip);
              const disabled = discoveryMode === "peer" && (isPrimary || isPeer);
              return (
                <TouchableOpacity
                  key={server.ip}
                  style={[
                    styles.serverRow,
                    {
                      backgroundColor: disabled ? colors.background : colors.card,
                      borderColor: colors.border,
                      opacity: disabled ? 0.5 : 1,
                    },
                  ]}
                  onPress={() => !disabled && selectServer(server)}
                  activeOpacity={disabled ? 1 : 0.7}
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
                      {isPrimary ? " · Primary" : isPeer ? " · Already added" : ""}
                    </Text>
                  </View>
                  {!disabled && <Feather name="chevron-right" size={18} color={colors.mutedForeground} />}
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

      {/* ── Peer Token Entry Modal ── */}
      <Modal
        visible={!!addingPeer}
        animationType="fade"
        transparent
        onRequestClose={() => setAddingPeer(null)}
      >
        <View style={peerModalStyles.overlay}>
          <View style={[peerModalStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[peerModalStyles.title, { color: colors.foreground }]}>Add peer server</Text>
            <Text style={[peerModalStyles.sub, { color: colors.mutedForeground }]}>
              {addingPeer?.hostname}  ·  {addingPeer?.ip}:{addingPeer?.port}
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 16 }]}>Name (optional)</Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 4 }]}>
              <TextInput
                value={peerName}
                onChangeText={setPeerName}
                placeholder="Office PC, Home NAS…"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
                autoCorrect={false}
                style={[styles.input, { color: colors.foreground }]}
              />
            </View>

            <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 12 }]}>Auth Token *</Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 4 }]}>
              <TextInput
                value={peerToken}
                onChangeText={setPeerToken}
                placeholder="Peer server's secret token"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { color: colors.foreground }]}
              />
            </View>
            <Text style={[peerModalStyles.hint, { color: colors.mutedForeground }]}>
              Find this in the peer server's terminal output or its .env file.
            </Text>

            <View style={peerModalStyles.buttons}>
              <TouchableOpacity
                style={[peerModalStyles.cancelBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                onPress={() => setAddingPeer(null)}
                activeOpacity={0.7}
              >
                <Text style={[peerModalStyles.cancelText, { color: colors.foreground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[peerModalStyles.addBtn, { backgroundColor: peerToken.trim() ? colors.primary : colors.muted }]}
                onPress={confirmAddPeer}
                disabled={!peerToken.trim()}
                activeOpacity={0.8}
              >
                <Feather name="plus" size={15} color={colors.primaryForeground} />
                <Text style={[peerModalStyles.addText, { color: colors.primaryForeground }]}>Add Server</Text>
              </TouchableOpacity>
            </View>
          </View>
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

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          IMAGE COMPRESSION QUALITY
        </Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(["low", "medium", "high"] as const).map((q, i, arr) => (
            <React.Fragment key={q}>
              <TouchableOpacity
                style={styles.qualityRow}
                onPress={() => updateSetting("imageQuality", q)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.qualityRadio,
                  { borderColor: settings.imageQuality === q ? colors.primary : colors.border },
                ]}>
                  {settings.imageQuality === q && (
                    <View style={[styles.qualityRadioDot, { backgroundColor: colors.primary }]} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.qualityLabel, { color: colors.foreground }]}>
                    {q.charAt(0).toUpperCase() + q.slice(1)}
                  </Text>
                  <Text style={[styles.qualityHint, { color: colors.mutedForeground }]}>
                    {QUALITY_LABELS[q]}
                  </Text>
                </View>
              </TouchableOpacity>
              {i < arr.length - 1 && (
                <View style={[styles.separator, { backgroundColor: colors.border }]} />
              )}
            </React.Fragment>
          ))}
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <View style={[styles.qualityInfo, { backgroundColor: colors.accent }]}>
            <Feather name="info" size={13} color={colors.accentForeground} />
            <Text style={[styles.qualityInfoText, { color: colors.accentForeground }]}>
              Toggle compression on/off using the <Text style={{ fontFamily: "Inter_600SemiBold" }}>⊡</Text> button on the Backup screen. This setting controls the quality when compression is active.
            </Text>
          </View>
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
          PRO FEATURES (RESTORE &amp; SERVER SYNC)
        </Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.securityRow}>
            <Feather
              name={settings.restoreUnlocked ? "unlock" : "lock"}
              size={16}
              color={settings.restoreUnlocked ? colors.success : colors.mutedForeground}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.securityTitle, { color: colors.foreground }]}>
                {settings.restoreUnlocked ? "Pro features unlocked ✓" : "Pro features not yet unlocked"}
              </Text>
              <Text style={[styles.securitySub, { color: colors.mutedForeground }]}>
                {settings.restoreUnlocked
                  ? "You have permanent access to Restore and Server Sync."
                  : "A one-time €5 contribution unlocks Restore and Server Sync. See the Restore tab."}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Peer Servers — only shown when pro is unlocked ── */}
      {settings.restoreUnlocked && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            PEER SERVERS — SERVER SYNC
          </Text>
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {settings.peerServers.length === 0 ? (
              <View style={styles.securityRow}>
                <Feather name="server" size={16} color={colors.mutedForeground} />
                <Text style={[styles.securitySub, { color: colors.mutedForeground, flex: 1 }]}>
                  No peer servers yet. Add a second computer to enable Server Sync on the Backup tab.
                </Text>
              </View>
            ) : (
              settings.peerServers.map((peer, i) => (
                <React.Fragment key={peer.id}>
                  {i > 0 && <View style={[styles.separator, { backgroundColor: colors.border }]} />}
                  <View style={styles.securityRow}>
                    <Feather name="monitor" size={16} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.securityTitle, { color: colors.foreground }]}>{peer.name}</Text>
                      <Text style={[styles.securitySub, { color: colors.mutedForeground }]}>
                        {peer.ip}:{peer.port}
                        {peer.fingerprint ? `  ·  ID …${peer.fingerprint.slice(-6)}` : ""}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removePeer(peer.id)} hitSlop={8}>
                      <Text style={[styles.clearFpText, { color: colors.destructive }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </React.Fragment>
              ))
            )}
            <View style={[styles.separator, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.qualityRow}
              onPress={openPeerDiscovery}
              activeOpacity={0.7}
            >
              <Feather name="plus-circle" size={16} color={colors.primary} />
              <Text style={[styles.securityTitle, { color: colors.primary, marginLeft: 4 }]}>
                Add peer server…
              </Text>
            </TouchableOpacity>
          </View>
          {settings.peerServers.length > 0 && (
            <View style={[styles.qualityInfo, { backgroundColor: colors.accent, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginTop: 4 }]}>
              <Feather name="info" size={13} color={colors.accentForeground} />
              <Text style={[styles.qualityInfoText, { color: colors.accentForeground }]}>
                When ≥1 peer server is configured, a <Text style={{ fontFamily: "Inter_600SemiBold" }}>Server Sync</Text> tab appears on the Backup screen. Files in this server's <Text style={{ fontFamily: "Inter_600SemiBold" }}>export/</Text> folder are pushed to all peers.
              </Text>
            </View>
          )}
        </View>
      )}

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
  },
  field: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  inputWrapper: {
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  fieldHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  scanBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  qualityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  qualityRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  qualityRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  qualityLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  qualityHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  qualityInfo: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    alignItems: "flex-start",
  },
  qualityInfoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  testResult: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  testResultText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  buttons: {
    gap: 10,
  },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  testBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
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
    marginTop: 2,
    lineHeight: 17,
  },
  clearFpText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  infoBox: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  infoCode: {
    fontFamily: "Inter_600SemiBold",
  },
  // Discovery modal
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  peerHintBanner: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
  },
  peerHintText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  progressContainer: {
    padding: 16,
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
    gap: 8,
    alignItems: "center",
    padding: 12,
    margin: 16,
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
    padding: 16,
  },
  emptyState: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 40,
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
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
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
    fontFamily: "Inter_500Medium",
  },
  serverIp: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  rescanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    margin: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  rescanBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});

const peerModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  sub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    lineHeight: 16,
  },
  buttons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  cancelText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  addText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
