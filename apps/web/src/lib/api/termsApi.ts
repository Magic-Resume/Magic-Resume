import { httpClient, type ApiResponse } from './httpClient';
import { API_ROUTES } from './routes';

export interface TermsStatus {
  /** 现在还需不需要同意。**由服务端判定**，不是把版本号发下来让前端比对。 */
  required: boolean;
  version: string;
  acceptedAt: string | null;
  /** 有旧记录 = 条款改版了，不是「你从没同意过」。文案要能区分这两句话。 */
  reconsent: boolean;
}

const unwrap = <T>(response: { data: ApiResponse<T> }): T => response.data.data;

export const termsApi = {
  async status(): Promise<TermsStatus> {
    return unwrap(
      await httpClient.api.get<ApiResponse<TermsStatus>>(
        API_ROUTES.users.terms,
      ),
    );
  },

  /** 记下同意。时间戳由服务端打——我们只报版本。 */
  async accept(version: string): Promise<void> {
    await httpClient.api.post(API_ROUTES.users.terms, { version });
  },
};
