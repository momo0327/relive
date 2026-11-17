import ExpoModulesCore

public class ReliveVideoMergeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReliveVideoMerge")

    /// Joins video files (file:// URIs) into one MP4 and returns its URI.
    AsyncFunction("merge") { (uris: [String]) async throws -> String in
      return try await mergeVideoClips(uris)
    }
  }
}
