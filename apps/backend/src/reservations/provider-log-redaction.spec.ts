import { redactProviderDetail } from './reservation-notifications.service';

describe('redactProviderDetail', () => {
  it('redacts phone numbers from provider error bodies', () => {
    const input = 'Error: could not send SMS to +359888123456: invalid number';
    const result = redactProviderDetail(input);
    expect(result).not.toContain('+359888123456');
    expect(result).toContain('[REDACTED_PHONE]');
  });

  it('redacts phone numbers without a leading plus', () => {
    const input = 'Delivery failed for 0888123456';
    const result = redactProviderDetail(input);
    expect(result).not.toContain('0888123456');
    expect(result).toContain('[REDACTED_PHONE]');
  });

  it('redacts email addresses', () => {
    const input = 'Resend rejected recipient guest@example.com: bounced';
    const result = redactProviderDetail(input);
    expect(result).not.toContain('guest@example.com');
    expect(result).toContain('[REDACTED_EMAIL]');
  });

  it('redacts manage tokens in query strings', () => {
    const input =
      'Callback error at https://app.example.com/booking/manage?r=rest-1&token=SECRET_ABC123&lang=en';
    const result = redactProviderDetail(input);
    expect(result).not.toContain('SECRET_ABC123');
    expect(result).toContain('token=[REDACTED]');
  });

  it('redacts short manage-link tokens (/r/:token)', () => {
    const input =
      'SMS delivery bounced for link https://bkng.app/r/aBcD1234EfGh';
    const result = redactProviderDetail(input);
    expect(result).not.toContain('aBcD1234EfGh');
    expect(result).toContain('/r/[REDACTED]');
  });

  it('redacts multiple PII types in a single realistic provider error', () => {
    const input =
      'Twilio 400: could not deliver to +359888123456 (guest@example.com), manage link https://app.example.com/booking/manage?r=rest-1&token=SECRET_XYZ789';
    const result = redactProviderDetail(input);
    expect(result).not.toContain('+359888123456');
    expect(result).not.toContain('guest@example.com');
    expect(result).not.toContain('SECRET_XYZ789');
  });

  it('returns falsy input unchanged', () => {
    expect(redactProviderDetail('')).toBe('');
  });

  it('leaves non-PII error text untouched', () => {
    const input = 'Rate limit exceeded, retry after 30 seconds';
    expect(redactProviderDetail(input)).toBe(input);
  });
});
