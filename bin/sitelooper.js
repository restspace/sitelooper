#!/usr/bin/env node
import('../dist/cli.js').catch((err) => {
  console.error('sitelooper: failed to start. The install looks incomplete; try reinstalling with `npm install -g sitelooper`.');
  console.error(err?.stack || String(err));
  process.exit(2);
});
