import time
from playwright.sync_api import sync_playwright, expect

def run_verification(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Listen for all console events and print them
    page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))

    try:
        # 1. Register a new user
        page.goto("http://localhost:3001/")
        page.get_by_role("link", name="Login").click()
        unique_email = f"testuser_{int(time.time())}@example.com"
        page.get_by_role("button", name="Need an account? Register").click()
        page.get_by_label("Email").fill(unique_email)
        page.get_by_label("Password").fill("password123")
        page.get_by_role("button", name="Register").click()

        # 2. Create a restaurant
        page.wait_for_url("**/dashboard")
        page.get_by_label("Restaurant Name").fill("The Code Bistro")
        page.get_by_label("Country").fill("Cyberspace")
        page.get_by_role("button", name="Create Restaurant").click()

        # 3. Navigate to Menu Editor
        page.get_by_role("button", name="Edit Menu").click()
        page.wait_for_url("**/dashboard/menu")
        expect(page.get_by_role("heading", name="Menu Editor")).to_be_visible()

        # 4. Create a new category
        category_name = "Appetizers"
        page.get_by_placeholder("Category Name").fill(category_name)
        page.get_by_role("button", name="Add Category").click()
        expect(page.get_by_text(category_name)).to_be_visible()

        # 5. Create a new item in that category
        item_name = "Data Bites"
        page.get_by_placeholder("Item Name").fill(item_name)
        page.get_by_placeholder("Description").fill("A small portion of raw data.")
        page.get_by_placeholder("Price").fill("10.11")
        page.get_by_role("button", name="Add Item").click()
        expect(page.get_by_text(item_name)).to_be_visible()

        # 6. Take a screenshot for visual verification
        page.screenshot(path="jules-scratch/verification/menu_editor.png")
        print("Verification successful, screenshot saved.")

    finally:
        browser.close()

if __name__ == "__main__":
    with sync_playwright() as playwright:
        run_verification(playwright)
