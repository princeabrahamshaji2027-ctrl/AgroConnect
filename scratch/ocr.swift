import Foundation
import Vision
import CoreImage

guard CommandLine.arguments.count > 1 else {
    print("Usage: swift ocr.swift <path-to-image>")
    exit(1)
}

let imagePath = CommandLine.arguments[1]
let imageUrl = URL(fileURLWithPath: imagePath)

guard let ciImage = CIImage(contentsOf: imageUrl) else {
    print("Failed to load image from \(imagePath)")
    exit(1)
}

let handler = VNImageRequestHandler(ciImage: ciImage, options: [:])
let request = VNRecognizeTextRequest { request, error in
    if let error = error {
        print("Error: \(error.localizedDescription)")
        return
    }
    
    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        return
    }
    
    for observation in observations {
        if let candidate = observation.topCandidates(1).first {
            print(candidate.string)
        }
    }
}

request.recognitionLevel = .accurate

do {
    try handler.perform([request])
} catch {
    print("Failed to perform OCR: \(error.localizedDescription)")
}
