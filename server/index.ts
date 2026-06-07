import { createApp } from './app.js';
import { initializeDatabase, runMigrations, closeDatabase } from './db/connection.js';
import { env } from './config/env.js';

async function main() {
  console.log('============================================================');
  console.log('Starting edgr-study-planner API...');
  console.log(`  env=${env.nodeEnv} port=${env.port}`);
  console.log(`  ollama=${env.ollamaHost} chat=${env.ollamaChatModel} embed=${env.ollamaEmbedModel}`);
  console.log('============================================================');

  initializeDatabase();
  await runMigrations();

  const app = createApp();
  const server = app.listen(env.port, () => console.log(`✓ API listening on :${env.port}`));

  const shutdown = async () => {
    console.log('Shutting down...');
    server.close();
    await closeDatabase();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error('Fatal startup error:', e);
  process.exit(1);
});
