// Allowed email addresses for login
// Only these emails can access the dashboard
export const ALLOWED_EMAILS = [
  "acenjroofing@gmail.com",
  "glenipoleshi@gmail.com",
];

export function isEmailAllowed(email: string): boolean {
  return ALLOWED_EMAILS.includes(email.toLowerCase().trim());
}
