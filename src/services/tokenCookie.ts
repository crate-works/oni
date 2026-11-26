import { api } from '@/configuration';
import type { OniUser } from '@/services/auth';

// Same concatenation as ApiService.getFileUrl, so the cookie's Path always covers its URLs.
const fileRoutePath = () => new URL(`${api.rocrate.endpoint}/file/`, window.location.origin).pathname;

// Value and Max-Age attribute for the cookie: the token until it expires, otherwise a deletion.
const cookieContent = (user: OniUser | undefined) => {
  if (!user) {
    return { value: '', maxAgeAttribute: '; Max-Age=0' };
  }

  if (user.expiresAt === undefined) {
    return { value: user.accessToken, maxAgeAttribute: '' };
  }

  const secondsLeft = Math.round(user.expiresAt - Date.now() / 1000);
  if (secondsLeft <= 0) {
    return { value: '', maxAgeAttribute: '; Max-Age=0' };
  }

  return { value: user.accessToken, maxAgeAttribute: `; Max-Age=${secondsLeft}` };
};

export const syncTokenCookie = (user: OniUser | undefined) => {
  const { usesTokenCookie, tokenCookieName } = api.rocrate;
  if (!usesTokenCookie) {
    return;
  }

  const { value, maxAgeAttribute } = cookieContent(user);

  // biome-ignore lint/suspicious/noDocumentCookie: must be synchronous so the cookie exists before views request file URLs
  document.cookie = `${tokenCookieName}=${value}; Path=${fileRoutePath()}${maxAgeAttribute}; Secure; SameSite=Strict`;
};
