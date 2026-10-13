module.exports = {
  apps: [
    {
      name: "nb24-api",
      cwd: "/srv/namaste-bharat/backend",
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production", PORT: 4000 },
      max_memory_restart: "700M",
      time: true,
    },
    {
      name: "nb24-web",
      cwd: "/srv/namaste-bharat",
      script: ".output/server/index.mjs",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production", PORT: 3000, HOST: "127.0.0.1" },
      max_memory_restart: "700M",
      time: true,
    },
  ],
};
