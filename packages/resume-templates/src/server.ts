/**
 * 服务端专用入口（`@magic-resume/resume-templates/server`）。
 *
 * 这里的东西都吃 `renderToBuffer`——**Node 专用**。从主入口导出会把 react-pdf 的
 * Node 路径拖进浏览器包，白白增加体积，而且浏览器里根本调不通（浏览器侧要用
 * `pdf().toBlob()`）。所以单开一个入口，让「只能在服务端跑」变成 import 路径上
 * 看得见的一件事，而不是运行到一半才发现。
 */
export { checkOverflow, createNodeMeasurer, pageCountOf } from './primitives/overflow';
export type { OverflowReport, OverflowCheckOptions } from './primitives/overflow';
export { renderTreeDocument } from './primitives/pdf/document';
export type { TreeDocumentOptions } from './primitives/pdf/document';
// 复刻管线本身是纯函数，已移到 `/core`——它不该被归类成「服务端专用」。
// 这里只留真正吃 `renderToBuffer` 的东西。
