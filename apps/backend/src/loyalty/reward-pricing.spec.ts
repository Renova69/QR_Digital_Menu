import { getEffectiveRewardPointsPrice } from './reward-pricing';

describe('reward pricing', () => {
  it('calculates automatic reward points from cents and the restaurant redeem rate', () => {
    expect(
      getEffectiveRewardPointsPrice(
        { price: 9.9, rewardPointsMode: 'AUTO', rewardPointsPrice: null },
        100,
      ),
    ).toBe(990);

    expect(
      getEffectiveRewardPointsPrice(
        { price: 9.99, rewardPointsMode: 'AUTO', rewardPointsPrice: null },
        150,
      ),
    ).toBe(1499);
  });

  it('preserves custom rewards and disables off rewards', () => {
    expect(
      getEffectiveRewardPointsPrice(
        { price: 9.9, rewardPointsMode: 'CUSTOM', rewardPointsPrice: 875 },
        100,
      ),
    ).toBe(875);
    expect(
      getEffectiveRewardPointsPrice(
        { price: 9.9, rewardPointsMode: 'OFF', rewardPointsPrice: 875 },
        100,
      ),
    ).toBeNull();
  });

  it('treats legacy items with a manual points price as custom rewards', () => {
    expect(
      getEffectiveRewardPointsPrice(
        { price: 9.9, rewardPointsPrice: 990 },
        100,
      ),
    ).toBe(990);
  });
});
