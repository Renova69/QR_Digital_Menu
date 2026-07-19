1. Customer-facing reservation features

These are the things the guest should see on /book/:restaurantId.

Keep for Phase 1
Feature	My opinion
Restaurant-branded booking page	Must have. Same style as the public menu page.
Name	Required.
Mobile phone	Required. In Bulgaria this is more useful than email. Normalize to E.164, default country +359.
Email	Optional. Useful for confirmations, but do not block booking if missing.
Date and time	Required. Show restaurant-local time clearly.
Number of adults	Required.
Number of children	Good idea. Better than only “party size” because staff can prepare high chairs / kids seats.
Total guests auto-calculated	Yes. Adults + children.
Notes / special request	Required as optional text field. Example: “birthday”, “quiet table”, “near window”.
Pet checkbox	Good customer-facing option. “I am coming with a pet.”
Dietary preferences	Yes, but customer-selected. Vegan, vegetarian, gluten intolerance, lactose intolerance, allergies.
Allergen info section at bottom	Strong yes. This is a very good differentiator for your QR menu SaaS.
Confirmation screen	Must have. Show reference number, status, and restaurant contact.
Manage/cancel link	Good, but can be Phase 1.5. Use the safe token pattern later.



For allergens, EU rules already require allergen information for non-prepacked foods such as restaurant food; the European Commission says restaurants/cafés must provide allergen information and written information must be available on request. Regulation 1169/2011 is the core EU food information regulation, and the common implementation is based around the 14 regulated allergens.

Customer-facing allergen section

At the bottom of the reservation page, I would add:

Menu allergens & dietary information

Before booking, please check the allergen information for this restaurant’s menu.
If you or someone in your group has an allergy, intolerance, or dietary restriction, tell the restaurant in the field below.

[View full menu allergens]

Dietary notes:
[ textarea ]

Gluten intolerance
Lactose intolerance
Nut allergy
Vegan
Vegetarian
Pregnant guest
Other allergy


2. Owner/staff-facing reservation features

These belong inside the dashboard.

Keep for Phase 1
Feature	My opinion
Reservations tab	Must have.
Daily list view	Must have. Start with list, not complex calendar/timeline.
Statuses	Keep simple: Pending, Confirmed, Declined, Cancelled, No-show, Arrived.
Accept / Decline buttons	Must have.
Contact guest button	Must have. Call, email, copy phone.
Reservation notes	Must have.
Adults / children split	Must have.
Dietary/allergen warning badges	Very useful. Show clearly in reservation card.
Pet badge	Useful.
Internal staff notes	Yes. Not visible to guest.
Patron tags	Owner-side only. Guest should not see these.
Manual reservation creation	Useful. Staff can add phone bookings.
Search by phone/name	Useful. Helps detect repeat guests.
Basic guest profile by phone/email	Good Phase 1.5.


Owner-side patron tags

Your examples are mostly owner-side tags, not customer-facing fields.

Tag	Customer-facing?	Owner-facing?	My opinion
VIP	No	Yes	Good.
Wine lover	Maybe as preference	Yes	Good.
Always late	No	Yes	Use softer wording: “Often late”.
Low spender	No	Maybe	I would avoid this label. Feels biased and not useful enough.
High spender	No	Maybe	Better as automatic analytics later, not manual tag.
Comes with pet	Yes as checkbox	Yes as tag/history	Good.
Vegan	Yes	Yes	Customer-provided preference.
Vegetarian	Yes	Yes	Customer-provided preference.
Gluten intolerant	Yes	Yes	Treat carefully as sensitive health-related info.
Lactose intolerant	Yes	Yes	Treat carefully as sensitive health-related info.

Allergy/intolerance data can reveal health information, so store it with care: keep it minimal, show why it is collected, avoid marketing use, and give restaurants retention/delete controls. The EDPS describes health data as a special category under GDPR, and explicit consent is commonly required for special-category processing.

3. How I would model the data

Do not mix all tags together. Split them.

Reservation fields
Reservation {
  id
  restaurantId
  status: PENDING | CONFIRMED | DECLINED | CANCELLED | NO_SHOW | ARRIVED

  guestName
  guestPhone
  guestEmail?

  dateTime
  adultsCount
  childrenCount
  totalGuests

  customerNotes?
  internalNotes?

  hasPet: boolean
  occasion?: BIRTHDAY | ANNIVERSARY | BUSINESS | FAMILY | OTHER

  dietaryPreferences: string[]
  allergyNotes?: string

  createdAt
  updatedAt
}
Patron profile fields

Created or matched by phone/email.

Patron {
  id
  restaurantId
  name
  phone
  email?

  tags: PatronTag[]
  staffNotes?
  lastVisitAt?
  reservationsCount
  noShowCount

  createdAt
  updatedAt
}
Tag types

Separate customer-provided data from staff-created labels:

CustomerPreferenceTag:
- VEGAN
- VEGETARIAN
- GLUTEN_INTOLERANT
- LACTOSE_INTOLERANT
- NUT_ALLERGY
- PET
- HIGH_CHAIR
- QUIET_TABLE

StaffPatronTag:
- VIP
- REGULAR
- WINE_LOVER
- OFTEN_LATE
- NO_SHOW_RISK
- PREFERS_TERRACE
- PREFERS_WINDOW
- NEEDS_CALL_CONFIRMATION

I would not add LOW_SPENDER in Phase 1. It can create bad staff behavior and does not help the actual reservation workflow. Later, if needed, use neutral analytics like average spend visible only to owner/manager.


4. Allergen feature — this is worth adding

This is bigger than reservations and should become a menu platform feature.

Owner-facing menu allergen management

Each menu item should have:

MenuItem {
  allergens: AllergenCode[]
  dietaryFlags: DietaryFlag[]
  allergenNote?
}

Example allergen codes:

GLUTEN
CRUSTACEANS
EGGS
FISH
PEANUTS
SOY
MILK
NUTS
CELERY
MUSTARD
SESAME
SULPHITES
LUPIN
MOLLUSCS

Dietary flags:

VEGETARIAN
VEGAN
SPICY
CONTAINS_ALCOHOL
HALAL_OPTIONAL
GLUTEN_FREE_OPTIONAL
LACTOSE_FREE_OPTIONAL

Be careful with GLUTEN_FREE and LACTOSE_FREE. Unless the restaurant guarantees preparation standards, I would call them:

No gluten-containing ingredients marked
No lactose-containing ingredients marked

not guaranteed “free from”.

Customer-facing reservation page

Pull from the restaurant’s active public menu:

This restaurant’s menu contains items marked with:
Gluten, Milk/Lactose, Eggs, Nuts, Fish, Soy...

Then link:

View full allergen menu

This makes the reservation page useful without duplicating the whole menu.


5. Features I would remove or defer from the current plan
Remove from this reservation plan completely
Feature	Why
Item availability work	Already shipped, according to your review. Keep only missing frontend tests if needed.
Full table assignment engine	You do not have table capacity/bookable logic yet and do not want floor schema now.
PostgreSQL exclusion constraint for tables	Only needed when reservations are assigned to exact tables.
Arrival → TableSession conversion	Too early. Reservation is future intent, TableSession is live POS state.
Table status change on reservation accept	Do not do it. It will make free tables look occupied.
Reservable occupancy analytics	Requires reliable table sessions and capacity. Defer.
Table turnover analytics	Requires closedAt and guestCount. Defer.
Deposit/refund system	Too much risk for Phase 1. Add only after real restaurants ask for it.
Waitlist estimator	Useful later, but not needed for basic reservations.
Keep, but simplify
Feature	Simplified version
Availability	Use service hours + optional max covers per slot, not tables.
Dashboard timeline	Start with daily list/cards, not full table timeline.
Notifications	Start with owner/staff notification + optional guest email. Durable outbox later.
Feature flag	Yes: reservations:enabled.
Booking settings	Basic only: enabled, booking hours, lead time, max party size, auto-confirm.
6. Suggested Phase 1 feature set

This is the version I would actually build first.

Customer side
/book/:restaurantId
Restaurant logo, name, address, phone
Name
Mobile phone
Optional email
Date
Time
Adults count
Children count
Pet checkbox
Dietary preferences chips
Allergy/intolerance notes
General notes
Allergen information section pulled from active menu
Submit reservation request
Confirmation page with reference code
Owner side
Reservations dashboard tab
Today / tomorrow / date filter
Status filters
Pending request list
Accept / decline / cancel / mark no-show / mark arrived
Guest contact card
Adults / children / total guests
Dietary/allergy badges
Pet badge
Staff-only patron tags
Internal notes
Manual reservation creation
Basic reservation settings
Realtime reservation:created and reservation:updated
Settings
Enable reservations
Booking form URL
Booking days/hours
Minimum lead time
Booking horizon
Max total guests
Optional max covers per time slot
Auto-confirm on/off
Require phone
Email optional
Allergen section enabled by default
Notification email/phone for owner
7. Features I would add later
Phase 1.5
Guest manage/cancel link
Confirmation email/SMS
Reminder before reservation
Duplicate patron detection by phone
Patron history
CSV export
Blackout dates
Staff comments/activity log
“Needs confirmation call” tag
Simple no-show tracking
Phase 2
Waitlist
Per-slot cover limits
Manual table assignment as optional field
Upcoming reservation indicator on table card
Deposit support
Cancellation policy
Better analytics
Phase 3
Real table capacity model
Table timeline
Arrival → TableSession conversion
Occupancy / turnover analytics
Automated wait estimates
Multi-location reservations
My final recommendation

Build Reservation Requests + Allergens + Patron Notes first.

Do not build the table engine yet. Do not connect reservations to table status yet. Do not add deposits yet. The killer MVP is:

Guest books easily → restaurant receives clean request → owner accepts/declines → staff sees allergies, children, pet, and important guest notes.

That is simple, useful, safe, and much easier to ship without breaking your existing POS/table-session logic.