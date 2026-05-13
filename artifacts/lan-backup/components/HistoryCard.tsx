import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { TransferRecord } from "@/context/TransferContext";
import { formatBytes, formatDate } from "@/utils/format";

interface Props {
  record: TransferRecord;
}

export function HistoryCard({ record }: Props) {
  const colors = useColors();

  const isSuccess = record.status === "success";
  const isError = record.status === "error";
  const isCancelled = record.status === "cancelled";

  const statusColor =
    isSuccess ? colors.success
    : isError ? colors.destructive
    : colors.warning;

  const statusIcon: keyof typeof Feather.glyphMap =
    isSuccess ? "check-circle"
    : isError ? "alert-circle"
    : "x-circle";

  const statusLabel =
    isSuccess ? "Completed"
    : isError ? "Failed"
    : "Cancelled";

  const fileCount = record.files.length;
  const totalSize = record.files.reduce((acc, f) => acc + f.size, 0);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.statusRow}>
          <Feather name={statusIcon} size={16} color={statusColor} />
          <Text style={[styles.status, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <Text style={[styles.date, { color: colors.mutedForeground }]}>
          {formatDate(record.timestamp)}
        </Text>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Feather name="copy" size={12} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {fileCount} {fileCount === 1 ? "file" : "files"}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Feather name="hard-drive" size={12} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {formatBytes(totalSize)}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Feather name="server" size={12} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {record.serverIp}
          </Text>
        </View>
      </View>

      {record.errorMessage && (
        <Text style={[styles.errorMsg, { color: colors.destructive }]} numberOfLines={2}>
          {record.errorMessage}
        </Text>
      )}

      {record.files.length > 0 && (
        <View style={styles.fileList}>
          {record.files.slice(0, 3).map((f, i) => (
            <Text
              key={i}
              style={[styles.fileName, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {f.name}
            </Text>
          ))}
          {record.files.length > 3 && (
            <Text style={[styles.moreFiles, { color: colors.mutedForeground }]}>
              +{record.files.length - 3} more
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
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
  status: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  date: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  metaRow: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  errorMsg: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  fileList: {
    gap: 2,
    marginTop: 2,
  },
  fileName: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  moreFiles: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
});
