# Community 19

**Community 19** — 11 nodes

## Nodes

### FIFO point ledger loyalty program Р Р†Р вЂљРІР‚Сњ earn/redeem rates (loyaltyExchangeRate default 10, loyaltyRedeemRate default 150), Silver/Gold VIP tiers (500/2000 point thresholds), Happy Hour multipliers (Math.max with tier, not additive), expiry reminder cron at midnight UTC, timezone-aware via Luxon

- **ID:** `LoyaltySystem_Detail`
- **Type:** document
- **Degree:** 3
- **Source:** `03.05.26_loyalty_rewards_implementation.md`
- **Outbound:**
  - → `loyalty-tiers.utils.ts Р Р†Р вЂљРІР‚Сњ getTierInfo() and tierConfigFromRestaurant(), never hardcode thresholds (500/2000) anywhere` [_`depends_on`_ | EXTRACTED | score: 1.0]
  - → `loyalty-ledger.utils.ts Р Р†Р вЂљРІР‚Сњ FIFO operations: expireAccountPoints, redeemAccountPoints, addEarnedPointBatch, getExpiringPointBatches(onlyUnnotified), markRemindersSent. Critical rule: never Promise.all inside $transaction` [_`depends_on`_ | EXTRACTED | score: 1.0]
  - → `Loyalty rate semantics Р Р†Р вЂљРІР‚Сњ loyaltyExchangeRate (Int, default 10): points earned per 1 spent; loyaltyRedeemRate (Int, default 150): points needed for 1 discount; effective cashback = earnRate/redeemRate * 100, defaults give 6.7%` [_`governed_by`_ | EXTRACTED | score: 1.0]

### loyalty-ledger.utils.ts Р Р†Р вЂљРІР‚Сњ FIFO operations: expireAccountPoints, redeemAccountPoints, addEarnedPointBatch, getExpiringPointBatches(onlyUnnotified), markRemindersSent. Critical rule: never Promise.all inside $transaction

- **ID:** `LoyaltyLedgerUtils`
- **Type:** code
- **Degree:** 1
- **Source:** `03.05.26_loyalty_rewards_implementation.md`

### Loyalty rate semantics Р Р†Р вЂљРІР‚Сњ loyaltyExchangeRate (Int, default 10): points earned per 1 spent; loyaltyRedeemRate (Int, default 150): points needed for 1 discount; effective cashback = earnRate/redeemRate \* 100, defaults give 6.7%

- **ID:** `LoyaltyRateSemantics`
- **Type:** document
- **Degree:** 1
- **Source:** `03.05.26_loyalty_rewards_implementation.md`

### loyalty-tiers.utils.ts Р Р†Р вЂљРІР‚Сњ getTierInfo() and tierConfigFromRestaurant(), never hardcode thresholds (500/2000) anywhere

- **ID:** `LoyaltyTierUtils`
- **Type:** code
- **Degree:** 1
- **Source:** `03.05.26_loyalty_rewards_implementation.md`
