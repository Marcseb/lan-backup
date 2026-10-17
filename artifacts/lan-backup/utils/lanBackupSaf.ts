import { NativeModules } from "react-native";

interface LanBackupSafModule {
  copyFileToUri(sourceUri: string, destinationUri: string): Promise<void>;
  deleteUri(uri: string): Promise<number>;
  exportToFiles?(sourceUri: string): Promise<"saved" | "cancelled">;
}

export default (NativeModules.LanBackupSaf as LanBackupSafModule | undefined) ?? null;
