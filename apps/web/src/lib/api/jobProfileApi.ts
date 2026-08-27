import { httpClient, type ApiResponse } from './httpClient';
import { AGENT_ROUTES } from './routes';

export interface JobProfile {
  /** 固定小节的 markdown。注进每一轮对话的就是这段。 */
  content: string;
  /**
   * `pending` = 答案已经存下来了，正文还没合成出来（正在跑，或者上一次失败了）。
   *
   * 与「压根没有画像」（`none`）**必须分开**：pending 的人不该再被拽回问卷重填一遍，
   * 他要的是重试一次合成。
   */
  status: 'ready' | 'pending' | 'none';
  /**
   * 当初那份问答，原样带回来——重走引导时用它预填。
   *
   * 存的是**文案**不是选项 slug（合成画像的模型要读得懂），所以向导预填前要反查一次；
   * 查不到的原样当自定义项留着（用户自己填的，或上次用另一种语言选的）。
   */
  answers: Record<string, string[]>;
  /** 每次落库 +1。画像变得不对时，它是「哪一步改坏的」唯一线索。 */
  revision: number;
  updatedAt: string;
  /** 停用 ≠ 删除：关掉只是不再注进 prompt，内容还在。 */
  enabled: boolean;
}

const unwrap = <T>(response: { data: ApiResponse<T> }): T => response.data.data;

export const jobProfileApi = {
  /**
   * 读画像。没有画像回 `null`。
   *
   * 服务端回的是 200 + `status: 'none'`，**不是 404**——「还没填」是这个接口最常见的
   * 正常答案，用错误码表达它只会让每个新用户在服务端日志里留一条 WARN。
   *
   * 真的错误（401 / 网络断）照旧抛出去，调用方必须能把它和「没填」分开：前者该弹引导，
   * 后者只说明这次没问到，而**拿不到答案就弹引导 = 每次网络抖动都盘问一遍**。
   */
  async get(): Promise<JobProfile | null> {
    const profile = unwrap(
      await httpClient.agent.get<ApiResponse<JobProfile>>(
        AGENT_ROUTES.jobProfile.get,
      ),
    );
    return profile.status === 'none' ? null : profile;
  },

  /** 引导交卷：答案 → 画像。答案给的是**文案**不是选项 slug（见后端 DTO）。 */
  async generate(
    answers: Record<string, string[]>,
    locale: 'zh' | 'en',
  ): Promise<JobProfile> {
    return unwrap(
      await httpClient.agent.post<ApiResponse<JobProfile>>(
        AGENT_ROUTES.jobProfile.generate,
        { answers, locale },
      ),
    );
  },

  /** 用上一次的答案再合成一份，不需要用户重填问卷。 */
  async regenerate(locale: 'zh' | 'en'): Promise<JobProfile> {
    return unwrap(
      await httpClient.agent.post<ApiResponse<JobProfile>>(
        AGENT_ROUTES.jobProfile.regenerate,
        { locale },
      ),
    );
  },

  /**
   * 一句话改写 → **候选正文，不落库**。
   *
   * 落不落由用户看过 diff 之后决定。画像每一轮都注进 prompt，写坏了污染的是此后所有
   * 对话，不是一次回答——这里比别处更该先看后落。
   */
  async draft(
    instruction: string,
    locale: 'zh' | 'en',
  ): Promise<{ content: string }> {
    return unwrap(
      await httpClient.agent.patch<ApiResponse<{ content: string }>>(
        AGENT_ROUTES.jobProfile.root,
        { instruction, locale },
      ),
    );
  },

  /** 落库。手改与「应用这次改写」走同一个口。 */
  async save(content: string): Promise<JobProfile> {
    return unwrap(
      await httpClient.agent.put<ApiResponse<JobProfile>>(
        AGENT_ROUTES.jobProfile.root,
        { content },
      ),
    );
  },

  async setEnabled(enabled: boolean): Promise<void> {
    await httpClient.agent.patch(AGENT_ROUTES.jobProfile.settings, { enabled });
  },

  async remove(): Promise<void> {
    await httpClient.agent.delete(AGENT_ROUTES.jobProfile.root);
  },
};
