import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { SelectedFile } from "@/context/TransferContext";
import { formatBytes } from "@/utils/format";

function fileIcon(mimeType?: string): string {
  if (!mimeType) return "file";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "film";
  if (mimeType.startsWith("audio/")) return "music";
  if (mimeType.includes("pdf")) return "file-text";
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("gzip")) return "archive";
  if (mimeType.includes("text/")) return "file-text";
  return "file";
}

interface Props {
  file: SelectedFile;
  onRemove?: () => void;
  progress?: number | null;
  done?: boolean;
  error?: string | null;
}

export function FileListItem({ file, onRemove, progress, done, error }: Props) {
  const colors = useColors();
  const icon = fileIcon(file.mimeType) as keyof typeof Feather.glyphMap;

  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.iconBox, { backgroundColor: colors.secondary }]}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {file.name}
        </Text>
        <Text style={[styles.size, { color: colors.mutedForeground }]}>
          {formatBytes(file.size)}
        </Text>
        {progress !== null && progress !== undefined && !done && !error && (
          <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>
        )}
        {error && (
          <Text style={[styles.errorText, { color: colors.destructive }]} numberOfLines={1}>
            {error}
          </Text>
        )}
      </View>
      {done && !error && (
        <Feather name="check-circle" size={20} color={colors.success} />
      )}
      {error && (
        <Feather name="alert-circle" size={20} color={colors.destructive} />
      )}
      {!done && progress === null && onRemove && (
        <TouchableOpacity onPress={onRemove} style={styles.removeBtn} hitSlop={8}>
          <Feather name="x" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  size: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  errorText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  removeBtn: {
    padding: 2,
  },
});
