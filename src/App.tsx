import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  buildMatchPreview,
  buildMediaFile,
} from "./features/matching/matching";
import type { MatchPreview, MediaFile } from "./features/matching/types";
import {
  validateJobPlan,
  buildJobPlan,
  buildManualJobPlan,
  estimateProcessingTime,
} from "./features/processing/jobPlan";
import { jobItemToMuxJob } from "./features/processing/mux";
import type { ProcessingProgress } from "./features/processing/mux";

interface FolderEntry {
  path: string;
}

async function listTopLevelFiles(folderPath: string): Promise<MediaFile[]> {
  const entries = await invoke<FolderEntry[]>("scan_folder", { folderPath });
  return entries
    .map((entry) => buildMediaFile(entry.path))
    .filter((entry): entry is MediaFile => entry !== null);
}

const emptyPreview: MatchPreview = {
  rows: [],
  unmatchedVideos: [],
  unmatchedAudios: [],
};

export default function App() {
  const [seasonFolder, setSeasonFolder] = useState<string>("");
  const [audioFolder, setAudioFolder] = useState<string>("");
  const [outputFolder, setOutputFolder] = useState<string>("");
  const [videoFiles, setVideoFiles] = useState<MediaFile[]>([]);
  const [audioFiles, setAudioFiles] = useState<MediaFile[]>([]);
  const [customPattern, setCustomPattern] = useState<string>("");
  const [audioTrackName, setAudioTrackName] = useState<string>(
    "External Audio (DUB)",
  );
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [audioOverrides, setAudioOverrides] = useState<Record<number, string>>(
    {},
  ); // episodeNumber -> audioPath
  const [manualMode, setManualMode] = useState<boolean>(false);
  const [manualMatches, setManualMatches] = useState<
    Array<{ videoPath: string; audioPath: string }>
  >([]);
  const [ignoreUnmatched, setIgnoreUnmatched] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] =
    useState<ProcessingProgress | null>(null);
  const [processingErrors, setProcessingErrors] = useState<string[]>([]);
  const [processingSuccessMessage, setProcessingSuccessMessage] =
    useState<string>("");

  const preview = useMemo(() => {
    const basePreview = buildMatchPreview(
      videoFiles,
      audioFiles,
      customPattern,
    );

    // Filter out manually paired files from unmatched lists
    let unmatchedVideos = basePreview.unmatchedVideos;
    let unmatchedAudios = basePreview.unmatchedAudios;

    if (manualMode && manualMatches.length > 0) {
      const pairedVideoPaths = new Set(manualMatches.map((m) => m.videoPath));
      const pairedAudioPaths = new Set(
        manualMatches.filter((m) => m.audioPath).map((m) => m.audioPath),
      );
      unmatchedVideos = unmatchedVideos.filter(
        (v) => !pairedVideoPaths.has(v.path),
      );
      unmatchedAudios = unmatchedAudios.filter(
        (a) => !pairedAudioPaths.has(a.path),
      );
    }

    // Apply user overrides to rows
    const rowsWithOverrides = basePreview.rows.map((row) => ({
      ...row,
      selectedAudioPath:
        audioOverrides[row.episodeNumber ?? -1] || row.audios[0]?.path,
    }));
    return {
      ...basePreview,
      rows: rowsWithOverrides,
      unmatchedVideos,
      unmatchedAudios,
      hasOverrides: Object.keys(audioOverrides).length > 0,
    };
  }, [
    audioFiles,
    customPattern,
    videoFiles,
    audioOverrides,
    manualMode,
    manualMatches,
  ]);

  const jobValidation = useMemo(
    () =>
      validateJobPlan(
        preview.rows,
        preview.unmatchedVideos,
        outputFolder,
        ignoreUnmatched,
        manualMode,
        manualMatches,
      ),
    [
      preview.rows,
      preview.unmatchedVideos,
      outputFolder,
      ignoreUnmatched,
      manualMode,
      manualMatches,
    ],
  );

  const jobPlan = useMemo(() => {
    if (!jobValidation.isValid) {
      return [];
    }

    if (manualMode && manualMatches.length > 0) {
      return buildManualJobPlan(
        manualMatches,
        videoFiles,
        audioFiles,
        outputFolder,
        audioTrackName,
      );
    }

    return buildJobPlan(
      preview.rows,
      outputFolder,
      audioTrackName,
      ignoreUnmatched,
    );
  }, [
    jobValidation.isValid,
    manualMode,
    manualMatches,
    videoFiles,
    audioFiles,
    outputFolder,
    audioTrackName,
    preview.rows,
    ignoreUnmatched,
  ]);

  useEffect(() => {
    if (preview.invalidCustomPattern) {
      setErrorMessage(`Regex error: ${preview.invalidCustomPattern}`);
      return;
    }

    setErrorMessage("");
  }, [preview.invalidCustomPattern]);

  useEffect(() => {
    const setupListener = async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      const unlisten = await appWindow.listen<ProcessingProgress>(
        "mux_progress",
        (event: any) => {
          setProcessingProgress(event.payload);
        },
      );

      return unlisten;
    };

    let unlistenFn: (() => void) | null = null;

    setupListener()
      .then((unlisten) => {
        unlistenFn = unlisten;
      })
      .catch(console.error);

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  async function pickFolder(label: "season" | "audio" | "output") {
    const titleMap = {
      season: "Choose season folder",
      audio: "Choose audio folder",
      output: "Choose output folder for processed videos",
    };

    const selected = await open({
      directory: true,
      multiple: false,
      title: titleMap[label],
    });

    if (!selected || Array.isArray(selected)) {
      return;
    }

    if (label === "season") {
      setSeasonFolder(selected);
      setVideoFiles(await listTopLevelFiles(selected));
      return;
    }

    if (label === "audio") {
      setAudioFolder(selected);
      setAudioFiles(await listTopLevelFiles(selected));
      return;
    }

    setOutputFolder(selected);
  }

  async function startProcessing() {
    if (jobPlan.length === 0 || !jobValidation.isValid) {
      setErrorMessage("Cannot start processing: invalid job plan");
      return;
    }

    setIsProcessing(true);
    setProcessingErrors([]);
    setProcessingProgress(null);
    setProcessingSuccessMessage("");

    try {
      const muxJobs = jobPlan.map((job) =>
        jobItemToMuxJob(job, audioTrackName),
      );

      const results = await invoke<string[]>("process_mux_jobs", {
        jobs: muxJobs,
      });

      setIsProcessing(false);
      if (results.length > 0) {
        setErrorMessage("");
        setProcessingSuccessMessage(
          `Done: successfully processed ${results.length} file(s).`,
        );
      }
    } catch (err) {
      setIsProcessing(false);
      const errorMsg = typeof err === "string" ? err : String(err);
      setErrorMessage(`Processing failed: ${errorMsg}`);
      setProcessingErrors([errorMsg]);
      setProcessingSuccessMessage("");
    }
  }

  return (
    <main className="shell">
      <section className="hero-card">
        <p className="eyebrow">Desktop utility</p>
        <h1>DubMux</h1>
        <p className="lede">
          Select season and audio folders, match episodes automatically, and mux
          external audio tracks into your video files. Supports multiple audio
          formats and custom episode naming patterns.
        </p>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <h2>Folders</h2>
          <div className="picker-row">
            <button type="button" onClick={() => void pickFolder("season")}>
              Choose season folder
            </button>
            <span>{seasonFolder || "Not selected"}</span>
          </div>
          <div className="picker-row">
            <button type="button" onClick={() => void pickFolder("audio")}>
              Choose audio folder
            </button>
            <span>{audioFolder || "Not selected"}</span>
          </div>
          <div className="picker-row">
            <button type="button" onClick={() => void pickFolder("output")}>
              Choose output folder
            </button>
            <span>{outputFolder || "Not selected"}</span>
          </div>
          <div className="stat-row">
            <strong>{videoFiles.length}</strong>
            <span>Video files found</span>
          </div>
          <div className="stat-row">
            <strong>{audioFiles.length}</strong>
            <span>Audio files found</span>
          </div>
        </article>

        <article className="panel">
          <h2>Episode parsing</h2>
          <label className="field">
            <span>Custom regex</span>
            <input
              value={customPattern}
              onChange={(event) => setCustomPattern(event.target.value)}
              placeholder="Example: [Ee]pisode[ _-]?(\d{1,3})"
            />
          </label>
          <p className="hint">
            Capture group 1 should contain the episode number.
          </p>
          {errorMessage ? (
            <p className="error-message">{errorMessage}</p>
          ) : null}
        </article>

        <article className="panel">
          <h2>Audio track metadata</h2>
          <label className="field">
            <span>Track name</span>
            <input
              value={audioTrackName}
              onChange={(event) => setAudioTrackName(event.target.value)}
              placeholder="Example: English, Japanese, Commentary"
            />
          </label>
          <p className="hint">
            This name will appear in the media player when selecting audio
            tracks.
          </p>
        </article>

        <article className="panel">
          <h2>Matching mode</h2>
          <label className="manual-mode-toggle">
            <input
              type="checkbox"
              checked={manualMode}
              onChange={(e) => {
                setManualMode(e.target.checked);
                if (!e.target.checked) {
                  setManualMatches([]);
                }
              }}
            />
            <span>Manual file pairing (no auto-matching)</span>
          </label>
          <p className="hint">
            When enabled, select video and audio files manually without relying
            on episode number detection.
          </p>
        </article>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Auto matching</p>
            <h2>Episode preview</h2>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Episode</th>
                <th>Status</th>
                <th>Video</th>
                <th>Audio</th>
              </tr>
            </thead>
            <tbody>
              {(preview.rows.length ? preview.rows : emptyPreview.rows).map(
                (row) => (
                  <tr key={`${row.episodeNumber}-${row.status}`}>
                    <td>{row.episodeNumber ?? "-"}</td>
                    <td>
                      <span className={`badge badge-${row.status}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>
                      {row.videos.map((file) => file.name).join(", ") || "-"}
                    </td>
                    <td>
                      {row.status === "conflict" ||
                      row.audios.length > 1 ||
                      audioOverrides[row.episodeNumber ?? -1] ? (
                        <select
                          value={row.selectedAudioPath || ""}
                          onChange={(e) => {
                            const episodeNum = row.episodeNumber ?? -1;
                            const newOverrides = { ...audioOverrides };
                            if (e.target.value) {
                              newOverrides[episodeNum] = e.target.value;
                            } else {
                              delete newOverrides[episodeNum];
                            }
                            setAudioOverrides(newOverrides);
                          }}
                          style={{ width: "100%", padding: "0.5rem" }}
                        >
                          <option value="">-- Select audio --</option>
                          {audioFiles.map((file) => (
                            <option key={file.path} value={file.path}>
                              {file.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        row.audios.map((file) => file.name).join(", ") || "-"
                      )}
                    </td>
                  </tr>
                ),
              )}
              {preview.rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty-state">
                    Pick both folders to build a preview.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {manualMode ? (
        <section className="panel">
          <h2>Manual file pairing</h2>
          <div className="manual-pairing">
            {videoFiles.length === 0 || audioFiles.length === 0 ? (
              <p className="hint">
                Pick both season and audio folders to start manual pairing.
              </p>
            ) : (
              <div className="pairing-list">
                {videoFiles.map((video) => {
                  const match = manualMatches.find(
                    (m) => m.videoPath === video.path,
                  ) || { videoPath: video.path, audioPath: "" };
                  return (
                    <div key={video.path} className="pairing-row-item">
                      <div className="video-name">{video.name}</div>
                      <select
                        value={match.audioPath}
                        onChange={(e) => {
                          const existingIdx = manualMatches.findIndex(
                            (m) => m.videoPath === video.path,
                          );
                          const newMatch = {
                            videoPath: video.path,
                            audioPath: e.target.value,
                          };
                          if (existingIdx >= 0) {
                            setManualMatches(
                              manualMatches.map((m, i) =>
                                i === existingIdx ? newMatch : m,
                              ),
                            );
                          } else if (e.target.value) {
                            setManualMatches([...manualMatches, newMatch]);
                          }
                        }}
                        className="audio-select"
                      >
                        <option value="">-- Select audio --</option>
                        {audioFiles.map((audio) => (
                          <option key={audio.path} value={audio.path}>
                            {audio.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section className="panel-grid lower-grid">
        <article className="panel">
          <h2>Unmatched videos</h2>
          {preview.unmatchedVideos.length > 0 ? (
            <label className="skip-unmatched-toggle">
              <input
                type="checkbox"
                checked={ignoreUnmatched}
                onChange={(e) => setIgnoreUnmatched(e.target.checked)}
              />
              <span>Skip these files during processing</span>
            </label>
          ) : null}
          <ul className="file-list">
            {preview.unmatchedVideos.map((file) => (
              <li key={file.path}>
                <strong>{file.name}</strong>
                <span>{file.parse.source ?? "no episode number"}</span>
              </li>
            ))}
            {preview.unmatchedVideos.length === 0 ? (
              <li>No unmatched videos.</li>
            ) : null}
          </ul>
        </article>

        <article className="panel">
          <h2>Unmatched audio</h2>
          <ul className="file-list">
            {preview.unmatchedAudios.map((file) => (
              <li key={file.path}>
                <strong>{file.name}</strong>
                <span>{file.parse.source ?? "no episode number"}</span>
              </li>
            ))}
            {preview.unmatchedAudios.length === 0 ? (
              <li>No unmatched audio files.</li>
            ) : null}
          </ul>
        </article>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">Processing</p>
            <h2>Job Planner</h2>
          </div>
        </div>

        {jobValidation.errors.length > 0 ? (
          <div className="validation-errors">
            <p className="validation-title">⚠️ Cannot start processing:</p>
            <ul>
              {jobValidation.errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {jobValidation.warnings.length > 0 ? (
          <div className="validation-warnings">
            <p className="validation-title">ℹ️ Processing notes:</p>
            <ul>
              {jobValidation.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {jobValidation.isValid && jobPlan.length > 0 ? (
          <>
            <div className="job-stats">
              <div className="stat">
                <strong>{jobPlan.length}</strong>
                <span>Files to process</span>
              </div>
              <div className="stat">
                <strong>{estimateProcessingTime(jobPlan.length)}</strong>
                <span>Estimated time</span>
              </div>
            </div>

            <div className="job-preview">
              <h3>Processing queue</h3>
              <div className="job-list">
                {jobPlan.map((job, idx) => (
                  <div key={`${job.videoPath}-${idx}`} className="job-item">
                    <div className="job-ep">
                      {job.episodeNumber ? `E${job.episodeNumber}` : "—"}
                    </div>
                    <div className="job-files">
                      <div className="job-file">
                        <span className="label">Video:</span>
                        <span className="name">{job.videoName}</span>
                      </div>
                      <div className="job-file">
                        <span className="label">+ Audio:</span>
                        <span className="name">{job.audioName}</span>
                      </div>
                    </div>
                    <div className="job-output">
                      <span className="label">→</span>
                      <span className="name">{job.outputName}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void startProcessing()}
              disabled={!jobValidation.isValid || isProcessing}
              style={{ marginTop: "1.5rem", width: "100%" }}
            >
              {isProcessing ? "Processing..." : "Start Processing"}
            </button>

            {isProcessing && processingProgress ? (
              <div
                className="processing-progress"
                style={{ marginTop: "1.5rem" }}
              >
                <div className="progress-header">
                  <span>
                    {processingProgress.current} / {processingProgress.total}
                  </span>
                  <span className="progress-status">
                    {processingProgress.status === "completed" ? "✓" : "▶"}
                  </span>
                </div>
                <div className="progress-bar">
                  <div
                    className={`progress-fill ${processingProgress.status}`}
                    style={{
                      width: `${(processingProgress.current / processingProgress.total) * 100}%`,
                    }}
                  />
                </div>
                <div className="progress-info">
                  <span className="current-file">
                    {processingProgress.current_file.split(/[/\\]/).pop()}
                  </span>
                  {processingProgress.error_message && (
                    <span className="error-hint">
                      Error: {processingProgress.error_message}
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            {processingErrors.length > 0 ? (
              <div
                className="processing-errors"
                style={{ marginTop: "1.5rem" }}
              >
                <p className="error-title">⚠️ Processing Errors:</p>
                <ul>
                  {processingErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {processingSuccessMessage ? (
              <div
                className="processing-success"
                style={{ marginTop: "1.5rem" }}
              >
                <p className="success-title">✅ Completed</p>
                <p>{processingSuccessMessage}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
