import Axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";

/**
 * Shared axios instance used by the Orval-generated client (via `customAxios`).
 * Auth header + token-refresh interceptors are installed in `interceptors.ts`
 * (called once at app startup). baseURL is "" so requests are same-origin —
 * Vite proxies `/api` to Django in dev, and Django serves the SPA in prod.
 */
// withCredentials so the httpOnly refresh cookie is sent/received (flows are same-origin).
export const AXIOS_INSTANCE = Axios.create({ baseURL: "", withCredentials: true });

export const customAxios = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  const source = Axios.CancelToken.source();
  const promise = AXIOS_INSTANCE({
    ...config,
    ...options,
    cancelToken: source.token,
  }).then((response: AxiosResponse<T>) => response.data);

  // Orval's cancellation hook for react-query.
  (promise as Promise<T> & { cancel?: () => void }).cancel = () =>
    source.cancel("Request canceled");

  return promise;
};

export default customAxios;
