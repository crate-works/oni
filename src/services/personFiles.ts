import { isFileVisibleByMetadata } from '@/composables/fileVisibility';
import type { ApiService, FileType } from '@/services/api';

type FileVisibilityConfig = {
  enabled: boolean;
  fields: string[];
};

type ResolvePersonFilePresentationDataParams = {
  api: ApiService;
  files: FileType[];
  fileVisibility: FileVisibilityConfig;
  imageProbeTimeoutMs?: number;
};

type PersonFilePresentationData = {
  fileVisibilityById: Record<string, boolean>;
  photoUrls: Record<string, string>;
  browserImageById: Record<string, boolean>;
};

const canRenderAsImage = (url: string, timeoutMs: number): Promise<boolean> => {
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    let settled = false;

    const done = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    const timeout = window.setTimeout(() => done(false), timeoutMs);

    image.onload = () => {
      window.clearTimeout(timeout);
      done(true);
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      done(false);
    };
    image.src = url;
  });
};

const resolveFileVisibilityById = async (
  api: ApiService,
  files: FileType[],
  fileVisibility: FileVisibilityConfig,
): Promise<Record<string, boolean>> => {
  if (!fileVisibility.enabled) {
    return Object.fromEntries(files.map((file) => [file.id, true]));
  }

  const entries = await Promise.all(
    files.map(async (file) => {
      try {
        const result = await api.getEntityWithMetadata(file.id);
        if ('error' in result || !result.metadata) {
          return [file.id, true] as const;
        }

        const metadataRecord = result.metadata as Record<string, unknown>;
        return [file.id, isFileVisibleByMetadata(metadataRecord, fileVisibility)] as const;
      } catch {
        return [file.id, true] as const;
      }
    }),
  );

  return Object.fromEntries(entries);
};

export const resolvePersonFilePresentationData = async ({
  api,
  files,
  fileVisibility,
  imageProbeTimeoutMs = 5000,
}: ResolvePersonFilePresentationDataParams): Promise<PersonFilePresentationData> => {
  const fileVisibilityById = await resolveFileVisibilityById(api, files, fileVisibility);

  const urlEntries = await Promise.all(
    files.map(async (file) => {
      const url = await api.getFileUrl(file.id, file.filename, false);

      return [file, url || ''] as const;
    }),
  );

  const photoUrls = Object.fromEntries(urlEntries.map(([file, url]) => [file.id, url]));

  const browserImageById = Object.fromEntries(
    await Promise.all(
      urlEntries.map(async ([file, url]) => {
        if (!url || fileVisibilityById[file.id] === false) {
          return [file.id, false] as const;
        }

        if (file.mediaType.startsWith('image/')) {
          return [file.id, true] as const;
        }

        return [file.id, await canRenderAsImage(url, imageProbeTimeoutMs)] as const;
      }),
    ),
  );

  return {
    fileVisibilityById,
    photoUrls,
    browserImageById,
  };
};
