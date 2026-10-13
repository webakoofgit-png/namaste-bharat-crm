import { execFileSync } from "node:child_process";

execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  env: { ...process.env, NITRO_PRESET: "vercel" },
  stdio: "inherit",
});
