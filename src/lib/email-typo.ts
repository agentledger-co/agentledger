// Catches common email domain typos and placeholder addresses before they
// hit Supabase auth. Returns null if the email looks fine.

const DOMAIN_TYPOS: Record<string, string> = {
  // Gmail
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmil.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmailcom': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmaul.com': 'gmail.com',
  'gmaik.com': 'gmail.com',
  // Yahoo
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahoocom': 'yahoo.com',
  'yhaoo.com': 'yahoo.com',
  // Hotmail
  'hotmal.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmailcom': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',
  // Outlook
  'outlookcom': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'outlok.com': 'outlook.com',
};

// Domains that are clearly placeholder text, not real addresses
const PLACEHOLDER_DOMAINS = new Set([
  'company.com',
  'yourcompany.com',
  'example.com',
  'test.com',
  'domain.com',
  'email.co',
]);

export type EmailCheck = {
  type: 'typo';
  suggestion: string;
  message: string;
} | {
  type: 'placeholder';
  message: string;
};

export function checkEmailTypo(email: string): EmailCheck | null {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;

  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain) return null;

  if (PLACEHOLDER_DOMAINS.has(domain)) {
    return {
      type: 'placeholder',
      message: 'This looks like a placeholder — please use your real email address.',
    };
  }

  const correction = DOMAIN_TYPOS[domain];
  if (correction) {
    const fixed = email.slice(0, at + 1) + correction;
    return {
      type: 'typo',
      suggestion: fixed,
      message: `Did you mean ${fixed}?`,
    };
  }

  return null;
}
