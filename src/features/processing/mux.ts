import type { JobItem } from "./jobPlan";

export interface MuxJob {
  video_path: string;
  audio_path: string;
  output_path: string;
  audio_track_name: string;
}

export interface ProcessingProgress {
  current: number;
  total: number;
  current_file: string;
  status: "processing" | "completed" | "error";
  error_message?: string;
}

export function jobItemToMuxJob(job: JobItem, audioTrackName: string): MuxJob {
  return {
    video_path: job.videoPath,
    audio_path: job.audioPath,
    output_path: job.outputPath,
    audio_track_name: audioTrackName,
  };
}
