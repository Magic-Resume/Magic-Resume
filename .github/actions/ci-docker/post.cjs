const { cleanup } = require('./runtime.cjs');

try {
  cleanup();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
