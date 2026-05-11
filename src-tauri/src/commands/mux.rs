use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use tauri::{Emitter, AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MuxJob {
    pub video_path: String,
    pub audio_path: String,
    pub output_path: String,
    pub audio_track_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingProgress {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
    pub status: String, // "processing", "completed", "error"
    pub error_message: Option<String>,
}

fn resolve_binary_path(app_handle: &AppHandle, exe_name: &str) -> String {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        candidates.push(resource_dir.join("bin").join(exe_name));
        candidates.push(resource_dir.join(exe_name));
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join(exe_name));
            candidates.push(exe_dir.join("resources").join("bin").join(exe_name));
            candidates.push(exe_dir.join("..").join("Resources").join("bin").join(exe_name));
        }
    }

    if let Some(found) = candidates.into_iter().find(|path| path.exists()) {
        return found.to_string_lossy().into_owned();
    }

    // Fallback to PATH (works in dev if user has ffmpeg installed globally).
    exe_name.to_string()
}

fn mux_single_file(job: &MuxJob, ffmpeg_exe: &str, ffprobe_exe: &str) -> Result<(), String> {
    let video_path = &job.video_path;
    let audio_path = &job.audio_path;
    let output_path = &job.output_path;
    let audio_track_name = &job.audio_track_name;

    // Check if output already exists
    if PathBuf::from(output_path).exists() {
        return Err(format!("Output file already exists: {}", output_path));
    }

    // Preserve all streams from source video and append one external audio track.
    // Then encode only the appended audio stream as AAC and set its title metadata.
    let existing_audio_streams = count_audio_streams(video_path, ffprobe_exe)?;
    let new_audio_index = existing_audio_streams;

    let output = Command::new(ffmpeg_exe)
        .arg("-i")
        .arg(video_path)
        .arg("-i")
        .arg(audio_path)
        .arg("-map")
        .arg("0")
        .arg("-map")
        .arg("1:a:0")
        .arg("-c")
        .arg("copy")
        .arg(format!("-c:a:{}", new_audio_index))
        .arg("aac")
        .arg(format!("-metadata:s:a:{}", new_audio_index))
        .arg(format!("title={}", audio_track_name))
        .arg("-shortest")
        .arg("-y") // Overwrite output file
        .arg(output_path)
        .output()
        .map_err(|e| {
            format!(
                "Failed to execute ffmpeg ({}): {}. Ensure ffmpeg is bundled or installed in PATH.",
                ffmpeg_exe, e
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg failed: {}", stderr));
    }

    Ok(())
}

fn count_audio_streams(video_path: &str, ffprobe_exe: &str) -> Result<usize, String> {
    let output = Command::new(ffprobe_exe)
        .arg("-v")
        .arg("error")
        .arg("-select_streams")
        .arg("a")
        .arg("-show_entries")
        .arg("stream=index")
        .arg("-of")
        .arg("csv=p=0")
        .arg(video_path)
        .output()
        .map_err(|e| {
            format!(
                "Failed to execute ffprobe ({}): {}. Ensure ffprobe is bundled or installed in PATH.",
                ffprobe_exe, e
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let code = output.status.code().map_or_else(
            || "terminated by signal".to_string(),
            |c| c.to_string(),
        );
        return Err(format!(
            "FFprobe failed (bin: {}, code: {}). video: {}. stderr: {} stdout: {}",
            ffprobe_exe,
            code,
            video_path,
            stderr.trim(),
            stdout.trim()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let count = stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .count();

    Ok(count)
}

#[tauri::command]
pub async fn process_mux_jobs(
    jobs: Vec<MuxJob>,
    app_handle: AppHandle,
) -> Result<Vec<String>, String> {
    let total = jobs.len();
    let mut results = Vec::new();
    let mut errors = Vec::new();

    let ffmpeg_exe = resolve_binary_path(&app_handle, "ffmpeg.exe");
    let ffprobe_exe = resolve_binary_path(&app_handle, "ffprobe.exe");

    // Get the main window for emitting events
    let window = app_handle.get_webview_window("main")
        .ok_or("Failed to get main window")?;

    // Process jobs sequentially for now (can parallelize later)
    for (idx, job) in jobs.iter().enumerate() {
        let progress = ProcessingProgress {
            current: idx + 1,
            total,
            current_file: job.output_path.clone(),
            status: "processing".to_string(),
            error_message: None,
        };

        // Send progress update to frontend
        let _ = window.emit("mux_progress", &progress);

        let job_owned = job.clone();
        let ffmpeg_owned = ffmpeg_exe.clone();
        let ffprobe_owned = ffprobe_exe.clone();
        let mux_result = tauri::async_runtime::spawn_blocking(move || {
            mux_single_file(&job_owned, &ffmpeg_owned, &ffprobe_owned)
        })
            .await
            .map_err(|e| format!("Mux worker failed: {}", e))?;

        match mux_result {
            Ok(_) => {
                results.push(job.output_path.clone());

                let completed = ProcessingProgress {
                    current: idx + 1,
                    total,
                    current_file: job.output_path.clone(),
                    status: "completed".to_string(),
                    error_message: None,
                };
                let _ = window.emit("mux_progress", &completed);
            }
            Err(e) => {
                errors.push(format!("{}: {}", job.output_path, e));

                let error_progress = ProcessingProgress {
                    current: idx + 1,
                    total,
                    current_file: job.output_path.clone(),
                    status: "error".to_string(),
                    error_message: Some(e),
                };
                let _ = window.emit("mux_progress", &error_progress);
            }
        }
    }

    if errors.is_empty() {
        Ok(results)
    } else {
        Err(format!("Processing completed with errors:\n{}", errors.join("\n")))
    }
}
