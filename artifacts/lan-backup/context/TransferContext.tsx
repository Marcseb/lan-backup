import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface SelectedFile {
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
  /** Relative path from the backup root, e.g. "Camera/SubFolder/photo.jpg".
   *  Present when the file was picked via folder picker; absent for individual files. */
  relativePath?: string;
}

export type TransferStatus = "idle" | "running" | "success" | "error" | "cancelled";

export interface TransferRecord {
  id: string;
  timestamp: number;
  files: { name: string; size: number }[];
  status: TransferStatus;
  errorMessage?: string;
  serverIp: string;
  targetFolder: string;
  bytesSent: number;
  totalBytes: number;
}

export interface TransferProgress {
  currentFile: string;
  currentIndex: number;
  totalFiles: number;
  bytesSent: number;
  totalBytes: number;
}

interface TransferContextValue {
  selectedFiles: SelectedFile[];
  setSelectedFiles: React.Dispatch<React.SetStateAction<SelectedFile[]>>;
  removeFile: (uri: string) => void;
  status: TransferStatus;
  setStatus: React.Dispatch<React.SetStateAction<TransferStatus>>;
  progress: TransferProgress | null;
  setProgress: React.Dispatch<React.SetStateAction<TransferProgress | null>>;
  history: TransferRecord[];
  addHistoryRecord: (record: TransferRecord) => Promise<void>;
  clearHistory: () => Promise<void>;
}

const TransferContext = createContext<TransferContextValue | null>(null);

const HISTORY_KEY = "lb_transfer_history";
const MAX_HISTORY = 50;

export function TransferProvider({ children }: { children: React.ReactNode }) {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [status, setStatus] = useState<TransferStatus>("idle");
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [history, setHistory] = useState<TransferRecord[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY)
      .then((raw) => {
        if (raw) setHistory(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  const removeFile = useCallback((uri: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.uri !== uri));
  }, []);

  const addHistoryRecord = useCallback(async (record: TransferRecord) => {
    setHistory((prev) => {
      const next = [record, ...prev].slice(0, MAX_HISTORY);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearHistory = useCallback(async () => {
    setHistory([]);
    await AsyncStorage.removeItem(HISTORY_KEY).catch(() => {});
  }, []);

  return (
    <TransferContext.Provider
      value={{
        selectedFiles,
        setSelectedFiles,
        removeFile,
        status,
        setStatus,
        progress,
        setProgress,
        history,
        addHistoryRecord,
        clearHistory,
      }}
    >
      {children}
    </TransferContext.Provider>
  );
}

export function useTransfer() {
  const ctx = useContext(TransferContext);
  if (!ctx) throw new Error("useTransfer must be used within TransferProvider");
  return ctx;
}
