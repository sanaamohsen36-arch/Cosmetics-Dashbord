export type AdsPlatform = "Meta" | "TikTok";
export type UploadMode = "replace" | "merge" | "cancel";
export type PageKey = "dashboard" | "sales-upload" | "ads-upload" | "sales-report" | "page-report" | "settings";
export type SalesRowType = "normal" | "subtotal" | "grand_total";
export type SalesGroupType = "social" | "follow_up" | "other";
export type OcrFieldConfidence = Record<string, number>;
export type OcrFieldWarnings = Record<string, string[]>;
export type OcrCellImages = Record<string, string>;

export interface SalesRawFile {
  id: string;
  fileName: string;
  filePath: string;
  uploadedAt: string;
  reportDate: string;
  ocrStatus: "pending" | "success" | "failed" | "manual";
  createdAt: string;
  version: number;
  isCurrent: boolean;
  supersededAt?: string | null;
  supersededBy?: string | null;
}

export interface SalesBySalesperson {
  id: string;
  reportDate: string;
  salespersonName: string;
  salespersonCode: string;
  morningOrders: number;
  morningRevenue: number;
  eveningOrders: number;
  eveningRevenue: number;
  totalOrders: number;
  totalRevenue: number;
  sourceFileId: string;
  createdAt: string;
  ocrConfidence?: number;
  ocrFieldConfidence?: OcrFieldConfidence;
  ocrFieldWarnings?: OcrFieldWarnings;
  ocrCellImages?: OcrCellImages;
  ocrOriginalName?: string;
  ocrReviewStatus?: "ok" | "auto_corrected" | "needs_review";
  ocrReviewNotes?: string;
}

export interface SalesByPlatform {
  id: string;
  reportDate: string;
  platformCategory?: string;
  groupType?: SalesGroupType;
  rowType?: SalesRowType;
  platformName: string;
  morningOrders: number;
  morningRevenue: number;
  eveningOrders: number;
  eveningRevenue: number;
  totalOrders: number;
  totalRevenue: number;
  sourceFileId: string;
  createdAt: string;
  ocrConfidence?: number;
  ocrFieldConfidence?: OcrFieldConfidence;
  ocrFieldWarnings?: OcrFieldWarnings;
  ocrCellImages?: OcrCellImages;
  ocrOriginalName?: string;
  ocrReviewStatus?: "ok" | "auto_corrected" | "needs_review";
  ocrReviewNotes?: string;
}

export interface AdsRawFile {
  id: string;
  fileName: string;
  filePath: string;
  uploadedAt: string;
  reportDate: string;
  adsPlatform: AdsPlatform;
  salesPlatformName: string;
  adAccountName?: string;
  parsingStatus: "success" | "failed";
  createdAt: string;
  version: number;
  isCurrent: boolean;
  supersededAt?: string | null;
  supersededBy?: string | null;
}

export interface AdsRow {
  id: string;
  reportDate: string;
  adsPlatform: AdsPlatform;
  salesPlatformName: string;
  adAccountName?: string;
  campaignName: string;
  adsetName: string;
  adName: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  leads: number;
  resultsCount?: number;
  costPerResult?: number;
  messagesCount?: number;
  commentsCount?: number;
  purchases: number;
  purchaseValue: number;
  sourceFileId: string;
  createdAt: string;
}

export interface PlatformSetting {
  id: string;
  platformName: string;
  isActive: boolean;
  createdAt: string;
}

export interface OcrPageCorrection {
  id: string;
  wrongValue: string;
  correctValue: string;
  createdAt: string;
  usageCount: number;
}

export interface OcrSalespersonCorrection {
  id: string;
  wrongValue: string;
  correctValue: string;
  salespersonCode: string;
  createdAt: string;
  usageCount: number;
}

export interface SalespersonMaster {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface PlatformMaster {
  id: string;
  name: string;
  aliases: string[];
  active: boolean;
}

// Column-mapping wizard: fields a user can manually assign to a column when
// automatic alias-based detection can't recognize a workbook's headers.
export type MappableField =
  | "salespersonName"
  | "salespersonCode"
  | "pageName"
  | "platform"
  | "orders"
  | "revenue"
  | "morningOrders"
  | "morningRevenue"
  | "eveningOrders"
  | "eveningRevenue";

// A remembered mapping, keyed by the exact header layout it was confirmed
// for, so the same file structure is recognized automatically next time
// without asking the user to map it again.
export interface ColumnMapping {
  id: string;
  signature: string;
  fields: Partial<Record<MappableField, number>>;
  sheetLabel: string;
  createdAt: string;
  usageCount: number;
}

export interface DateRange {
  from: string;
  to: string;
}

// Section 13 (Roles & Permissions)
export type Role = "owner" | "marketing_manager" | "media_buyer" | "sales_manager" | "data_entry" | "viewer";

export interface Profile {
  id: string;
  displayName: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export type Capability =
  | "sales_upload.upload"
  | "sales_upload.replace"
  | "sales_upload.delete_current"
  | "sales_upload.purge_version"
  | "ads_upload.upload"
  | "ads_upload.delete"
  | "ads_upload.purge_version"
  | "preview.edit"
  | "mapping_memory.edit"
  | "settings.manage_master_data"
  | "settings.manage_users"
  | "reports.view"
  | "audit_log.view"
  | "file_versions.view"
  | "file_versions.restore"
  | "backup.run_manual"
  | "backup.restore"
  | "backup.view_history"
  | "system_health.view"
  | "notifications.view";

// Section 14 (Audit Log) - append-only, never updated/deleted by app code.
export interface AuditLogEntry {
  id: string;
  userId: string;
  userRole: Role;
  action: string;
  entityType: string;
  entityId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// Section 16 (Backup & Restore)
export interface BackupRun {
  id: string;
  startedAt: string;
  completedAt?: string | null;
  status: "running" | "success" | "failed";
  destination: string;
  locationRef?: string | null;
  tableRowCounts?: Record<string, number>;
  fileCount?: number;
  triggeredBy: string;
  errorMessage?: string | null;
}

// Section 17 (System Health Monitoring)
export interface SystemHealthStatus {
  component: string;
  status: "ok" | "degraded" | "down" | "unknown";
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastErrorMessage?: string | null;
  updatedAt: string;
}

// Section 18 (Notification Center)
export type NotificationSeverity = "info" | "warning" | "error" | "critical";
export type NotificationCategory = "ocr" | "backup" | "upload" | "migration" | "storage" | "system";

export interface AppNotification {
  id: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  isRead: boolean;
  readAt?: string | null;
  readBy?: string | null;
  createdAt: string;
}

export interface AppData {
  salesRawFiles: SalesRawFile[];
  salesBySalesperson: SalesBySalesperson[];
  salesByPlatform: SalesByPlatform[];
  adsRawFiles: AdsRawFile[];
  metaAds: AdsRow[];
  tiktokAds: AdsRow[];
  platformSettings: PlatformSetting[];
  ocrPageCorrections: OcrPageCorrection[];
  ocrSalespersonCorrections: OcrSalespersonCorrection[];
  salespeople: SalespersonMaster[];
  platforms: PlatformMaster[];
  columnMappings: ColumnMapping[];
  profiles: Profile[];
  auditLog: AuditLogEntry[];
  backupRuns: BackupRun[];
  systemHealth: SystemHealthStatus[];
  notifications: AppNotification[];
}

export interface Kpis {
  totalSalesRevenue: number;
  totalOrders: number;
  morningOrders: number;
  eveningOrders: number;
  morningRevenue: number;
  eveningRevenue: number;
  totalAdsSpend: number;
  metaSpend: number;
  tiktokSpend: number;
  messagesCount: number;
  commentsCount: number;
  messageConversionRate: number | null;
  roas: number | null;
  roi: number | null;
  cpa: number | null;
  averageOrderValue: number | null;
  spendToSalesRatio: number | null;
  bestSalespersonByOrders: string;
  bestSalespersonByRevenue: string;
  bestPlatformByOrders: string;
  bestPlatformByRevenue: string;
}
