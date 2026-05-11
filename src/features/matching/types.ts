export type MediaKind = "video" | "audio";

export type EpisodeSource =
  | "custom"
  | "season-episode"
  | "x-format"
  | "episode-tag"
  | "numeric-token";

export type MatchStatus = "matched" | "video-only" | "audio-only" | "conflict";

export interface MediaFile {
  path: string;
  name: string;
  extension: string;
  kind: MediaKind;
}

export interface EpisodeParseResult {
  episodeNumber: number | null;
  source: EpisodeSource | null;
  error?: string;
}

export interface ParsedMediaFile extends MediaFile {
  parse: EpisodeParseResult;
}

export interface MatchRow {
  episodeNumber: number | null;
  status: MatchStatus;
  videos: ParsedMediaFile[];
  audios: ParsedMediaFile[];
}

export interface MatchPreview {
  rows: MatchRow[];
  unmatchedVideos: ParsedMediaFile[];
  unmatchedAudios: ParsedMediaFile[];
  invalidCustomPattern?: string;
}
