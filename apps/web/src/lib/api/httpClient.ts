import axios, { AxiosInstance, AxiosError } from 'axios';
import { BACKEND_PROXY_ORIGIN } from './routes';
import { fromAxiosError } from '@/lib/errors/normalize';
import type { AppError } from '@/lib/errors/types';

const createClient = (baseURL: string): AxiosInstance => {
  const client = axios.create({
    baseURL,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  });

  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      // 归一化后挂回错误对象上：调用方的 catch 因此能读码，而不必再解一遍响应体。
      // 这是全应用唯一一个已经存在的 HTTP 汇聚点，判定放在这里只此一处。
      const appError = fromAxiosError(error);
      (error as AxiosError & { appError?: AppError }).appError = appError;

      if (error.response) {
        console.error(
          'API Error:',
          error.response.status,
          appError.errorCode,
          appError.subCode ?? '',
          appError.requestId ?? ''
        );
      } else if (error.request) {
        console.error('Network Error:', appError.errorCode, error.message);
      } else {
        console.error('Request Error:', error.message);
      }
      return Promise.reject(error);
    }
  );

  return client;
};

/** JSON calls to the AI backend, through this app's `/api/backend` passthrough. */
export const httpClient = {
  api: createClient(BACKEND_PROXY_ORIGIN),
};

export interface ApiResponse<T> {
  data: T;
  code: number;
  message?: string;
}
