import Foundation
import ImageIO
import Vision

// Keep enough pixels for small permission text, even on a Retina simulator.
let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL, nil)!
let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                kCGImageSourceThumbnailMaxPixelSize: 1600]
let screenshot = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)!
let bounds = CGRect(x: 0, y: 0, width: CGFloat(screenshot.width), height: CGFloat(screenshot.height))
let crop = CommandLine.arguments.contains("--full") ? bounds :
    bounds.insetBy(dx: bounds.width * 0.18, dy: bounds.height * 0.23).integral
func row(_ text: String, _ box: CGRect, _ confidence: Float) -> [String: Any] {
    ["text": text, "x": (crop.minX + box.midX * crop.width) / bounds.width,
     "y": (crop.minY + (1 - box.midY) * crop.height) / bounds.height, "confidence": confidence]
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["en-US"]
request.usesLanguageCorrection = false
let handler = VNImageRequestHandler(cgImage: screenshot.cropping(to: crop)!, options: [:])
try handler.perform([request])
var result: [[String: Any]] = []
let pair = try NSRegularExpression(pattern: "^(Don['’]t Allow|Cancel|Deny)\\s+(Allow|OK)$", options: [.caseInsensitive])
for observation in request.results ?? [] {
    guard let hit = observation.topCandidates(1).first else { continue }
    let line = hit.string
    result.append(row(line, observation.boundingBox, hit.confidence))
    // Vision sometimes recognizes horizontally adjacent buttons as one line.
    if let match = pair.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) {
        for group in 1...2 {
            if let range = Range(match.range(at: group), in: line),
               let button = try hit.boundingBox(for: range) {
                result.append(row(String(line[range]), button.boundingBox, hit.confidence))
            }
        }
    }
}
FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: result))
