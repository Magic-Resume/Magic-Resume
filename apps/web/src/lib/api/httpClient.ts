import axios, { AxiosInstance, AxiosError } from 'axios';
import { API_ORIGIN } from './routes';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';
import { fromAxiosError } from '@/lib/errors/normalize';
import type { AppError } from '@/lib/errors/types';

// Mutable getter — set once by HttpClientProvider at app startup
let _getToken: (() => Promise<string | null>) | null = null;

export const configureHttpClient = (getter: () => Promise<string | null>) => {
  _getToken = getter;
};

/** Call directly when axios interceptor isn't available (e.g. raw fetch streams) */
export const getAuthToken = async (): Promise<string | null> => {
  if (!_getToken) return null;
  try {
    const token = await _getToken();
    if (token) _lastKnownToken = token;
    return token;
  } catch {
    return null;
  }
};

// 最近一次成功获取的 token。pagehide 时页面随时会死,等不起异步取 token ——
// keepalive 退出送达(见 resumeApi.syncResumeKeepalive)同步读这份缓存,尽力而为:
// Clerk token 有效期约 60s,编辑会话中几乎总有近期请求刷新过它;过期则请求 401,
// 退化为"下次会话再同步",与无此机制时一致。
let _lastKnownToken: string | null = null;

/** Synchronous best-effort token for exit-time keepalive requests. */
export const getCachedAuthToken = (): string | null => _lastKnownToken;

const createClient = (baseURL: string): AxiosInstance => {
  const client = axios.create({
    baseURL,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  });

  client.interceptors.request.use(async (config) => {
    if (!config.headers.Authorization) {
      const token = await getAuthToken(); // 内部同时刷新 _lastKnownToken 缓存
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
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
      // No-op in the open-source build. In the commercial build this is the
      // only place server errors become visible without also throwing in the
      // UI; the reporter decides what is worth reporting and redacts the URL.
      appLifecycle.reportApiError(error);
      return Promise.reject(error);
    }
  );

  return client;
};

// Both share the single API origin. Two instances are kept for call-site semantics
// (CRUD vs AI).
export const httpClient = {
  api:   createClient(API_ORIGIN),
  agent: createClient(API_ORIGIN),
};

export interface ApiResponse<T> {
  data: T;
  code: number;
  message?: string;
}
