import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { assertSecureConfig, env } from './config/env.js';

assertSecureConfig();

await connectDb();
createApp().listen(env.port, () => console.log(`[api] listening on http://localhost:${env.port}`));
