/**
 * Meta Graph API client for Marketing API operations.
 * Wraps fetch() with auth, error handling, and rate-limit awareness.
 */

import type {
  MetaApiError,
  MetaCampaignResponse,
  MetaAdSetResponse,
  MetaAdResponse,
  MetaImageUploadResponse,
} from "./types.ts";

const API_BASE = "https://graph.facebook.com/v21.0";

export class MetaApiClient {
  private accessToken: string;
  private adAccountId: string;

  constructor(accessToken: string, adAccountId: string) {
    this.accessToken = accessToken;
    this.adAccountId = adAccountId;
  }

  private get accountPath(): string {
    // Ensure act_ prefix
    const id = this.adAccountId.startsWith("act_")
      ? this.adAccountId
      : `act_${this.adAccountId}`;
    return `${API_BASE}/${id}`;
  }

  private async request<T>(
    url: string,
    method: "GET" | "POST" | "DELETE" = "GET",
    body?: Record<string, unknown>
  ): Promise<T> {
    const headers: Record<string, string> = {};
    let fetchBody: string | FormData | undefined;

    if (body) {
      headers["Content-Type"] = "application/json";
      fetchBody = JSON.stringify({ ...body, access_token: this.accessToken });
    } else {
      // Append token as query param for GET
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}access_token=${this.accessToken}`;
    }

    const res = await fetch(url, { method, headers, body: fetchBody });
    const json = await res.json();

    if (!res.ok) {
      const err = json as MetaApiError;
      throw new Error(
        `Meta API ${res.status}: ${err.error?.message || JSON.stringify(json)}`
      );
    }

    return json as T;
  }

  /** Create a campaign under the ad account */
  async createCampaign(params: {
    name: string;
    objective: string;
    status: string;
    special_ad_categories?: string[];
  }): Promise<MetaCampaignResponse> {
    return this.request<MetaCampaignResponse>(
      `${this.accountPath}/campaigns`,
      "POST",
      {
        name: params.name,
        objective: params.objective,
        status: params.status,
        special_ad_categories: params.special_ad_categories || [],
      }
    );
  }

  /** Update campaign status */
  async updateCampaignStatus(
    metaCampaignId: string,
    status: string
  ): Promise<void> {
    await this.request(`${API_BASE}/${metaCampaignId}`, "POST", { status });
  }

  /** Create an ad set under a campaign */
  async createAdSet(params: {
    name: string;
    campaign_id: string;
    daily_budget: number; // in cents
    billing_event: string;
    optimization_goal: string;
    status: string;
    targeting: Record<string, unknown>;
    start_time?: string;
    end_time?: string;
  }): Promise<MetaAdSetResponse> {
    return this.request<MetaAdSetResponse>(
      `${this.accountPath}/adsets`,
      "POST",
      params
    );
  }

  /** Update ad set status */
  async updateAdSetStatus(
    metaAdSetId: string,
    status: string
  ): Promise<void> {
    await this.request(`${API_BASE}/${metaAdSetId}`, "POST", { status });
  }

  /** Upload an image to the ad account, returns image hash */
  async uploadImage(imageBytes: Uint8Array, filename: string): Promise<string> {
    const formData = new FormData();
    formData.append("access_token", this.accessToken);
    formData.append(
      "filename",
      new Blob([imageBytes as BlobPart], { type: "image/png" }),
      filename
    );

    const res = await fetch(`${this.accountPath}/adimages`, {
      method: "POST",
      body: formData,
    });
    const json = await res.json();

    if (!res.ok) {
      const err = json as MetaApiError;
      throw new Error(
        `Meta image upload ${res.status}: ${err.error?.message || JSON.stringify(json)}`
      );
    }

    const data = json as MetaImageUploadResponse;
    const hashes = Object.values(data.images);
    if (!hashes.length) throw new Error("No image hash returned from Meta");
    return hashes[0].hash;
  }

  /** Create an ad creative + ad */
  async createAd(params: {
    name: string;
    adset_id: string;
    status: string;
    creative: {
      image_hash: string;
      message: string; // body copy
      link?: string;
      name?: string; // headline
      page_id: string;
    };
  }): Promise<MetaAdResponse> {
    // First create the ad creative
    const creative = await this.request<{ id: string }>(
      `${this.accountPath}/adcreatives`,
      "POST",
      {
        name: params.name,
        object_story_spec: {
          page_id: params.creative.page_id,
          link_data: {
            image_hash: params.creative.image_hash,
            message: params.creative.message,
            link: params.creative.link || "https://comejoinus.app",
            name: params.creative.name,
          },
        },
      }
    );

    // Then create the ad referencing the creative
    return this.request<MetaAdResponse>(`${this.accountPath}/ads`, "POST", {
      name: params.name,
      adset_id: params.adset_id,
      creative: { creative_id: creative.id },
      status: params.status,
    });
  }

  /** Update ad status */
  async updateAdStatus(metaAdId: string, status: string): Promise<void> {
    await this.request(`${API_BASE}/${metaAdId}`, "POST", { status });
  }
}
