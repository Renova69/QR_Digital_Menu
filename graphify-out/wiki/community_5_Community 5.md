# Community 5

**Community 5** — 36 nodes

## Nodes

### AuthService
- **ID:** `auth_auth_service_authservice`
- **Type:** code
- **Degree:** 22
- **Source:** `apps/backend/src/auth/auth.service.ts` @ L19
- **Outbound:**
  - → `.validateUser()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.validateGoogleUser()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.twilioConfigured()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.twilioBasicAuth()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.twilioVerifyUrl()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.sendTwilioOtp()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.verifyTwilioOtp()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.sendOtp()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.updateProfile()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.verifyOtp()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `auth.controller.ts` [_`imports`_ | c76]
  - ↔ `auth.module.ts` [_`imports`_ | c52]
  - ↔ `auth.service.spec.ts` [_`imports`_ | c77]
  - ↔ `auth.service.ts` [_`contains`_ | c44]
  - ↔ `.constructor()` [_`method`_ | c41]

### AuthController
- **ID:** `auth_auth_controller_authcontroller`
- **Type:** code
- **Degree:** 16
- **Source:** `apps/backend/src/auth/auth.controller.ts` @ L41
- **Outbound:**
  - → `.getProfile()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.googleAuth()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.googleAuthRedirect()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.logout()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.getCsrfToken()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `auth.controller.ts` [_`contains`_ | c76]
  - ↔ `.constructor()` [_`method`_ | c54]
  - ↔ `.register()` [_`method`_ | c54]
  - ↔ `.login()` [_`method`_ | c54]
  - ↔ `.updateProfile()` [_`method`_ | c54]

### UsersService
- **ID:** `users_users_service_usersservice`
- **Type:** code
- **Degree:** 15
- **Source:** `apps/backend/src/users/users.service.ts` @ L10
- **Outbound:**
  - → `.findByEmail()` [_`method`_ | EXTRACTED | score: 1.0]
  - → `.findByPhone()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `auth.service.ts` [_`imports`_ | c44]
  - ↔ `staff.controller.ts` [_`imports`_ | c38]
  - ↔ `users.module.ts` [_`imports`_ | c52]
  - ↔ `users.service.spec.ts` [_`imports`_ | c44]
  - ↔ `users.service.ts` [_`contains`_ | c44]

### setTokenCookie()
- **ID:** `auth_auth_controller_settokencookie`
- **Type:** code
- **Degree:** 6
- **Source:** `apps/backend/src/auth/auth.controller.ts` @ L36
- **Outbound:**
  - → `.googleAuthRedirect()` [_`calls`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `auth.controller.ts` [_`contains`_ | c76]
  - ↔ `.register()` [_`calls`_ | c54]
  - ↔ `.login()` [_`calls`_ | c54]
  - ↔ `.verifyOtp()` [_`calls`_ | c54]
  - ↔ `.pinLogin()` [_`calls`_ | c54]

### GoogleAuthGuard
- **ID:** `auth_google_auth_guard_googleauthguard`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/backend/src/auth/google-auth.guard.ts` @ L16
- **Outbound:**
  - → `.getAuthenticateOptions()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `auth.controller.ts` [_`imports`_ | c76]
  - ↔ `google-auth.guard.spec.ts` [_`imports`_ | c85]
  - ↔ `google-auth.guard.ts` [_`contains`_ | c85]
  - ↔ `.canActivate()` [_`method`_ | c85]

### JwtStrategy
- **ID:** `auth_jwt_strategy_jwtstrategy`
- **Type:** code
- **Degree:** 5
- **Source:** `apps/backend/src/auth/jwt.strategy.ts` @ L8
- **Outbound:**
  - → `.validate()` [_`method`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `auth.module.ts` [_`imports`_ | c52]
  - ↔ `jwt.strategy.spec.ts` [_`imports`_ | c6]
  - ↔ `jwt.strategy.ts` [_`contains`_ | c6]
  - ↔ `.constructor()` [_`method`_ | c6]

### .sendTwilioOtp()
- **ID:** `auth_auth_service_authservice_sendtwiliootp`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/auth/auth.service.ts` @ L135
- **Outbound:**
  - → `.sendOtp()` [_`calls`_ | EXTRACTED | score: 1.0]

### .verifyTwilioOtp()
- **ID:** `auth_auth_service_authservice_verifytwiliootp`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/auth/auth.service.ts` @ L158
- **Outbound:**
  - → `.verifyOtp()` [_`calls`_ | EXTRACTED | score: 1.0]

### GoogleStrategy
- **ID:** `auth_google_strategy_googlestrategy`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/auth/google.strategy.ts` @ L6
- **Cross-community:**
  - ↔ `auth.module.ts` [_`imports`_ | c52]
  - ↔ `google.strategy.ts` [_`contains`_ | c52]
  - ↔ `.constructor()` [_`method`_ | c52]
  - ↔ `.validate()` [_`method`_ | c52]

### LocalStrategy
- **ID:** `auth_local_strategy_localstrategy`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/auth/local.strategy.ts` @ L7
- **Cross-community:**
  - ↔ `auth.module.ts` [_`imports`_ | c52]
  - ↔ `local.strategy.ts` [_`contains`_ | c52]
  - ↔ `.constructor()` [_`method`_ | c52]
  - ↔ `.validate()` [_`method`_ | c52]

### CreateAuthDto
- **ID:** `dto_create_auth_dto_createauthdto`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/src/auth/dto/create-auth.dto.ts` @ L3
- **Cross-community:**
  - ↔ `auth.controller.ts` [_`imports`_ | c76]
  - ↔ `auth.service.ts` [_`imports`_ | c44]
  - ↔ `create-auth.dto.ts` [_`contains`_ | c76]
  - ↔ `update-auth.dto.ts` [_`imports`_ | c76]

### .googleAuthRedirect()
- **ID:** `auth_auth_controller_authcontroller_googleauthredirect`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/auth/auth.controller.ts` @ L93
- **Cross-community:**
  - ↔ `.login()` [_`calls`_ | c54]

### .sendOtp()
- **ID:** `auth_auth_service_authservice_sendotp`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/auth/auth.service.ts` @ L186
- **Cross-community:**
  - ↔ `.checkCustomersAuthFeature()` [_`calls`_ | c41]

### .twilioBasicAuth()
- **ID:** `auth_auth_service_authservice_twiliobasicauth`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/auth/auth.service.ts` @ L125
- **Outbound:**
  - → `.sendTwilioOtp()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `.verifyTwilioOtp()` [_`calls`_ | EXTRACTED | score: 1.0]

### .twilioVerifyUrl()
- **ID:** `auth_auth_service_authservice_twilioverifyurl`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/auth/auth.service.ts` @ L131
- **Outbound:**
  - → `.sendTwilioOtp()` [_`calls`_ | EXTRACTED | score: 1.0]
  - → `.verifyTwilioOtp()` [_`calls`_ | EXTRACTED | score: 1.0]

### .verifyOtp()
- **ID:** `auth_auth_service_authservice_verifyotp`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/auth/auth.service.ts` @ L391
- **Cross-community:**
  - ↔ `.checkCustomersAuthFeature()` [_`calls`_ | c41]

### UsersModule
- **ID:** `users_users_module_usersmodule`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/src/users/users.module.ts` @ L10
- **Cross-community:**
  - ↔ `auth.module.ts` [_`imports`_ | c52]
  - ↔ `restaurants.module.ts` [_`imports`_ | c15]
  - ↔ `users.module.ts` [_`contains`_ | c52]

### AuthModule
- **ID:** `auth_auth_module_authmodule`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/auth/auth.module.ts` @ L36
- **Cross-community:**
  - ↔ `app.module.ts` [_`imports`_ | c15]
  - ↔ `auth.module.ts` [_`contains`_ | c52]

### LocalAuthGuard
- **ID:** `auth_local_auth_guard_localauthguard`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/auth/local-auth.guard.ts` @ L5
- **Cross-community:**
  - ↔ `auth.controller.ts` [_`imports`_ | c76]
  - ↔ `local-auth.guard.ts` [_`contains`_ | c76]

### login()
- **ID:** `lib_api_login`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L46
- **Cross-community:**
  - ↔ `AuthContext.tsx` [_`imports`_ | c7]
  - ↔ `api.ts` [_`contains`_ | c3]

### register()
- **ID:** `lib_api_register`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/src/lib/api.ts` @ L51
- **Cross-community:**
  - ↔ `AuthContext.tsx` [_`imports`_ | c7]
  - ↔ `api.ts` [_`contains`_ | c3]

### .getCsrfToken()
- **ID:** `auth_auth_controller_authcontroller_getcsrftoken`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/auth/auth.controller.ts` @ L155

### .getProfile()
- **ID:** `auth_auth_controller_authcontroller_getprofile`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/auth/auth.controller.ts` @ L69

### .googleAuth()
- **ID:** `auth_auth_controller_authcontroller_googleauth`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/auth/auth.controller.ts` @ L87

### .logout()
- **ID:** `auth_auth_controller_authcontroller_logout`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/auth/auth.controller.ts` @ L138

### COOKIE_OPTIONS
- **ID:** `auth_auth_controller_cookie_options`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/auth/auth.controller.ts` @ L28
- **Cross-community:**
  - ↔ `auth.controller.ts` [_`contains`_ | c76]

### .twilioConfigured()
- **ID:** `auth_auth_service_authservice_twilioconfigured`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/auth/auth.service.ts` @ L117

### .updateProfile()
- **ID:** `auth_auth_service_authservice_updateprofile`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/auth/auth.service.ts` @ L382

### .validateGoogleUser()
- **ID:** `auth_auth_service_authservice_validategoogleuser`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/auth/auth.service.ts` @ L60

### .validateUser()
- **ID:** `auth_auth_service_authservice_validateuser`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/auth/auth.service.ts` @ L28

### .getAuthenticateOptions()
- **ID:** `auth_google_auth_guard_googleauthguard_getauthenticateoptions`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/auth/google-auth.guard.ts` @ L49

### .validate()
- **ID:** `auth_jwt_strategy_jwtstrategy_validate`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/auth/jwt.strategy.ts` @ L41

### UpdateAuthDto
- **ID:** `dto_update_auth_dto_updateauthdto`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/auth/dto/update-auth.dto.ts` @ L4
- **Cross-community:**
  - ↔ `update-auth.dto.ts` [_`contains`_ | c76]

### .findByEmail()
- **ID:** `users_users_service_usersservice_findbyemail`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/users/users.service.ts` @ L18

### .findByPhone()
- **ID:** `users_users_service_usersservice_findbyphone`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/users/users.service.ts` @ L23
