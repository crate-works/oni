const unitMultipliers = {
  bytes: 1,
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
};

export const parseContentSize = (value: string | number) => {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value; // Already in bytes
  }

  const regex = /^(\d+(?:\.\d+)?)(\s*)(bytes|b|kb|mb|gb|tb)$/i;

  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(regex);
  if (!match) {
    return null;
  }

  if (!match[1] || !match[3]) {
    return null;
  }

  const number = parseFloat(match[1]);
  const unit = match[3].toLowerCase();

  return number * (unitMultipliers[unit as keyof typeof unitMultipliers] || 1);
};

// NOTE: This assumes the array is never empty from a type perspective
export const first = <T>(arr: T | T[]) => {
  if (!Array.isArray(arr)) {
    return arr;
  }

  return arr[0] as T;
};

export const joinAll = (arr: string | string[] | undefined, separator = ' | '): string => {
  if (!arr) {
    return '';
  }

  if (!Array.isArray(arr)) {
    return arr;
  }

  return arr.filter(Boolean).join(separator);
};

export const getBasePathUrl = (path: string, basePath: string) => {
  const base = basePath || '/';
  const normalizedBase = base === '/' ? '' : base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBase}${normalizedPath}`;
};

/** Route conventions belong to the caller. Unknown types use its fallback. */
export const getEntityUrl = (
  entity: { id: string; entityType: string },
  routes: Readonly<Record<string, string>>,
  fallbackRoute: string,
): string =>
  `${Object.hasOwn(routes, entity.entityType) ? routes[entity.entityType] : fallbackRoute}?id=${encodeURIComponent(entity.id)}`;
