import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  buildMatchPreview,
  buildMediaFile,
} from "./features/matching/matching";
import type { MatchPreview, MediaFile } from "./features/matching/types";

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
  const [audioTrackName, setAudioTrackName] =
    useState<string>("External Audio");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const preview = useMemo(
    () => buildMatchPreview(videoFiles, audioFiles, customPattern),
    [audioFiles, customPattern, videoFiles],
  );

  useEffect(() => {
    if (preview.invalidCustomPattern) {
      setErrorMessage(`Regex error: ${preview.invalidCustomPattern}`);
      return;
    }

    setErrorMessage("");
  }, [preview.invalidCustomPattern]);

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
                      {row.audios.map((file) => file.name).join(", ") || "-"}
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

      <section className="panel-grid lower-grid">
        <article className="panel">
          <h2>Unmatched videos</h2>
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
    </main>
  );
}
