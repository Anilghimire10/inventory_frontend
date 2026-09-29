import type { SupportCategory } from '@/types';

/**
 * The categories a question can be filed under, in the order the dropdown
 * lists them. `short` is the badge on a ticket; `hint` helps someone pick.
 * They match the API's SupportTicketCategory.
 */
export const SUPPORT_CATEGORIES: {
  value: SupportCategory;
  label: string;
  short: string;
  hint: string;
}[] = [
  { value: 'PROBLEM', label: 'Something isn’t working', short: 'Problem', hint: 'An error, a crash, or numbers that look wrong.' },
  { value: 'HOW_TO', label: 'How do I…?', short: 'How to', hint: 'Help using a part of the app.' },
  { value: 'BILLING', label: 'Billing & subscription', short: 'Billing', hint: 'Paying, renewing, receipts or your plan.' },
  { value: 'FEATURE', label: 'Feature request', short: 'Feature request', hint: 'Something you wish the app did.' },
  { value: 'OTHER', label: 'Something else', short: 'Other', hint: 'Anything that doesn’t fit above.' },
];

export function categoryInfo(value: SupportCategory) {
  return SUPPORT_CATEGORIES.find((c) => c.value === value) ?? SUPPORT_CATEGORIES[SUPPORT_CATEGORIES.length - 1];
}
