#!/usr/bin/env node
import { initializeDatabase, runMigrations, closeDatabase } from './connection.js';

async function main() {
  console.log('Starting migrations...');
  initializeDatabase();
  await runMigrations();
  await closeDatabase();
  console.log('✓ Migrations complete');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('✗ Migration failed:', e);
    process.exit(1);
  });
