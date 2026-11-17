import AVFoundation
import CoreGraphics

struct VideoMergeError: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

/// Joins clips end to end into one MP4. Each clip keeps its own orientation and
/// is scaled to fill the first clip's frame, so a recording that flips between
/// the back and front camera plays as one continuous video.
func mergeVideoClips(_ uris: [String]) async throws -> String {
  let composition = AVMutableComposition()
  guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
    throw VideoMergeError(message: "Couldn't create the video track.")
  }
  let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)

  var renderSize: CGSize?
  var segments: [(range: CMTimeRange, transform: CGAffineTransform, rect: CGRect)] = []
  var cursor = CMTime.zero

  for uri in uris {
    let url = URL(string: uri).flatMap { $0.scheme == nil ? nil : $0 } ?? URL(fileURLWithPath: uri)
    let asset = AVURLAsset(url: url)
    let duration = try await asset.load(.duration)
    guard duration.seconds > 0.05, let source = try await asset.loadTracks(withMediaType: .video).first else { continue }
    let range = CMTimeRange(start: .zero, duration: duration)
    try videoTrack.insertTimeRange(range, of: source, at: cursor)
    if let audio = try await asset.loadTracks(withMediaType: .audio).first, let audioTrack {
      try? audioTrack.insertTimeRange(range, of: audio, at: cursor)
    }
    let natural = try await source.load(.naturalSize)
    let transform = try await source.load(.preferredTransform)
    let rect = CGRect(origin: .zero, size: natural).applying(transform)
    if renderSize == nil {
      renderSize = CGSize(width: abs(rect.width).rounded(), height: abs(rect.height).rounded())
    }
    segments.append((CMTimeRange(start: cursor, duration: duration), transform, rect))
    cursor = cursor + duration
  }

  guard let size = renderSize, !segments.isEmpty else {
    throw VideoMergeError(message: "There was nothing to join.")
  }

  let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
  var instructions: [AVMutableVideoCompositionInstruction] = []
  for segment in segments {
    let oriented = CGSize(width: abs(segment.rect.width), height: abs(segment.rect.height))
    let scale = max(size.width / oriented.width, size.height / oriented.height)
    let transform = segment.transform
      .concatenating(CGAffineTransform(translationX: -segment.rect.minX, y: -segment.rect.minY))
      .concatenating(CGAffineTransform(scaleX: scale, y: scale))
      .concatenating(CGAffineTransform(
        translationX: (size.width - oriented.width * scale) / 2,
        y: (size.height - oriented.height * scale) / 2))
    layer.setTransform(transform, at: segment.range.start)
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = segment.range
    instructions.append(instruction)
  }
  for instruction in instructions {
    instruction.layerInstructions = [layer]
  }

  let videoComposition = AVMutableVideoComposition()
  videoComposition.renderSize = size
  videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
  videoComposition.instructions = instructions

  let output = FileManager.default.temporaryDirectory.appendingPathComponent("relive-\(UUID().uuidString).mp4")
  guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
    throw VideoMergeError(message: "Couldn't start joining the clips.")
  }
  export.videoComposition = videoComposition
  export.outputURL = output
  export.outputFileType = .mp4
  export.shouldOptimizeForNetworkUse = true

  await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
    export.exportAsynchronously { done.resume() }
  }
  guard export.status == .completed else {
    throw VideoMergeError(message: export.error?.localizedDescription ?? "Couldn't join the clips.")
  }
  return output.absoluteString
}
