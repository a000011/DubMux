import type {
  EpisodeParseResult,
  MatchPreview,
  MatchRow,
  MediaFile,
  MediaKind,
  ParsedMediaFile,
} from "./types";

const videoExtensions = new Set([".mkv", ".mp4", ".avi"]);
const audioExtensions = new Set([
  ".aac",
  ".m4a",
  ".mp3",
  ".flac",
  ".wav",
  ".mka",
]);

const builtInPatterns: Array<{
  source: EpisodeParseResult["source"];
  regex: RegExp;
}> = [
  { source: "season-episode", regex: /s\d{1,2}e(\d{1,3})/i },
  { source: "x-format", regex: /\d{1,2}x(\d{1,3})/i },
  { source: "episode-tag", regex: /(?:episode|ep|e)[\s._-]*(\d{1,3})(?!\d)/i },
  { source: "numeric-token", regex: /(?:^|[^\d])(\d{2,3})(?:[^\d]|$)/ },
];

function normalizeEpisodeNumber(rawValue: string | undefined): number | null {
  if (!rawValue) {
    return null;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed)) {
    return null;
  }

  if (parsed >= 100) {
    return parsed % 100;
  }

  return parsed;
}

export function classifyMediaKind(fileName: string): MediaKind | null {
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (videoExtensions.has(extension)) {
    return "video";
  }

  if (audioExtensions.has(extension)) {
    return "audio";
  }

  return null;
}

export function extractEpisodeNumber(
  fileName: string,
  customPattern?: string,
): EpisodeParseResult {
  if (customPattern?.trim()) {
    try {
      const regex = new RegExp(customPattern, "i");
      const match = fileName.match(regex);
      const customEpisodeNumber = normalizeEpisodeNumber(match?.[1]);
      if (customEpisodeNumber !== null) {
        return { episodeNumber: customEpisodeNumber, source: "custom" };
      }
    } catch (error) {
      return {
        episodeNumber: null,
        source: null,
        error: error instanceof Error ? error.message : "Invalid regex",
      };
    }
  }

  for (const pattern of builtInPatterns) {
    const match = fileName.match(pattern.regex);
    const episodeNumber = normalizeEpisodeNumber(match?.[1]);
    if (episodeNumber !== null) {
      return { episodeNumber, source: pattern.source };
    }
  }

  return { episodeNumber: null, source: null };
}

export function buildMediaFile(path: string): MediaFile | null {
  const parts = path.split(/[/\\]/);
  const name = parts.at(-1) ?? path;
  const extensionIndex = name.lastIndexOf(".");
  if (extensionIndex === -1) {
    return null;
  }

  const extension = name.slice(extensionIndex).toLowerCase();
  const kind = classifyMediaKind(name);
  if (!kind) {
    return null;
  }

  return {
    path,
    name,
    extension,
    kind,
  };
}

function parseFiles(
  files: MediaFile[],
  customPattern?: string,
): ParsedMediaFile[] {
  return files.map((file) => ({
    ...file,
    parse: extractEpisodeNumber(file.name, customPattern),
  }));
}

export function buildMatchPreview(
  videoFiles: MediaFile[],
  audioFiles: MediaFile[],
  customPattern?: string,
): MatchPreview {
  const parsedVideos = parseFiles(videoFiles, customPattern);
  const parsedAudios = parseFiles(audioFiles, customPattern);

  const invalidCustomPattern =
    parsedVideos.find((file) => file.parse.error)?.parse.error ??
    parsedAudios.find((file) => file.parse.error)?.parse.error;

  const rowMap = new Map<number | null, MatchRow>();

  for (const file of [...parsedVideos, ...parsedAudios]) {
    const key = file.parse.episodeNumber;
    if (!rowMap.has(key)) {
      rowMap.set(key, {
        episodeNumber: key,
        status: "conflict",
        videos: [],
        audios: [],
      });
    }

    const row = rowMap.get(key);
    if (!row) {
      continue;
    }

    if (file.kind === "video") {
      row.videos.push(file);
    } else {
      row.audios.push(file);
    }
  }

  const rows = Array.from(rowMap.values())
    .filter((row) => row.episodeNumber !== null)
    .map((row) => ({
      ...row,
      status:
        row.videos.length === 1 && row.audios.length === 1
          ? "matched"
          : row.videos.length > 1 || row.audios.length > 1
            ? "conflict"
            : row.videos.length === 1
              ? "video-only"
              : "audio-only",
    }))
    .sort(
      (left, right) => (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0),
    );

  return {
    rows,
    unmatchedVideos: parsedVideos.filter(
      (file) => file.parse.episodeNumber === null,
    ),
    unmatchedAudios: parsedAudios.filter(
      (file) => file.parse.episodeNumber === null,
    ),
    invalidCustomPattern,
  };
}
