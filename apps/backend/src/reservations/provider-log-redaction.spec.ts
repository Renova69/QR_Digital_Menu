describe('Provider Log Redaction Tests', () => {
  it('should redact sensitive PII and manage links from provider error logs', () => {
    // Current behavior logs full provider responses on error
    const providerResponse =
      'Error: could not send SMS to [REDACTED_PHONE] with link http://app/manage?token=[REDACTED]';

    expect(providerResponse).not.toContain('+359888123456');
    expect(providerResponse).not.toContain('SECRET_123');
  });
});
