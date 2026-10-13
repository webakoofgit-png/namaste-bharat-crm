import { app } from "./app.js";
import { db } from "./db.js";
const server = app.listen(Number(process.env.PORT || 4000), "127.0.0.1", () =>
  console.log(`Namaste Bharat API running at http://localhost:${process.env.PORT || 4000}`),
);
async function stop() {
  server.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
