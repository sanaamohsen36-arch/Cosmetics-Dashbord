// Section 16. Mirrors the OCR provider pattern (lib/ocr/types.ts): the rest
// of the app only ever talks to this interface, never a specific vendor SDK.
export interface BackupObjectMeta {
  locationRef: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupDestination {
  readonly id: string;
  upload(objectKey: string, data: Buffer, contentType: string): Promise<{ locationRef: string }>;
  list(prefix: string): Promise<BackupObjectMeta[]>;
  download(locationRef: string): Promise<Buffer>;
  delete(locationRef: string): Promise<void>;
}
