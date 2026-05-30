# Community 35

**Community 35** — 3 nodes

## Nodes

### run_verification()
- **ID:** `verification_verify_restaurant_run_verification`
- **Type:** code
- **Degree:** 2
- **Source:** `jules-scratch/verification/verify_restaurant.py` @ L4
- **Cross-community:**
  - ↔ `int()` [_`calls`_ | c145]

### verify_menu_editor.py
- **ID:** `jules_scratch_verification_verify_menu_editor_py`
- **Type:** code
- **Degree:** 1
- **Source:** `jules-scratch/verification/verify_menu_editor.py` @ L1
- **Cross-community:**
  - ↔ `run_verification()` [_`contains`_ | c145]

### verify_restaurant.py
- **ID:** `jules_scratch_verification_verify_restaurant_py`
- **Type:** code
- **Degree:** 1
- **Source:** `jules-scratch/verification/verify_restaurant.py` @ L1
- **Outbound:**
  - → `run_verification()` [_`contains`_ | EXTRACTED | score: 1.0]
