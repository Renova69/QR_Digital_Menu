import time
from playwright.sync_api import sync_playwright, expect

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Listen for all console events and print them
    page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))

    try:
        # 1. Navigate to the app and go to the login page
        page.goto("http://localhost:3001/")
        page.get_by_role("link", name="Login").click()

        # 2. Register a new user
        # Use a unique email each time to avoid conflicts
        unique_email = f"testuser_{int(time.time())}@example.com"

        page.get_by_role("button", name="Need an account? Register").click()
        page.get_by_label("Email").fill(unique_email)
        page.get_by_label("Password").fill("password123")
        page.get_by_role("button", name="Register").click()

        # 3. On the dashboard, wait for navigation and then find the form
        page.wait_for_url("**/dashboard")

        # Expect the "Create Your First Restaurant" heading to be visible
        expect(page.get_by_role("heading", name="Create Your First Restaurant")).to_be_visible()

        restaurant_name = "The Grand Jules Bistro"
        page.get_by_label("Restaurant Name").fill(restaurant_name)
        page.get_by_label("Country").fill("France")
        page.get_by_role("button", name="Create Restaurant").click()

        # 4. Assert that the new restaurant appears in the list
        # The list is now visible, so we can find the restaurant name in it.
        expect(page.get_by_role("heading", name="Your Restaurants")).to_be_visible()
        expect(page.get_by_text(restaurant_name)).to_be_visible()

        # 5. Take a screenshot for visual verification
        page.screenshot(path="jules-scratch/verification/dashboard_with_restaurant.png")
        print("Verification successful, screenshot saved.")

    finally:
        browser.close()

if __name__ == "__main__":
    with sync_playwright() as playwright:
        run_verification(playwright)
