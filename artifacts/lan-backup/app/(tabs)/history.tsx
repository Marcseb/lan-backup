import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HistoryCard } from "@/components/HistoryCard";
import { useTransfer } from "@/context/TransferContext";
import { useColors } from "@/hooks/useColors";

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { history, clearHistory } = useTransfer();

  const handleClear = () => {
    Alert.alert(
      "Clear History",
      "Remove all transfer records? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear All", style: "destructive", onPress: clearHistory },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          {
            paddingTop: Platform.OS === "web" ? 67 + 16 : 16,
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 24,
          },
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <HistoryCard record={item} />}
        scrollEnabled={history.length > 0}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          history.length > 0 ? (
            <View style={styles.listHeader}>
              <Text style={[styles.count, { color: colors.mutedForeground }]}>
                {history.length} {history.length === 1 ? "transfer" : "transfers"}
              </Text>
              <TouchableOpacity onPress={handleClear}>
                <Text style={[styles.clearText, { color: colors.destructive }]}>
                  Clear All
                </Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIconBox, { backgroundColor: colors.secondary }]}>
              <Feather name="clock" size={36} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No transfers yet
            </Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              Your backup history will appear here after you run a transfer
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: {
    paddingHorizontal: 16,
    gap: 10,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  count: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  clearText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  separator: {
    height: 8,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
    paddingTop: 80,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});
