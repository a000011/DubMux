import { describe, expect, it } from "vitest";
import {
  buildMatchPreview,
  buildMediaFile,
  extractEpisodeNumber,
} from "../features/matching/matching";

describe("extractEpisodeNumber", () => {
  it("extracts episodes from common season/episode names", () => {
    expect(extractEpisodeNumber("Show.S01E07.1080p.mkv")).toMatchObject({
      episodeNumber: 7,
      source: "season-episode",
    });
    expect(extractEpisodeNumber("Show 1x12 dub.aac")).toMatchObject({
      episodeNumber: 12,
      source: "x-format",
    });
  });

  it("does not match resolution numbers in filenames", () => {
    expect(
      extractEpisodeNumber(
        "Azumanga Daioh - 01 [BD-DVDRip 1440x1080 x265 FLAC].mkv",
      ),
    ).toMatchObject({
      episodeNumber: 1,
      source: "numeric-token",
    });
    expect(extractEpisodeNumber("Show 1920x1080 - 08.mkv")).toMatchObject({
      episodeNumber: 8,
      source: "numeric-token",
    });
  });

  it("allows a custom regex to override built-in parsing", () => {
    expect(
      extractEpisodeNumber("Episode-014-track.flac", "Episode-(\\d+)"),
    ).toMatchObject({
      episodeNumber: 14,
      source: "custom",
    });
  });

  it("surfaces regex errors", () => {
    expect(extractEpisodeNumber("Episode 01.mp3", "(")).toMatchObject({
      episodeNumber: null,
      source: null,
    });
  });
});

describe("buildMatchPreview", () => {
  it("matches one video with one audio by episode number", () => {
    const video = buildMediaFile("C:/season/Show.S01E01.mkv");
    const audio = buildMediaFile("C:/audio/Episode 01.mp3");

    if (!video || !audio) {
      throw new Error("Failed to build test files");
    }

    const preview = buildMatchPreview([video], [audio]);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({
      episodeNumber: 1,
      status: "matched",
    });
  });

  it("keeps files without episode numbers in unmatched lists", () => {
    const video = buildMediaFile("C:/season/OVA bonus.mkv");
    const audio = buildMediaFile("C:/audio/soundtrack.flac");

    if (!video || !audio) {
      throw new Error("Failed to build test files");
    }

    const preview = buildMatchPreview([video], [audio]);
    expect(preview.rows).toHaveLength(0);
    expect(preview.unmatchedVideos).toHaveLength(1);
    expect(preview.unmatchedAudios).toHaveLength(1);
  });
});
