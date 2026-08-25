// Simplified auth storage for self-hosted deployment.
// The Lovable preview broker is no longer needed since we're not in a Lovable iframe.
export function brokeredPreviewStorage() {
  if (typeof window === 'undefined') return undefined;
  return localStorage;
}
