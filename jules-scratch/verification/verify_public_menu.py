from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Capture console messages
    messages = []
    page.on("console", lambda msg: messages.append(msg.text))

    page.goto("http://localhost:3001/menu/public/cmeyesfje0001mubtoe573m5c")

    # Wait for the network to be idle
    page.wait_for_load_state("networkidle")

    print("------- HTML CONTENT -------")
    print(page.content())
    print("--------------------------")

    print("------- CONSOLE MESSAGES -------")
    for msg in messages:
        print(msg)
    print("------------------------------")

    # Wait for the menu to be loaded
    expect(page.locator("text=Restaurant Menu")).to_be_visible()

    page.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
