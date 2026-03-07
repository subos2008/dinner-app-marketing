/** Sync action types for plan/apply workflow */

export type EntityType = "campaign" | "ad_set" | "ad";
export type ActionType = "create" | "pause" | "unpause" | "update";

export interface SyncAction {
  type: ActionType;
  entity: EntityType;
  id: string; // Supabase UUID
  name: string; // human-readable label
  data: Record<string, unknown>;
  /** For ads: the ad_set this belongs to */
  adSetId?: string;
  /** For ad_sets: the campaign this belongs to */
  campaignId?: string;
}

export interface SyncResult {
  action: SyncAction;
  status: "success" | "error";
  metaId?: string;
  error?: string;
}

export interface SyncPlan {
  creates: SyncAction[];
  pauses: SyncAction[];
  unpauses: SyncAction[];
  updates: SyncAction[];
  inSync: { entity: EntityType; name: string }[];
}

/** Meta API response shapes */
export interface MetaCampaignResponse {
  id: string;
}

export interface MetaAdSetResponse {
  id: string;
}

export interface MetaAdCreativeResponse {
  id: string;
}

export interface MetaAdResponse {
  id: string;
}

export interface MetaImageUploadResponse {
  images: Record<string, { hash: string }>;
}

export interface MetaApiError {
  error: {
    message: string;
    type: string;
    code: number;
  };
}

/** DB row types (subset of fields we care about) */
export interface CampaignRow {
  id: string;
  name: string;
  objective: string;
  desired_status: string;
  meta_status: string | null;
  meta_campaign_id: string | null;
}

export interface AdSetRow {
  id: string;
  name: string;
  campaign_id: string | null;
  daily_budget_cents: number | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  age_min: number | null;
  age_max: number | null;
  genders: number[] | null;
  geo_locations: Record<string, unknown> | null;
  targeting: Record<string, unknown> | null;
  placements: Record<string, unknown> | null;
  desired_status: string;
  meta_status: string | null;
  meta_ad_set_id: string | null;
  campaign?: CampaignRow;
}

export interface AdRow {
  id: string;
  ad_set_id: string | null;
  base_image_id: string;
  body_copy_id: string | null;
  composited_image_path: string | null;
  desired_status: string;
  meta_status: string | null;
  meta_ad_id: string | null;
  ad_set?: AdSetRow;
  body_copy?: { text: string; headline: string | null };
}
