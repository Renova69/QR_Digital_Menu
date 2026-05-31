import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FinishStep from './FinishStep';

const mockT = vi.fn((key: string, opts?: any) => {
  if (key === 'onboarding.finish.subtitle') {
    return `${String(opts?.restaurantName)} is ready.`;
  }

  const fallbacks: Record<string, string> = {
    'onboarding.finish.title': 'All set!',
    'onboarding.finish.tipCategories': 'Add menu categories and items',
    'onboarding.finish.tipQrCodes': 'Print or share QR codes',
    'onboarding.finish.tipStaff': 'Invite staff members',
    'onboarding.finish.tipBranding': 'Customize branding and colors',
    'onboarding.finish.nextSteps': 'Next steps:',
    'onboarding.finish.cta': 'Go to dashboard',
  };

  return fallbacks[key] ?? key;
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}));

describe('FinishStep', () => {
  it('interpolates the restaurant name as text', () => {
    render(<FinishStep restaurantName="Bistro Test" onDone={() => {}} />);

    expect(screen.getByText('Bistro Test is ready.')).toBeTruthy();
    expect(screen.queryByText(/\[object Object\]/)).toBeNull();
    expect(mockT).toHaveBeenCalledWith('onboarding.finish.subtitle', {
      restaurantName: 'Bistro Test',
    });
  });
});
