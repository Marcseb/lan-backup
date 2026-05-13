import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { DiskInfo } from "@/utils/serverApi";
import { formatBytes } from "@/utils/format";

interface Props {
  serverIp: string;
  connected: boolean | null;
  checking: boolean;
  diskInfo: DiskInfo | null;
  error: string | null;
  onRefresh: () => void;
  fingerprintMismatch: boolean;
}

export function ServerStatusCard({
  serverIp,
  connected,
  checking,
  diskInfo,
  error,
  onRefresh,
  fingerprintMismatch,
}: Props) {
  const colors = useColors();

  const statusColor =
    checking ? colors.mutedForeground
    : connected === true ? colors.success
    : colors.destructive;

  const statusLabel =
    checking ? "Checking..."
    : connected === true ? "Connected"
    : connected === false ? "Unreachable"
    : "Not checked";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.statusRow}>
          {checking ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
          )}
          <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn} disabled={checking}>
          <Feather name="refresh-cw" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.ip, { color: colors.foreground }]}>
        {serverIp || "No server configured"}
      </Text>

      {fingerprintMismatch && (
        <View style={[styles.warnBox, { backgroundColor: colors.warningLight, borderColor: colors.warning }]}>
          <Feather name="alert-triangle" size={14} color={colors.warning} />
          <Text style={[styles.warnText, { color: colors.warning }]}>
            Server fingerprint changed — go to Settings to re-trust
          </Text>
        </View>
      )}

      {error && !fingerprintMismatch && (
        <Text style={[styles.errorText, { color: colors.destructive }]} numberOfLines={2}>
          {error}
        </Text>
      )}

      {diskInfo && connected && (
        <View style={styles.diskSection}>
          <View style={styles.diskRow}>
            <Text style={[styles.diskLabel, { color: colors.mutedForeground }]}>Free space</Text>
            <Text style={[styles.diskValue, { color: colors.foreground }]}>
              {formatBytes(diskInfo.free)} / {formatBytes(diskInfo.total)}
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${diskInfo.usagePercent}%`,
                  backgroundColor:
                    diskInfo.usagePercent > 90 ? colors.destructive
                    : diskInfo.usagePercent > 75 ? colors.warning
                    : colors.primary,
                },
              ]}
            />
          </View>
          <Text style={[styles.diskPercent, { color: colors.mutedForeground }]}>
            {diskInfo.usagePercent.toFixed(1)}% used
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  refreshBtn: {
    padding: 4,
  },
  ip: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  warnBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginTop: 2,
  },
  warnText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 16,
  },
  diskSection: {
    marginTop: 4,
    gap: 4,
  },
  diskRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  diskLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  diskValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  diskPercent: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
});
