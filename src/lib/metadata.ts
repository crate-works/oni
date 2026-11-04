import { buildMetadataNameMap, metadataLabel } from '@researchdatabox/oni-client';

import { ui } from '@/configuration';
import { isAbsoluteUrl } from '@/lib/tools';

type MetadataMappingConfig = {
  mappingFile?: string;
  textReplacements?: Record<string, string>;
};

const metadataMapping: MetadataMappingConfig = ui.metadataMapping ?? {};
const mappingFile = metadataMapping.mappingFile;
const textReplacements: Record<string, string> = metadataMapping.textReplacements ?? {};

const resolveMetadataMappingUrl = (mappingFile: string) => {
  if (isAbsoluteUrl(mappingFile)) {
    return mappingFile;
  }

  const normalizedPath = mappingFile.replace(/^\/+/, '');

  return `${import.meta.env.BASE_URL}${normalizedPath}`;
};

const loadMetadataMapping = async () => {
  if (!mappingFile) {
    return new Map<string, string>();
  }

  try {
    const response = await fetch(resolveMetadataMappingUrl(mappingFile));
    if (!response.ok) {
      return new Map<string, string>();
    }

    const payload = await response.json();
    return await buildMetadataNameMap(payload);
  } catch {
    return new Map<string, string>();
  }
};

const metadataNameById = await loadMetadataMapping();

export const startCase = (str: string) =>
  metadataLabel(str, {
    mappingConfigured: !!mappingFile,
    names: metadataNameById,
    textReplacements,
  });
