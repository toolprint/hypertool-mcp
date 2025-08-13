/**
 * DXT Package Loader
 * Phase 0: Basic ZIP extraction and process spawning
 */

import { tmpdir } from "os";
import { join, dirname } from "path";
import { createReadStream, createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { randomBytes } from "crypto";
import * as unzipper from "unzipper";
import { DxtManifest } from "../config/dxt-config.js";
import { parseManifest } from "./manifest.js";

/**
 * Extract DXT ZIP file to specified directory (or temp if not specified)
 */
export async function extractDxt(
  dxtPath: string,
  targetDir?: string
): Promise<string> {
  const extractDir =
    targetDir ||
    (() => {
      // Create unique temp directory as fallback
      const randomId = randomBytes(8).toString("hex");
      return join(tmpdir(), `hypertool-dxt-${randomId}`);
    })();

  await mkdir(extractDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const promises: Promise<void>[] = [];

    createReadStream(dxtPath)
      .pipe(unzipper.Parse())
      .on("entry", (entry) => {
        const filePath = join(extractDir, entry.path);
        const type = entry.type;

        if (type === "File") {
          promises.push(
            new Promise(async (fileResolve, fileReject) => {
              try {
                // Ensure parent directory exists
                await mkdir(dirname(filePath), { recursive: true });
                entry
                  .pipe(createWriteStream(filePath))
                  .on("finish", fileResolve)
                  .on("error", fileReject);
              } catch (error) {
                fileReject(error);
              }
            })
          );
        } else if (type === "Directory") {
          promises.push(mkdir(filePath, { recursive: true }).then(() => {}));
        } else {
          entry.autodrain();
        }
      })
      .on("close", async () => {
        try {
          await Promise.all(promises);
          resolve(extractDir);
        } catch (error) {
          reject(error);
        }
      })
      .on("error", reject);
  });
}

/**
 * Load DXT package and return manifest + extract directory
 */
export async function loadDxt(
  dxtPath: string
): Promise<{ manifest: DxtManifest; extractDir: string }> {
  const extractDir = await extractDxt(dxtPath);
  const manifest = await parseManifest(extractDir);

  return { manifest, extractDir };
}
