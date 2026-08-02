import type { Metadata } from 'next';
import Link from 'next/link';
import { OPERATOR } from '../operator';

export const metadata: Metadata = {
  title: '退款政策 · Magic Resume',
  description:
    'Magic Resume 的退款条件、申请方式与处理时限，以及退款后额度与订阅的处理方式。',
};

export default function RefundPolicyPage() {
  return (
    <>
      <div className="legal-draft-notice">
        <strong>本文的商务口径尚待确认，且未经法务复核。</strong>
        第 1 节的「7 天无理由」窗口与「已使用则不适用」的判定标准是按行业惯例拟定的，
        需要你确认是否就是要卖的条件；确认后同步修改本页与收银台文案，两处必须一致。
      </div>

      <h1>退款政策</h1>
      <p>
        我们希望你付的每一分钱都值。如果不值，这一页说明在什么情况下可以退、怎么退、多久到账。
      </p>

      <h2>1. 什么情况可以退</h2>

      <h3>1.1 七天内、未实质使用</h3>
      <p>
        自支付成功起 <strong>7 个自然日内</strong>，若你尚未实质使用所购买的付费能力
        （即购买后没有发起过消耗额度的 AI 请求），可以申请全额退款。
      </p>

      <h3>1.2 我们的问题</h3>
      <p>出现下列情况，无论是否超过 7 天、是否已经使用，都可以申请全额或按比例退款：</p>
      <ul>
        <li>服务发生我们责任范围内的长时间中断，且我们未能在合理时间内恢复；</li>
        <li>你购买的付费能力因我们的原因无法提供；</li>
        <li>重复扣款、金额错误等计费错误。</li>
      </ul>

      <h3>1.3 一般不予退款的情况</h3>
      <ul>
        <li>
          <strong>已实质使用的部分</strong>：AI 请求一经发起，算力成本即已产生，
          这部分不可退。
        </li>
        <li>
          <strong>已过 7 天的周期性订阅</strong>：可以随时取消以停止后续扣款，
          但当期费用不退，当期权益保留到期末。
        </li>
        <li>
          因违反<Link href="/legal/terms">用户协议</Link>被终止服务的账号。
        </li>
        <li>
          对 AI 生成内容的质量不满意——AI 的输出具有不确定性，这一点在购买前已明确告知。
        </li>
      </ul>

      <h2>2. 怎么申请</h2>
      <p>
        发邮件到{' '}
        <a href={`mailto:${OPERATOR.supportEmail}`}>{OPERATOR.supportEmail}</a>，
        标题写「退款申请」，正文请包含：
      </p>
      <ol>
        <li>你的账号邮箱；</li>
        <li>订单号或支付流水号（在账单页可以看到）；</li>
        <li>退款原因。</li>
      </ol>
      <p>
        我们会在 <strong>3 个工作日内</strong>回复处理结果。
      </p>

      <h2>3. 多久到账</h2>
      <p>
        审核通过后，我们会<strong>原路退回</strong>到你支付时使用的账户。到账时间取决于支付渠道：
      </p>
      <table>
        <thead>
          <tr>
            <th>支付方式</th>
            <th>预计到账</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>支付宝</td>
            <td>1–3 个工作日</td>
          </tr>
          <tr>
            <td>PayPal（余额）</td>
            <td>1–3 个工作日</td>
          </tr>
          <tr>
            <td>PayPal（信用卡 / 借记卡）</td>
            <td>5–30 个工作日，取决于发卡行</td>
          </tr>
        </tbody>
      </table>
      <p>我们无法加快支付渠道与银行侧的处理速度。</p>

      <h2>4. 退款之后会发生什么</h2>
      <p>为了避免歧义，这里写清楚退款生效后账号的状态：</p>
      <ul>
        <li>
          <strong>额度会被收回</strong>：该笔订单赠送或充值的额度将从你的账户中扣除。
          如果你在退款前已经用掉了其中一部分，账户余额可能变为负数，
          需要重新购买后才能继续使用付费能力。
        </li>
        <li>
          <strong>订阅会被终止</strong>：若退的是订阅订单，对应的订阅立即结束，
          账号回落至免费额度。
        </li>
        <li>
          <strong>你的简历不受影响</strong>：退款只涉及付费能力，
          不会删除你的任何简历数据。
        </li>
      </ul>

      <h2>5. 争议</h2>
      <p>
        如果你对处理结果有异议，可以回复原邮件说明理由，我们会再复核一次。
        我们更希望把问题在这里解决——直接向支付渠道发起争议或拒付，
        通常会让处理周期变得更长。
      </p>

      <h2>6. 联系我们</h2>
      <p>
        退款与账单：
        <a href={`mailto:${OPERATOR.supportEmail}`}>{OPERATOR.supportEmail}</a>
      </p>
    </>
  );
}
