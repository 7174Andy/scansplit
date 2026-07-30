import { encodeSharePayload, type SharePayload } from "./sharePayload";

/**
 * Where the share page is deployed. Changing this breaks links already sent;
 * they are ephemeral by nature, meant to be used within days.
 */
export const SHARE_BASE_URL = "https://7174andy.github.io/scansplit/share/";

/**
 * The payload goes after `#` deliberately. Fragments are never transmitted to
 * the server, so the host never sees a split. Moving it to the path or query
 * would silently destroy that property.
 */
export function buildShareUrl(payload: SharePayload): string {
  return `${SHARE_BASE_URL}#${encodeSharePayload(payload)}`;
}
