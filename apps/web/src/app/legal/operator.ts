/**
 * Who is legally operating this deployment.
 *
 * Kept as one module rather than sprinkled through the policy pages, because
 * every one of these is a fact about a company that only that company can
 * state, and a wrong one is worse than a missing one. `null` renders as an
 * explicit "待补充" marker instead of quietly inventing a value — a fabricated
 * ICP number or company name in a published policy is a bigger problem than an
 * obviously incomplete page.
 *
 * Filing numbers in particular CANNOT be guessed: 《互联网信息服务管理办法》
 * requires the real ICP record, and 《生成式人工智能服务管理暂行办法》第十七条
 * requires the algorithm filing for a service with public-opinion attributes.
 * Both are issued by the authorities after an application.
 */
export interface OperatorFacts {
  /** 运营主体全称，与营业执照一致。 */
  legalName: string | null;
  /** 统一社会信用代码。 */
  creditCode: string | null;
  /** ICP 备案号，如「京ICP备00000000号-1」。 */
  icpNumber: string | null;
  /** 生成式 AI 算法备案号（网信办公示的编号）。 */
  algorithmFilingNumber: string | null;
  /** 隐私与数据相关问题的联系邮箱。 */
  privacyEmail: string;
  /** 通用支持邮箱。 */
  supportEmail: string;
  /** 注册或办公地址。 */
  address: string | null;
  /** 政策的最后实质更新日期，YYYY-MM-DD。 */
  updatedAt: string;
}

export const OPERATOR: OperatorFacts = {
  legalName: null,
  creditCode: null,
  icpNumber: null,
  algorithmFilingNumber: null,
  privacyEmail: 'privacy@magic-resume.cn',
  supportEmail: 'support@magic-resume.cn',
  address: null,
  updatedAt: '2026-08-02',
};

/** Render a fact, or a visible placeholder when it has not been filled in. */
export function fact(value: string | null): string {
  return value ?? '【待补充】';
}
