import Foundation
import Vision
import React

@objc(VisionOcrModule)
class VisionOcrModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func recognizeText(
    _ imageUri: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    // Convert file:// URI to URL
    guard let url = URL(string: imageUri),
          let imageData = try? Data(contentsOf: url),
          let cgImage = UIImage(data: imageData)?.cgImage else {
      reject("INVALID_IMAGE", "Could not load image from URI", nil)
      return
    }

    let request = VNRecognizeTextRequest { request, error in
      if let error = error {
        reject("OCR_ERROR", error.localizedDescription, error)
        return
      }

      guard let observations = request.results as? [VNRecognizedTextObservation] else {
        resolve([])
        return
      }

      let lines: [[String: Any]] = observations.compactMap { obs in
        guard let topCandidate = obs.topCandidates(1).first else { return nil }
        return [
          "text": topCandidate.string,
          "confidence": topCandidate.confidence
        ]
      }

      resolve(lines)
    }

    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-GB", "en-US"]
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try handler.perform([request])
      } catch {
        reject("OCR_ERROR", error.localizedDescription, error)
      }
    }
  }
}
