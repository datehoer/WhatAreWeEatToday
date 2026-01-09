export const ALLOWED_EMAIL_SUFFIX = (import.meta.env.VITE_ALLOWED_EMAIL_SUFFIX ||
  '').trim().toLowerCase()

export function isEmailAllowed(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  if (!ALLOWED_EMAIL_SUFFIX) return false
  if (!ALLOWED_EMAIL_SUFFIX.startsWith('@')) return false
  return normalized.endsWith(ALLOWED_EMAIL_SUFFIX)
}

