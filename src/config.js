import fs from "node:fs";
import path from "node:path";

function loadDotEnvFile() {
  const envPath = path.resolve(".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function loadConfig() {
  loadDotEnvFile();

  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) {
    throw new Error("ALPHAVANTAGE_API_KEY is missing. Add it to .env or your environment.");
  }

  return {
    apiKey,
    baseUrl: process.env.ALPHAVANTAGE_BASE_URL ?? "https://www.alphavantage.co/query"
  };
}
