import { execFileSync } from "node:child_process";

execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  env: {
    ...process.env,
    NITRO_PRESET: "vercel",
    VITE_FRONTEND_ONLY: process.env.VITE_FRONTEND_ONLY ?? (process.env.VITE_API_URL ? "false" : "true"),
  },
  stdio: "inherit",
});
