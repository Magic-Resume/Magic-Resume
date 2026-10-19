const { setup } = require('./runtime.cjs');

setup().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
