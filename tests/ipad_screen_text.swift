import Foundation
import Vision

// Coordinates are normalized to the top-left of an upright simulator screenshot.
func row(_ text: String, _ box: CGRect, _ confidence: Float) -> [String: Any] {
    ["text": text, "x": box.midX, "y": 1 - box.midY, "confidence": confidence]
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["en-US"]
request.usesLanguageCorrection = false
let handler = VNImageRequestHandler(url: URL(fileURLWithPath: CommandLine.arguments[1]), options: [:])
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
