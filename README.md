# DubMux

![DubMux Banner](icon/banner.png)

DubMux is a desktop app for quickly adding external dubbed audio tracks to TV series and anime episodes.

The main idea: instead of manually processing every file one by one, you select a season folder and an audio folder, and DubMux handles everything in batch mode in just a few clicks.

## Why This App Exists

A common scenario when downloading series from the internet:

- video episodes are in one folder;
- the preferred voice-over or dub is delivered in a separate folder/release;
- manually combining each episode in a media tool is slow and tedious.

DubMux solves this with automation: it matches episodes, shows a preview, lets you resolve conflicts, and then processes the entire queue.

## Key Advantages

- Batch processing for a whole season instead of one file at a time
- Automatic episode matching based on filenames
- Support for non-standard naming via custom regex
- Manual matching mode when auto-matching is not enough
- Adds an external audio track without removing existing audio tracks
- Processing progress with clear success/error notifications
- Ready-to-download Windows binaries via GitHub Releases

## Screenshots

![DubMux Screenshot 1](icon/Screenshot%202026-05-12%20015245.png)

![DubMux Screenshot 2](icon/Screenshot%202026-05-12%20015254.png)

![DubMux Screenshot 3](icon/Screenshot%202026-05-12%20020227.png)

## Core Features

1. Folder selection:
   - Season folder (video files)
   - Audio folder (external dub tracks)
   - Output folder (processed results)
2. Automatic episode parsing and matching
3. Manual conflict resolution and unmatched-file pairing
4. Job planning before processing starts
5. Batch FFmpeg muxing with external audio track injection

## Supported Formats

- Video: `.mkv`, `.mp4`, `.avi`
- Audio: `.aac`, `.m4a`, `.mp3`, `.flac`, `.wav`, `.mka`

## Quick Start (End Users)

1. Download the latest release from GitHub Releases
2. Install the app (Windows installer)
3. Launch DubMux
4. Select your season folder and audio folder
5. Review matches and click Start Processing

## Development

```bash
yarn install
yarn tauri dev
```

Build:

```bash
yarn build
```

## Release pipeline

Release builds are triggered by the GitHub Actions workflow on tags matching `v*`.

Example:

```bash
git tag -a v0.1.1 -m "Release v0.1.1"
git push origin v0.1.1
```

After that, the installer will be published to GitHub Releases.
