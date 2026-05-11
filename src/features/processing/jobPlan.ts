import type { ParsedMediaFile } from "../matching/types";
import type { MatchRow, MediaFile } from "../matching/types";

export interface JobItem {
  videoPath: string;
  videoName: string;
  audioPath: string;
  audioName: string;
  outputPath: string;
  outputName: string;
  episodeNumber: number | null;
}

export interface JobValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateJobPlan(
  rows: MatchRow[],
  unmatchedVideos: ParsedMediaFile[],
  outputFolder: string,
  ignoreUnmatched: boolean,
  manualMode: boolean = false,
  manualMatches: Array<{ videoPath: string; audioPath: string }> = [],
): JobValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!outputFolder) {
    errors.push("Output folder not selected");
  }

  // In manual mode, check that all manually selected videos have audio
  if (manualMode && manualMatches.length > 0) {
    const unmatchedManual = manualMatches.filter((m) => !m.audioPath);
    if (unmatchedManual.length > 0) {
      errors.push(
        `${unmatchedManual.length} manually selected video(s) have no audio assigned`,
      );
    }
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // Check matched rows - only rows with episode numbers
  const unmatchedInRows = rows.filter(
    (row) =>
      row.episodeNumber !== null &&
      (!row.selectedAudioPath || !row.videos.length),
  );
  if (unmatchedInRows.length > 0) {
    errors.push(
      `${unmatchedInRows.length} episode(s) have videos but no selected audio`,
    );
  }

  // Check unmatched videos - only if not ignoring them
  if (!ignoreUnmatched && unmatchedVideos.length > 0) {
    errors.push(
      `${unmatchedVideos.length} video file(s) without episode numbers (enable "Skip" to ignore)`,
    );
  }

  if (errors.length === 0 && unmatchedVideos.length > 0 && ignoreUnmatched) {
    warnings.push(
      `${unmatchedVideos.length} unmatched video(s) will be skipped`,
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export function buildJobPlan(
  rows: MatchRow[],
  outputFolder: string,
  audioTrackName: string,
  ignoreUnmatched: boolean = true,
): JobItem[] {
  const jobs: JobItem[] = [];

  for (const row of rows) {
    // Skip rows without selected audio
    if (!row.selectedAudioPath || !row.videos.length) {
      continue;
    }

    // Skip unmatched episodes if ignoreUnmatched is enabled
    if (row.episodeNumber === null && ignoreUnmatched) {
      continue;
    }

    for (const video of row.videos) {
      // Generate output filename
      const videoName = video.name;
      const ext = videoName.slice(videoName.lastIndexOf(".")).toLowerCase();
      const baseName = videoName.slice(0, videoName.lastIndexOf("."));
      const outputName = `${baseName} [${audioTrackName}]${ext}`;
      const outputPath = `${outputFolder}/${outputName}`;

      jobs.push({
        videoPath: video.path,
        videoName: video.name,
        audioPath: row.selectedAudioPath,
        audioName:
          rows
            .flatMap((r) => r.audios)
            .find((a) => a.path === row.selectedAudioPath)?.name || "Unknown",
        outputPath,
        outputName,
        episodeNumber: row.episodeNumber,
      });
    }
  }

  return jobs;
}

export function buildManualJobPlan(
  manualMatches: Array<{ videoPath: string; audioPath: string }>,
  videoFiles: MediaFile[],
  audioFiles: MediaFile[],
  outputFolder: string,
  audioTrackName: string,
): JobItem[] {
  const jobs: JobItem[] = [];

  for (const match of manualMatches) {
    if (!match.audioPath) {
      continue;
    }

    const video = videoFiles.find((v) => v.path === match.videoPath);
    const audio = audioFiles.find((a) => a.path === match.audioPath);

    if (!video || !audio) {
      continue;
    }

    // Generate output filename
    const videoName = video.name;
    const ext = videoName.slice(videoName.lastIndexOf(".")).toLowerCase();
    const baseName = videoName.slice(0, videoName.lastIndexOf("."));
    const outputName = `${baseName} [${audioTrackName}]${ext}`;
    const outputPath = `${outputFolder}/${outputName}`;

    jobs.push({
      videoPath: video.path,
      videoName: video.name,
      audioPath: audio.path,
      audioName: audio.name,
      outputPath,
      outputName,
      episodeNumber: null,
    });
  }

  return jobs;
}

export function estimateProcessingTime(jobCount: number): string {
  // Rough estimate: 2-5 minutes per file depending on codec
  const minSeconds = jobCount * 120;
  const maxSeconds = jobCount * 300;

  const minMin = Math.floor(minSeconds / 60);
  const maxMin = Math.ceil(maxSeconds / 60);

  if (maxMin < 60) {
    return `${minMin}-${maxMin} minutes`;
  }

  const minHours = Math.floor(minMin / 60);
  const minRemain = minMin % 60;
  const maxHours = Math.floor(maxMin / 60);
  const maxRemain = maxMin % 60;

  return `${minHours}h${minRemain}m - ${maxHours}h${maxRemain}m`;
}
