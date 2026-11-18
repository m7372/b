export const DEFAULT_WORKER_ORIGIN = "https://b.m737217130.workers.dev";
export const WORKER_TOKEN_KEY = "cinema_worker_token";
export const WORKER_ORIGIN_KEY = "cinema_worker_origin";

export type MediaKind = "live" | "movie" | "series";
export type XtreamCategory = { category_id: string; category_name: string; parent_id?: number };
export type StreamVariant = { id?: string | number; url?: string; quality?: string; name?: string; height?: number; bitrate?: number; container_extension?: string };
export type XtreamItem = {
  stream_id?: string | number;
  series_id?: string | number;
  episode_id?: string | number;
  id?: string | number;
  name?: string;
  title?: string;
  stream_icon?: string;
  cover?: string;
  series_cover?: string;
  category_id?: string | number;
  category_name?: string;
  container_extension?: string;
  year?: string | number;
  rating?: string | number;
  plot?: string;
  sources?: StreamVariant[];
  qualities?: StreamVariant[];
  [key: string]: unknown;
};

export function configuredOrigin() {
  if (typeof window === "undefined") return DEFAULT_WORKER_ORIGIN;
  return (localStorage.getItem(WORKER_ORIGIN_KEY) || DEFAULT_WORKER_ORIGIN).replace(/\/+$/, "");
}

export class XtreamClient {
  constructor(readonly origin: string, readonly token: string) {}

  private async request<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(path, `${this.origin}/`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const detail = text.slice(0, 100);
      throw new Error(response.status === 403
        ? "رفض Worker الطلب (403). راجع رابط Worker وإعداد ALLOWED_ORIGIN والمصادقة."
        : `تعذر جلب بيانات Xtream (${response.status})${detail ? `: ${detail}` : ""}`);
    }
    return response.json() as Promise<T>;
  }

  async login(password: string) {
    const response = await fetch(`${this.origin}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ password }),
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({})) as { token?: string; error?: string };
    if (!response.ok || !body.token) throw new Error(body.error || `فشل تسجيل الدخول إلى Worker (${response.status})`);
    return body.token;
  }

  async categories(kind: MediaKind) {
    const action = kind === "live" ? "get_live_categories" : kind === "movie" ? "get_vod_categories" : "get_series_categories";
    return this.request<XtreamCategory[]>("/api/player_api.php", { action });
  }

  async list(kind: MediaKind, categoryId?: string) {
    const action = kind === "live" ? "get_live_streams" : kind === "movie" ? "get_vod_streams" : "get_series";
    const params: Record<string, string> = { action };
    if (categoryId && categoryId !== "all") params.category_id = categoryId;
    return this.request<XtreamItem[]>("/api/player_api.php", params);
  }

  async seriesInfo(seriesId: string) {
    return this.request<{ seasons?: unknown[]; episodes?: Record<string, XtreamItem[]> }>("/api/player_api.php", { action: "get_series_info", series_id: seriesId });
  }

  async streamUrl(kind: MediaKind, id: string, extension = "m3u8") {
    return this.request<{ url: string; expiresIn: number }>("/api/stream-url", { kind, id, ext: extension });
  }
}

export function itemId(item: XtreamItem, kind: MediaKind) {
  const raw = kind === "series" ? item.series_id ?? item.id : item.stream_id ?? item.episode_id ?? item.id;
  return raw == null ? "" : String(raw);
}

export function itemTitle(item: XtreamItem) {
  return String(item.name || item.title || "بدون اسم");
}

export function itemArtwork(item: XtreamItem) {
  const value = item.stream_icon || item.cover || item.series_cover;
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : "";
}

export function variantsFor(item: XtreamItem) {
  const rows = Array.isArray(item.sources) ? item.sources : Array.isArray(item.qualities) ? item.qualities : [];
  return rows.filter(x => typeof x.url === "string" || x.id != null).map((x, i) => ({
    ...x,
    quality: String(x.quality || x.name || (x.height ? `${x.height}p` : `جودة ${i + 1}`)),
  }));
}

export function qualityNumber(variant: StreamVariant) {
  if (typeof variant.height === "number") return variant.height;
  const match = `${variant.quality || ""} ${variant.name || ""}`.match(/(\d{3,4})\s*p?/i);
  if (match) return Number(match[1]);
  if (typeof variant.bitrate === "number") return variant.bitrate;
  return Number.MAX_SAFE_INTEGER;
}

export function extensionOf(item: XtreamItem, kind: MediaKind) {
  const ext = String(item.container_extension || (kind === "live" ? "m3u8" : "mp4")).toLowerCase().replace(/^\./, "");
  return /^[a-z0-9]{2,8}$/.test(ext) ? ext : (kind === "live" ? "m3u8" : "mp4");
}
