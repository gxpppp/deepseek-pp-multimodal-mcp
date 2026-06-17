#!/usr/bin/env node
import { main } from '../lib/installer.mjs';

main().catch((err) => {
  console.error(`\nMultimodal MCP failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
