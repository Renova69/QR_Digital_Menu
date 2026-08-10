You are working inside an existing production-stage SaaS application for QR-based restaurant menus.

Your task is to inspect the current translation implementation, verify how it actually works, and then implement a robust architecture for translating dynamic public restaurant menu content with DeepL.

Do not blindly trust this prompt or existing code comments. First inspect the repository, database schema, services, API routes, background jobs, frontend forms, public menu queries, and existing DeepL integration. Confirm every assumption before changing code.

## Project context

The application has two different translation systems.

### 1\. Static application translations

The dashboard and fixed public-menu interface use standard i18n JSON files.

These translations include things such as:

* Dashboard labels

* Buttons

* Validation messages

* Order statuses

* Reservation terminology

* Table terminology

* Allergens

* Dietary tags

* Units

* Other fixed system text

This system should remain separate from restaurant-generated menu content.

Do not move dynamic restaurant content into the i18n JSON files.

### 2\. Dynamic restaurant menu content

Each restaurant creates unique content such as:

* Menu categories

* Product or dish names

* Product descriptions

* Ingredients

* Variants

* Modifier groups

* Modifier options

* Special notes

Different restaurants do not share the same menu, so a complete static glossary is not appropriate.

The application currently uses the DeepL Free API to translate dynamic menu content.

We previously tested self-hosted NLLB-200, but it was rejected because it produced poor results for short menu names, one-word food terms, ingredients, and other short restaurant content.

The application will initially grow slowly and target mainly local Bulgarian restaurants.

The current preferred solution is therefore:

* Keep DeepL

* Translate content only when requested

* Store translations permanently

* Never translate content when a public customer opens the menu

* Re-translate only fields that have changed

* Allow restaurant owners to manually correct translations

* Use curated glossaries only for stable terminology

* Track DeepL character usage per restaurant

* Avoid unnecessary infrastructure and overengineering

## Main objective

Implement a reliable translation architecture for restaurant-generated menu content.

The implementation must be safe for production, cost-aware, maintainable, and easy to extend later.

## Required investigation before implementation

Before modifying anything, inspect and document:

1. The current database models for:

   * Restaurant

   * Menu

   * Menu category

   * Menu item

   * Item variant

   * Modifier group

   * Modifier option

   * Ingredients

   * Localized or translated fields

2. The current i18n implementation.

3. The existing DeepL integration:

   * API client

   * Environment variables

   * Error handling

   * Request batching

   * Character counting

   * Rate-limit handling

   * Retry behaviour

4. The current menu creation and editing flow.

5. The current public menu API and frontend rendering.

6. Whether translations are currently:

   * Generated during save

   * Generated manually

   * Generated during public requests

   * Stored in the database

   * Re-generated unnecessarily

7. Whether the project already has:

   * A queue system

   * Background jobs

   * A cron worker

   * A database job table

   * Redis

   * BullMQ

   * Event-driven processing

8. Existing tests related to menu content and translations.

After inspection, provide a concise implementation plan based on the real codebase.

Do not create a second translation system if one already exists and can be improved safely.

## Target architecture

### Static translations

Continue using i18n JSON files for fixed system content.

Examples:

* Buttons

* Errors

* Allergens

* Dietary tags

* Public menu labels

* Dashboard text

### Dynamic content

Store restaurant-generated translations in the database.

Prefer a normalized translation model rather than adding one column per language, unless the existing architecture strongly justifies another approach.

A possible conceptual structure is:

MenuItemTranslation {  
  id: string;  
  menuItemId: string;  
  locale: string;

  name: string | null;  
  description: string | null;  
  ingredientsText: string | null;

  nameSourceHash: string | null;  
  descriptionSourceHash: string | null;  
  ingredientsSourceHash: string | null;

  provider: "DEEPL" | "MANUAL";  
  status:  
    | "PENDING"  
    | "MACHINE\_TRANSLATED"  
    | "REVIEWED"  
    | "OUTDATED"  
    | "FAILED";

  translatedAt: Date | null;  
  reviewedAt: Date | null;  
  updatedAt: Date;  
}

This is only a conceptual example.

Adapt it to the actual schema and coding conventions.

Do not create duplicated or unnecessary translation tables if the project already has a reusable localized-content model.

## Translation behaviour

### Source language

Each restaurant should have a primary or source language.

For the initial Bulgarian market, this will normally be Bulgarian.

Do not hardcode Bulgarian globally if the current architecture already supports restaurant-level source locales.

### Translation trigger

Translations must be generated from an explicit dashboard action or controlled save workflow.

Preferred options:

* Translate item

* Translate category

* Translate full menu

* Re-translate outdated fields

* Translate into selected language

Do not translate automatically on every save unless this is already the intended product behaviour.

Do not translate during public menu requests.

### Permanent storage

Every successful machine translation must be stored permanently.

The public menu should read stored translations from the database.

DeepL should not be required for customers to open or browse menus.

If DeepL is unavailable, existing translated menus must continue working.

### Changed-field detection

Only translate fields that changed.

Examples:

* If the item name changes, re-translate the name.

* If only the description changes, keep the existing translated name.

* If ingredients remain unchanged, do not re-translate them.

Use stable source hashes or another deterministic comparison method.

A suitable approach is:

hash(  
  normalizeSourceText(sourceText)  
)

Normalization should be conservative.

It may include:

* Trimming outer whitespace

* Normalizing line endings

* Preserving meaningful punctuation and casing where needed

Do not normalize so aggressively that different menu content becomes indistinguishable.

### Outdated translations

When the source field changes:

* Mark the corresponding translation field as outdated.

* Preserve the previous translated value until a new translation succeeds.

* Do not erase valid translations before replacement.

* Make outdated status visible in the dashboard.

If a new translation fails, the old value should remain available.

### Manual overrides

Restaurant owners must be able to manually edit translated content.

Manual translations take priority over machine-generated translations.

Do not overwrite a manually reviewed or manually edited translation automatically.

A safe rule is:

* Machine-generated and unreviewed fields may be regenerated.

* Reviewed or manual fields require explicit confirmation before replacement.

Track whether the translation is:

* Machine-generated

* Manually edited

* Reviewed

* Outdated

### Public menu fallback

Use a clear fallback order.

Recommended:

1. Requested locale translation

2. Existing outdated translation, if product rules allow it

3. Restaurant source-language content

4. Empty value only when the source itself is empty

The public API must never fail because a translation is missing.

## DeepL integration requirements

### Use DeepL only for dynamic restaurant content

Do not send static dashboard translations to DeepL.

### Use context for short menu content

DeepL supports a context parameter that can improve short and ambiguous translations.

When translating a short item name, include useful non-translated context such as:

* Restaurant menu category

* Product description

* Ingredients

* Content type

* Source language

* Target language

Example concept:

text: "Пърленка"

context:  
"This is a Bulgarian restaurant menu item from the bread category.  
Description: Traditional flatbread **with** butter and garlic."

Do not add translation instructions into the source text itself.

Use DeepL’s actual context field if supported by the installed SDK or API implementation.

### Glossary usage

Use glossaries only for controlled terminology such as:

* Allergens

* Dietary terms

* Cooking methods

* Units

* Protected regional dish names

* Brand names

* Repeatedly mistranslated ingredients

* Terms that must remain untranslated

Do not create one giant glossary containing every restaurant dish.

Support:

* Platform-level glossary terms

* Optional restaurant-specific terminology overrides

* Manual translation overrides

Recommended precedence:

1. Manual restaurant translation

2. Restaurant terminology override

3. Platform glossary

4. DeepL result

Verify whether the existing DeepL plan and integration support glossaries before implementing them.

Do not build unsupported functionality silently.

### Batching

Batch DeepL requests where safe and useful.

Consider:

* DeepL API request limits

* Maximum payload size

* Independent translation of each text entry

* Correct mapping of responses back to fields

* Partial failures

* Per-item status updates

Do not combine unrelated fields into one string that becomes difficult to separate safely.

### Character usage tracking

Track DeepL usage.

At minimum record:

* Restaurant ID

* Source language

* Target language

* Number of source characters

* Content type

* Entity type

* Entity ID

* Provider

* Success or failure

* Timestamp

A conceptual record:

TranslationUsage {  
  id: string;  
  restaurantId: string;  
  provider: "DEEPL";  
  sourceLocale: string;  
  targetLocale: string;  
  characterCount: number;  
  entityType: string;  
  entityId: string;  
  operation: string;  
  success: boolean;  
  createdAt: Date;  
}

Use the exact billable source-character counting behaviour expected by DeepL where possible.

Do not count context characters as translated characters if DeepL does not bill them.

Expose enough information for future plan limits and usage dashboards.

### Limits

Add safeguards so one restaurant cannot consume the entire DeepL allowance.

The exact commercial limits may not yet be decided, so implement a flexible configuration mechanism.

Possible controls:

* Monthly character limit per restaurant

* Maximum number of target languages

* Maximum items per translation request

* Translation feature enabled by subscription plan

* Warning threshold

* Hard limit threshold

Do not hardcode business-plan limits throughout the codebase.

Use a centralized policy or configuration service.

### Retries and failures

Handle:

* Authentication errors

* Invalid language combinations

* Rate limits

* Quota exhaustion

* Timeouts

* Network failures

* Invalid responses

* Partial batch failures

Use bounded retries with backoff only for transient failures.

Do not retry permanent errors indefinitely.

Deterministic garbage or untranslated identity output is isolated to the
affected translation unit and persisted as `NEEDS_REVIEW`. That terminal
state is not retried until the source text or source language changes.

Persist failure state and a useful internal error reason.

Do not expose DeepL secrets or raw provider errors to public users.

## Processing model

Prefer the simplest reliable architecture already compatible with the codebase.

If a queue already exists, reuse it.

If no queue exists and translation volume is currently low, consider a database-backed job table rather than introducing Redis only for this feature.

A conceptual job model:

TranslationJob {  
  id: string;  
  restaurantId: string;  
  entityType: string;  
  entityId: string;  
  sourceLocale: string;  
  targetLocale: string;  
  requestedFields: string\[\];  
  status:  
    | "PENDING"  
    | "PROCESSING"  
    | "COMPLETED"  
    | "FAILED";  
  attempts: number;  
  lastError: string | null;  
  createdAt: Date;  
  startedAt: Date | null;  
  completedAt: Date | null;  
}

Requirements:

* Idempotent processing

* No duplicate active jobs for the same entity, target locale, and source version

* Safe retry behaviour

* Recover jobs stuck in processing

* Preserve old translations until replacement succeeds

Do not introduce distributed infrastructure unless justified by the existing project.

## Translation cache and memory

For the initial version, prefer exact-match reuse within the same restaurant.

Suggested cache key inputs:

restaurantId  
sourceLocale  
targetLocale  
normalizedSourceText  
contentType  
optionalCategoryContext

Do not introduce fuzzy matching yet.

Do not automatically reuse one restaurant’s translation for another restaurant unless the translation has been explicitly curated as globally safe.

A global curated translation memory may later be used for obvious terms such as:

* Coca-Cola

* Mineral water

* Espresso

* French fries

* Ketchup

For now, prioritize correctness over maximum cache reuse.

## API requirements

Review and implement appropriate authenticated dashboard endpoints.

Possible operations:

* Translate one item

* Translate one category

* Translate selected items

* Translate full menu

* Translate outdated fields

* Get translation status

* Get usage summary

* Retry failed translation

* Update manual translation

* Mark translation as reviewed

Use existing authorization rules.

Every operation must verify that the current user has access to the restaurant and menu.

Prevent cross-tenant access.

Do not accept a restaurant ID from the client without validating ownership or permissions.

## Frontend requirements

Inspect the existing menu editor and integrate translation controls into the current UX rather than creating a disconnected interface.

The dashboard should show:

* Available target languages

* Translation status

* Machine-translated indicator

* Reviewed indicator

* Outdated indicator

* Failed indicator

* Manual edit option

* Re-translate option

* Usage or quota warning where appropriate

Avoid translating automatically while the owner is typing.

Use explicit actions or debounced save-and-translate behaviour only if it matches the current UX.

The owner should always be able to view:

* Source text

* Translated text

* Translation status

* Last translated time

* Whether the translation was manually edited

## Public menu requirements

The public menu must:

* Request a locale

* Return stored translated fields when available

* Fall back safely to source content

* Never call DeepL

* Never block rendering while translation is pending

* Never expose internal translation states unnecessarily

* Preserve menu performance

Avoid N+1 translation queries.

Use efficient eager loading, joins, projections, or batching appropriate to the current ORM.

## Security requirements

Verify:

* DeepL API key is server-side only

* API key is never exposed in frontend bundles

* Translation endpoints require authentication

* Restaurant ownership is validated

* Input lengths are limited

* Batch sizes are limited

* User content is safely stored and rendered

* Logs do not leak secrets

* Errors do not expose provider internals

* Usage cannot be manipulated from the client

* Translation jobs cannot be created for another tenant

## Database migration requirements

Any schema change must include:

* Safe migration

* Correct indexes

* Unique constraints where appropriate

* Foreign keys

* Cascade behaviour reviewed carefully

* Backfill strategy

* Rollback considerations

Potential useful indexes may include:

restaurantId  
menuItemId \+ locale  
status  
sourceHash  
job status \+ createdAt  
usage restaurantId \+ createdAt

Do not add indexes blindly. Base them on real queries.

## Testing requirements

Add or update tests for:

### Unit tests

* Source hash generation

* Changed-field detection

* Manual override protection

* Translation fallback order

* DeepL response mapping

* Character counting

* Retry classification

* Quota checks

* Context construction

* Glossary selection

### Integration tests

* Translate item successfully

* Translate only changed fields

* Preserve unchanged fields

* Preserve old translation on provider failure

* Manual translation is not overwritten

* Outdated status is set correctly

* Cross-tenant access is rejected

* Usage is recorded

* Duplicate jobs are prevented

* Public menu uses stored translation

* Public menu falls back to source language

* Public menu does not call DeepL

### Failure tests

* DeepL timeout

* DeepL rate limit

* DeepL quota exhaustion

* Invalid API key

* Unsupported locale

* Partial batch response

* Job retry exhaustion

* Worker restart during processing

Use the existing testing framework and project conventions.

Do not add superficial tests that only mock the implementation without validating behaviour.

## Implementation constraints

* Follow the existing architecture and naming conventions.

* Avoid unnecessary abstractions.

* Avoid adding Redis if the application does not already need it.

* Avoid self-hosted translation models.

* Do not use NLLB.

* Do not translate on public requests.

* Do not store one translation column per language unless required by existing architecture.

* Do not overwrite manual translations silently.

* Do not re-translate unchanged content.

* Do not perform large unbounded DeepL requests.

* Do not expose provider secrets.

* Keep the implementation compatible with future additional providers, but do not overbuild a complex provider marketplace.

A small provider interface is acceptable:

**interface** TranslationProvider {  
  translate(input: TranslationRequest): Promise\<TranslationResult\>;  
}

However, only create it if it improves the existing implementation rather than adding unnecessary indirection.

## Expected execution process

Work in this order:

1. Inspect the repository.

2. Describe the current implementation with exact file paths and relevant functions.

3. Identify gaps, bugs, risks, and duplicated logic.

4. Propose the smallest safe implementation plan.

5. Implement schema changes.

6. Implement or refactor the DeepL provider.

7. Implement changed-field detection.

8. Implement permanent storage.

9. Implement translation jobs or reuse the existing queue.

10. Implement usage tracking and limits.

11. Implement authenticated APIs.

12. Integrate dashboard controls.

13. Update public menu queries and fallback behaviour.

14. Add tests.

15. Run formatting, linting, type checking, tests, and relevant builds.

16. Review the final diff for regressions and unnecessary code.

## Required final report

When finished, provide:

### Current implementation found

List:

* Existing translation files

* Existing models

* Existing services

* Existing endpoints

* Existing frontend components

* Existing DeepL logic

* Existing tests

Include exact file paths and function names.

### Changes made

For every meaningful change include:

* File path

* Function or class

* What changed

* Why it was needed

### Database changes

Include:

* New tables

* New columns

* New indexes

* New constraints

* Migration behaviour

* Backfill behaviour

### Translation flow

Explain the final end-to-end flow from dashboard edit to public menu display.

### Cost controls

Explain:

* Character counting

* Quotas

* Caching

* Changed-field detection

* Language limits

* Duplicate prevention

### Safety and correctness

Explain:

* Tenant isolation

* Manual override protection

* Failure fallback

* Idempotency

* Retry behaviour

* Public-menu independence from DeepL

### Verification results

Report exact results for:

* Tests

* Type checking

* Lint

* Build

* Database migration validation

Do not say something passed unless you actually executed it.

### Remaining risks

List any:

* Unimplemented UI

* Missing provider capability

* Migration risk

* Scalability limit

* Product decision still required

* Test gap

## Important principle

The goal is not to build the most complex translation platform.

The goal is to create a dependable, low-cost translation workflow suitable for a slowly growing Bulgarian QR menu SaaS:

* DeepL for translation quality

* Database storage for reliability

* Changed-field detection for cost control

* Manual review for correctness

* Context for short dish names

* Simple background processing

* No DeepL dependency during public menu browsing
