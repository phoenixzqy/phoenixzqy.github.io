import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const catalog = JSON.parse(readFileSync(new URL("../apps/catalog.json", import.meta.url), "utf8"));
export const packageBytes = Buffer.from("Test-only release fixture. This is not an application package.");
export const packageHash = createHash("sha256").update(packageBytes).digest("hex");

export function releaseFixture(appId = "bplayer") {
  return {
    schemaVersion: 1,
    appId,
    release: {
      version: "1.2.3+4",
      channel: "preview",
      publishedAt: "2026-09-22T12:00:00Z",
      notes: ["Test-only release metadata.", "Keeps source repositories private."],
      assets: [
        {
          name: "Windows preview",
          platform: "windows",
          architecture: "x64",
          file: "BPlayer-1.2.3-windows-x64.zip",
          bytes: packageBytes.length,
          sha256: packageHash,
          signing: "unsigned",
          installNotes: "Test fixture only. Extract the full bundle.",
        },
        {
          name: "Android preview",
          platform: "android",
          architecture: "arm64",
          file: "BPlayer-1.2.3-android.apk",
          url: "https://github.com/phoenixzqy/phoenixzqy.github.io/releases/download/bplayer-v1.2.3/BPlayer-1.2.3-android.apk",
          bytes: 130 * 1024 * 1024,
          sha256: "a".repeat(64),
          signing: "self-signed",
          installNotes: "Test fixture only. Follow your device policies.",
        },
      ],
    },
  };
}
