/**
 * WebGPU 的类型不在 `lib.dom` 里，而 `@webgpu/types` 不在 `@types/` 命名空间下，
 * 所以不会被自动纳入。这里用三斜线引用把它挂上——比在 tsconfig 里写 `types: [...]`
 * 安全：那个字段一旦出现就会**关掉**其余 `@types/*` 的自动引入。
 */
/// <reference types="@webgpu/types" />
