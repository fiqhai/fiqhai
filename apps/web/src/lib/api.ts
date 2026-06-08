const DEFAULT_API_BASE_URL = "https://usmanbhat-fiqh-ai-api.hf.space";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || DEFAULT_API_BASE_URL;

/** Same-origin proxy path for browser requests (see next.config.ts rewrites). */
export const CLIENT_API_BASE_URL = "/api";
