const { readFileSync } = require('node:fs');
const Module = require('node:module');

// Node 渲染测试只需要 CSS Modules 的类名，样式由 Next.js 构建验证。
Module._extensions['.css'] = (module, filename) => {
  const classes = [...readFileSync(filename, 'utf8').matchAll(/\.([a-zA-Z_][\w-]*)/g)];
  module.exports = Object.fromEntries(classes.map(([, name]) => [name, name]));
};
