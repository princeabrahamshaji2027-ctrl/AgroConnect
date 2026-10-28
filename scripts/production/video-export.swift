// Re-encode a video for the demo feed with macOS AVFoundation (no third-party tools): video track only (sound removed),
// optional start/length, H.264 MP4 at most 640x480, fast start. Prints the output duration in whole seconds.
//   swift scripts/production/video-export.swift <in> <out.mp4> <startSeconds> <maxSeconds>
import AVFoundation

let a = CommandLine.arguments
guard a.count == 5, let start = Double(a[3]), let maxLen = Double(a[4]) else {
  FileHandle.standardError.write("usage: video-export.swift <in> <out.mp4> <start> <maxSeconds>\n".data(using: .utf8)!); exit(2)
}
let src = AVURLAsset(url: URL(fileURLWithPath: a[1]))
let out = URL(fileURLWithPath: a[2])
try? FileManager.default.removeItem(at: out)
guard let track = src.tracks(withMediaType: .video).first else {
  FileHandle.standardError.write("no video track\n".data(using: .utf8)!); exit(1)
}
let total = CMTimeGetSeconds(src.duration)
let s = min(max(0, start), max(0, total - 1))
let len = min(maxLen, total - s)
let range = CMTimeRange(start: CMTime(seconds: s, preferredTimescale: 600), duration: CMTime(seconds: len, preferredTimescale: 600))
let comp = AVMutableComposition()
let vt = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try vt.insertTimeRange(range, of: track, at: .zero)
vt.preferredTransform = track.preferredTransform   // keep portrait clips upright
guard let ex = AVAssetExportSession(asset: comp, presetName: AVAssetExportPreset640x480) else { exit(1) }
ex.outputURL = out
ex.outputFileType = .mp4
ex.shouldOptimizeForNetworkUse = true
let done = DispatchSemaphore(value: 0)
ex.exportAsynchronously { done.signal() }
done.wait()
guard ex.status == .completed else {
  FileHandle.standardError.write("export failed: \(ex.error?.localizedDescription ?? "unknown")\n".data(using: .utf8)!); exit(1)
}
print(Int(CMTimeGetSeconds(AVURLAsset(url: out).duration).rounded()))
