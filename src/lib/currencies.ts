/** Common currencies for the picker. Code is what's stored on the business. */
export interface CurrencyOption {
  code: string;
  label: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'NPR', label: 'Nepalese Rupee (Rs)' },
  { code: 'INR', label: 'Indian Rupee (₹)' },
  { code: 'PKR', label: 'Pakistani Rupee (Rs)' },
  { code: 'BDT', label: 'Bangladeshi Taka (৳)' },
  { code: 'LKR', label: 'Sri Lankan Rupee (Rs)' },
  { code: 'AED', label: 'UAE Dirham (د.إ)' },
  { code: 'SAR', label: 'Saudi Riyal (﷼)' },
  { code: 'AUD', label: 'Australian Dollar (A$)' },
  { code: 'CAD', label: 'Canadian Dollar (C$)' },
  { code: 'JPY', label: 'Japanese Yen (¥)' },
  { code: 'CNY', label: 'Chinese Yuan (¥)' },
  { code: 'NGN', label: 'Nigerian Naira (₦)' },
  { code: 'ZAR', label: 'South African Rand (R)' },
  { code: 'BRL', label: 'Brazilian Real (R$)' },
  { code: 'MXN', label: 'Mexican Peso ($)' },
];
