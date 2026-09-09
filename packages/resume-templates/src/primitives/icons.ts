import { ResumeIconNodes } from '@magic-resume/icons';
import type { PdfIconNode } from '../pdf/PdfHugeIcon';

const {
  award: AwardNode,
  briefcase: BriefcaseNode,
  certificate: CertificateNode,
  code: CodeNode,
  file: FileNode,
  folder: FolderNode,
  github: GithubNode,
  globe: GlobeNode,
  graduation: GraduationNode,
  heart: HeartNode,
  languages: LanguagesNode,
  lightbulb: LightbulbNode,
  location: MapPinNode,
  mail: MailNode,
  phone: PhoneNode,
  rocket: RocketNode,
  sparkles: SparklesNode,
  star: StarNode,
  target: TargetNode,
  trophy: TrophyNode,
  user: UserNode,
  wrench: WrenchNode,
} = ResumeIconNodes;

/**
 * 图标：一个名字 → **两种形态**。
 *
 * ## 为什么必须这样
 *
 * 两个后端要的东西根本不同：DOM 要一个 React 组件，
 * PDF 要一份 Hugeicons 路径数据（本质是节点数组）。
 * 此前它们各有各的表——`sectionIcons.ts` 一份给屏幕，`MagicResumePdfDocument`
 * 里另一份给 PDF——于是原语层的 `Icon` 节点把屏幕那份直接喂给了 PDF，
 * **导出当场抛 `icon.map is not a function`**。
 *
 * 那个 bug 藏了很久：`as never` 把类型不匹配压了下去，而一致性测试只遍历元素树、
 * 从不真渲染，所以看不见。真渲染一次就现形。
 *
 * 这个文件是那两份表合一后的结果。加图标只需在这里加一行，两个后端同时拿到。
 *
 * ## 为什么克制
 *
 * 这个集合是刻意小的：给用户一个四百个图标的选择器，比给十六个真正对应简历分区的
 * 更难用。新增的门槛是「简历上真的会出现这个东西吗」，不是「图标库里有」。
 * 这一轮加的三个（phone / mail / github）来自联系方式行——那是简历表头的实际构成。
 */

/** PDF 侧的路径数据。DOM 侧的 React 组件仍从 `sectionIcons.ts` 取（那是编辑器共用的那份）。 */
export const ICON_NODES: Record<string, PdfIconNode> = {
  briefcase: BriefcaseNode,
  graduation: GraduationNode,
  folder: FolderNode,
  wrench: WrenchNode,
  languages: LanguagesNode,
  award: AwardNode,
  certificate: CertificateNode,
  trophy: TrophyNode,
  user: UserNode,
  globe: GlobeNode,
  code: CodeNode,
  rocket: RocketNode,
  lightbulb: LightbulbNode,
  target: TargetNode,
  star: StarNode,
  sparkles: SparklesNode,
  heart: HeartNode,
  file: FileNode,
  // 联系方式行用的三个。
  phone: PhoneNode,
  mail: MailNode,
  github: GithubNode,
  location: MapPinNode,
};

export const iconNodeByName = (name: string): PdfIconNode | undefined => ICON_NODES[name];

/** 有没有这个图标。校验器用它，好在**存模板时**就告诉作者名字写错了。 */
export const hasIcon = (name: string): boolean => name in ICON_NODES;
