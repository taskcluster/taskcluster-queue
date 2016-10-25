#!/usr/bin/env node

const load = require('./build/index.bundle');

// If this file is executed launch component from first argument
load(process.argv[2], {
  process: process.argv[2],
  profile: process.env.NODE_ENV,
})
.catch(err => {
  console.log(err.stack);
  process.exit(1);
});
