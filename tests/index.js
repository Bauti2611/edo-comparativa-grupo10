'use strict';
/**
 * Aggregator so that `node --test web/tests/` works: since Node 22 a directory
 * argument is resolved as a module (this file), not searched for tests.
 * Running `node --test` with no arguments, or with a glob such as
 * "web/tests/*.test.js", also works and does not load this file twice.
 */
const fs = require('node:fs');
const path = require('node:path');

for (const file of fs.readdirSync(__dirname).sort()) {
  if (file.endsWith('.test.js')) require(path.join(__dirname, file));
}
