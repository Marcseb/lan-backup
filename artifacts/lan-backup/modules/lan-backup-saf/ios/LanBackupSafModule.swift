import ExpoModulesCore
import UIKit

public final class LanBackupSafModule: Module, UIDocumentPickerDelegate {
  private var exportPromise: Promise?
  private var documentPicker: UIDocumentPickerViewController?

  public func definition() -> ModuleDefinition {
    Name("LanBackupSaf")

    AsyncFunction("exportToFiles") { (sourceUri: String, promise: Promise) in
      guard self.exportPromise == nil else {
        throw ExportAlreadyInProgressException()
      }
      guard let sourceURL = URL(string: sourceUri), sourceURL.isFileURL else {
        throw InvalidSourceFileException()
      }
      guard FileManager.default.fileExists(atPath: sourceURL.path) else {
        throw SourceFileNotFoundException()
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        throw MissingPresenterException()
      }

      let picker = UIDocumentPickerViewController(forExporting: [sourceURL], asCopy: true)
      picker.delegate = self
      self.exportPromise = promise
      self.documentPicker = picker
      presenter.present(picker, animated: true)
    }.runOnQueue(.main)
  }

  public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    finishExport(result: "saved")
  }

  public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finishExport(result: "cancelled")
  }

  private func finishExport(result: String) {
    exportPromise?.resolve(result)
    exportPromise = nil
    documentPicker = nil
  }
}

private struct ExportAlreadyInProgressException: Exception {
  var reason = "A Files export is already open."
}

private struct InvalidSourceFileException: Exception {
  var reason = "The downloaded file URL is invalid."
}

private struct SourceFileNotFoundException: Exception {
  var reason = "The downloaded file could not be found."
}

private struct MissingPresenterException: Exception {
  var reason = "Could not open the Files destination picker."
}
