import { createApp } from "./create-app.js";
import { getEnv } from "./config/env.js";

const app = await createApp();
await app.listen(getEnv().API_PORT, "0.0.0.0");
