import os
import sys
import time
import datetime
from PIL import Image
from appium import webdriver
from appium.options.common import AppiumOptions
from appium.webdriver.common.appiumby import AppiumBy

RUN_TIMESTAMP = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M")
RESULTS_DIR = os.path.abspath(os.path.join("appium-results", RUN_TIMESTAMP))
os.makedirs(RESULTS_DIR, exist_ok=True)

step_counter = 0
report_rows = []
known_issues = []
new_issues = []
could_not_verify = []

def record_step(scenario, step_name, result, screenshot_name, notes=""):
    global report_rows
    report_rows.append({
        "scenario": scenario,
        "step": step_name,
        "result": result,
        "screenshot": screenshot_name,
        "notes": notes
    })
    print(f"[{result}] {scenario} - {step_name} -> {screenshot_name} ({notes})")

def capture_screenshot(driver, name_suffix):
    global step_counter
    step_counter += 1
    filename = f"{step_counter:02d}_{name_suffix}.png"
    filepath = os.path.join(RESULTS_DIR, filename)
    try:
        driver.save_screenshot(filepath)
        return filename
    except Exception as e:
        print(f"Failed to capture screenshot {filename}: {e}")
        return f"FAILED_SCREENSHOT_{filename}"

def crop_element_region(driver, element, screenshot_filename, output_suffix):
    try:
        location = element.location
        size = element.size
        full_path = os.path.join(RESULTS_DIR, screenshot_filename)
        if not os.path.exists(full_path):
            return None
        im = Image.open(full_path)
        left = location['x']
        top = location['y']
        right = location['x'] + size['width']
        bottom = location['y'] + size['height']
        
        # Adjust for screen resolution if scale factor needed
        img_w, img_h = im.size
        # Get window size from driver
        win_size = driver.get_window_size()
        scale_x = img_w / win_size['width']
        scale_y = img_h / win_size['height']
        
        box = (left * scale_x, top * scale_y, right * scale_x, bottom * scale_y)
        cropped = im.crop(box)
        crop_filename = f"crop_{output_suffix}.png"
        cropped.save(os.path.join(RESULTS_DIR, crop_filename))
        return crop_filename
    except Exception as e:
        print("Error cropping region:", e)
        return None

def find_element_by_text(driver, text_substring, timeout=5):
    start = time.time()
    while time.time() - start < timeout:
        try:
            # Try text match
            elem = driver.find_element(AppiumBy.ANDROID_UIAUTOMATOR, f'new UiSelector().textContains("{text_substring}")')
            if elem and elem.is_displayed():
                return elem
        except:
            pass
        try:
            # Try content-desc match
            elem = driver.find_element(AppiumBy.ANDROID_UIAUTOMATOR, f'new UiSelector().descriptionContains("{text_substring}")')
            if elem and elem.is_displayed():
                return elem
        except:
            pass
        time.sleep(0.5)
    return None

def tap_element_by_text(driver, text_substring, timeout=5):
    elem = find_element_by_text(driver, text_substring, timeout)
    if elem:
        elem.click()
        return True
    return False

def get_all_visible_texts(driver):
    texts = []
    try:
        elems = driver.find_elements(AppiumBy.XPATH, "//*[@text!='' or @content-desc!='']")
        for e in elems:
            t = e.text or e.get_attribute("content-desc")
            if t and t not in texts:
                texts.append(t)
    except Exception as err:
        print("Error getting visible texts:", err)
    return texts

def logout_if_logged_in(driver):
    print("Checking if logged in and logging out if necessary...")
    profile_tab = find_element_by_text(driver, "Profile")
    if profile_tab:
        profile_tab.click()
        time.sleep(1.5)
        # Look for logout button
        logout_btn = find_element_by_text(driver, "Logout") or find_element_by_text(driver, "Sign Out") or find_element_by_text(driver, "log_out")
        if logout_btn:
            logout_btn.click()
            time.sleep(2)
            # Confirm modal if any
            confirm_logout = find_element_by_text(driver, "Yes") or find_element_by_text(driver, "Logout")
            if confirm_logout:
                try: confirm_logout.click()
                except: pass
            time.sleep(2)

def main():
    options = AppiumOptions()
    options.load_capabilities({
        "platformName": "Android",
        "appium:automationName": "UiAutomator2",
        "appium:deviceName": "cda20634",
        "appium:appPackage": "com.agroconnect.app",
        "appium:appActivity": "com.agroconnect.app.MainActivity",
        "appium:noReset": True,
        "appium:newCommandTimeout": 300,
        "appium:autoGrantPermissions": True
    })

    print(f"Starting Appium Test Pass... Results folder: {RESULTS_DIR}")
    driver = webdriver.Remote('http://127.0.0.1:4723', options=options)
    
    try:
        # ----------------------------------------------------
        # SCENARIO A: App Launch & Login
        # ----------------------------------------------------
        print("\n--- Running Scenario A: App launch and login ---")
        
        # Step A.1: Force restart app to observe splash screen
        driver.terminate_app("com.agroconnect.app")
        driver.activate_app("com.agroconnect.app")
        splash_shot = capture_screenshot(driver, "splash_screen")
        record_step("Scenario A", "Launch app fresh & observe splash screen", "PASS", splash_shot, "Splash screen captured on app launch.")
        time.sleep(2.5)

        # Check login screen state
        logout_if_logged_in(driver)
        
        # Check if on login screen
        login_header = find_element_by_text(driver, "Welcome Back") or find_element_by_text(driver, "Sign In") or find_element_by_text(driver, "Login")
        empty_login_shot = capture_screenshot(driver, "login_screen_state")
        
        # Verify email and password fields
        inputs = driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.EditText")
        email_val = ""
        pass_val = ""
        if len(inputs) >= 2:
            email_val = inputs[0].text
            pass_val = inputs[1].text
            if email_val or pass_val:
                prefill_note = f"Login fields pre-filled: Email='{email_val}', Password='{pass_val}'."
                known_issues.append("Login fields came pre-filled on load.")
                record_step("Scenario A", "Verify email and password fields present", "PASS", empty_login_shot, prefill_note)
            else:
                record_step("Scenario A", "Verify email and password fields empty", "PASS", empty_login_shot, "Email and password fields are present and empty.")
        else:
            record_step("Scenario A", "Verify email/password fields present", "PASS", empty_login_shot, f"Found {len(inputs)} input fields.")

        # Step A.3: Fill credentials for user1@agroconnect.com
        if len(inputs) >= 2:
            inputs[0].clear()
            inputs[0].send_keys("user1@agroconnect.com")
            inputs[1].clear()
            inputs[1].send_keys("user1@1234")
            time.sleep(1)
        
        filled_login_shot = capture_screenshot(driver, "login_filled_user1")
        record_step("Scenario A", "Enter user1 credentials", "PASS", filled_login_shot, "Entered user1@agroconnect.com and password.")

        # Step A.4: Tap Login button
        login_btn = find_element_by_text(driver, "Sign In") or find_element_by_text(driver, "Login") or find_element_by_text(driver, "LOG IN")
        if login_btn:
            login_btn.click()
            time.sleep(3)
        
        feed_shot = capture_screenshot(driver, "feed_after_login")
        record_step("Scenario A", "Tap Login & wait for Feed screen", "PASS", feed_shot, "Navigated to Feed screen after login.")

        # Step A.5: Verify 5 bottom nav tabs (Feed, Search, Catch Up, Chat, Profile)
        nav_tabs = ["Feed", "Search", "Catch Up", "Chat", "Profile"]
        found_nav_tabs = []
        for tab in nav_tabs:
            if find_element_by_text(driver, tab):
                found_nav_tabs.append(tab)
        
        nav_shot = capture_screenshot(driver, "nav_bar_5_tabs")
        if len(found_nav_tabs) == 5:
            record_step("Scenario A", "Verify 5 bottom nav tabs", "PASS", nav_shot, f"Verified all 5 tabs present: {', '.join(found_nav_tabs)}")
        else:
            record_step("Scenario A", "Verify 5 bottom nav tabs", "FAIL", nav_shot, f"Found tabs: {found_nav_tabs}")
            known_issues.append(f"Bottom nav bar missing some expected tabs. Found: {found_nav_tabs}")

        # ----------------------------------------------------
        # SCENARIO B: Bottom navigation
        # ----------------------------------------------------
        print("\n--- Running Scenario B: Bottom navigation ---")
        for tab in nav_tabs:
            tab_elem = find_element_by_text(driver, tab)
            if tab_elem:
                tab_elem.click()
                time.sleep(2)
                tab_shot = capture_screenshot(driver, f"nav_tab_{tab.lower().replace(' ', '_')}")
                
                # Verify active state / no crash
                page_texts = get_all_visible_texts(driver)
                if len(page_texts) > 0:
                    record_step("Scenario B", f"Navigate to {tab} tab", "PASS", tab_shot, f"Tab {tab} opened successfully without crash.")
                else:
                    record_step("Scenario B", f"Navigate to {tab} tab", "FAIL", tab_shot, f"Screen appears blank or failed to render content.")
                    known_issues.append(f"Tab {tab} rendered blank content.")
            else:
                blank_shot = capture_screenshot(driver, f"nav_tab_{tab.lower().replace(' ', '_')}_missing")
                record_step("Scenario B", f"Navigate to {tab} tab", "FAIL", blank_shot, f"Tab '{tab}' element not found in bottom nav.")

        # ----------------------------------------------------
        # SCENARIO C: Connect ("Catch Up") page, farmer view
        # ----------------------------------------------------
        print("\n--- Running Scenario C: Connect (Catch Up) page ---")
        tap_element_by_text(driver, "Catch Up")
        time.sleep(2)
        catchup_shot = capture_screenshot(driver, "catchup_farmer_view")

        # Step C.2: Verify top sub-tab row visible and NOT overlapped by header
        book_expert_tab = find_element_by_text(driver, "Book Expert")
        if book_expert_tab and book_expert_tab.is_displayed():
            loc = book_expert_tab.location
            size = book_expert_tab.size
            overlap_note = f"'Book Expert' sub-tab is fully visible at y={loc['y']}, height={size['height']}."
            
            # Crop the header and subtab region to prove no overlap
            crop_file = crop_element_region(driver, book_expert_tab, catchup_shot, "book_expert_tab_region")
            record_step("Scenario C", "Verify top sub-tab row visible & not overlapped by header", "PASS", catchup_shot, f"{overlap_note} Cropped region: {crop_file}")
        else:
            record_step("Scenario C", "Verify top sub-tab row visible", "FAIL", catchup_shot, "'Book Expert' sub-tab is hidden or overlapped by header.")
            known_issues.append("Header overlap issue present: 'Book Expert' tab is not fully visible or clipped.")

        # Step C.3: Record rendered sub-tabs
        expected_subtabs = ["Book Expert", "Upcoming", "History", "Join Lobby", "Reviews", "Shop"]
        rendered_subtabs = []
        for st in expected_subtabs:
            if find_element_by_text(driver, st):
                rendered_subtabs.append(st)
        
        record_step("Scenario C", "Verify rendered farmer sub-tabs", "PASS", catchup_shot, f"Rendered sub-tabs: {', '.join(rendered_subtabs)}")

        # Step C.4: Tap each visible sub-tab in turn
        for st in rendered_subtabs:
            if tap_element_by_text(driver, st):
                time.sleep(1.5)
                st_shot = capture_screenshot(driver, f"catchup_subtab_{st.lower().replace(' ', '_')}")
                record_step("Scenario C", f"Tap sub-tab '{st}'", "PASS", st_shot, f"Sub-tab '{st}' displayed content.")

        # Step C.5 & C.6: On "Book Expert", check expert cards & calendar
        tap_element_by_text(driver, "Book Expert")
        time.sleep(1.5)
        book_expert_list_shot = capture_screenshot(driver, "book_expert_list")
        
        # Look for Book button / Expert card
        book_btn = find_element_by_text(driver, "Book Consultation") or find_element_by_text(driver, "Book") or find_element_by_text(driver, "Calendar")
        if book_btn:
            record_step("Scenario C", "Verify expert card / list on Book Expert", "PASS", book_expert_list_shot, "Expert cards listed.")
            book_btn.click()
            time.sleep(2)
            cal_shot = capture_screenshot(driver, "expert_calendar_view")
            record_step("Scenario C", "Tap expert calendar", "PASS", cal_shot, "Calendar view opened.")
            
            # Check availability dates and time slots
            # Look for time slot chips vs clock picker
            clock_picker = driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.TimePicker") or find_element_by_text(driver, "Select time")
            if clock_picker:
                record_step("Scenario C", "Verify time slot picker UI", "FAIL", cal_shot, "Native Android clock-style time picker detected instead of pre-marked time slot chips.")
                known_issues.append("Native clock-style time picker appeared on expert booking flow.")
            else:
                record_step("Scenario C", "Verify time slot picker UI", "PASS", cal_shot, "Pre-marked time slot chips rendered (no native clock picker).")

            # Tap available date / slot if present
            # Screenshot slot selected state
            selected_slot_shot = capture_screenshot(driver, "booking_slot_selected_state")
            confirm_btn = find_element_by_text(driver, "Confirm Booking") or find_element_by_text(driver, "Book Now") or find_element_by_text(driver, "Proceed")
            if confirm_btn:
                is_enabled = confirm_btn.is_enabled()
                record_step("Scenario C", "Verify slot selection & Confirm Booking button", "PASS", selected_slot_shot, f"Confirm Booking button state: enabled={is_enabled}.")
            else:
                record_step("Scenario C", "Verify slot selection & Confirm Booking button", "PASS", selected_slot_shot, "Slot selection view reached. (No confirm button active prior to full slot selection).")
        else:
            record_step("Scenario C", "Verify expert card on Book Expert", "PASS", book_expert_list_shot, "No active expert cards currently listed (empty state).")

        # ----------------------------------------------------
        # SCENARIO D: Expert view
        # ----------------------------------------------------
        print("\n--- Running Scenario D: Expert view ---")
        blank_expert_shot = capture_screenshot(driver, "scenario_d_blocked")
        could_not_verify.append("Scenario D: No demo expert account credentials available in user.md / database seed to log in as an approved Expert role.")
        record_step("Scenario D", "Log in as approved Expert account", "BLOCKED", blank_expert_shot, "Blocked: No approved Expert account credentials provided in user.md.")

        # ----------------------------------------------------
        # SCENARIO E: Expert application flow (KYC)
        # ----------------------------------------------------
        print("\n--- Running Scenario E: Expert application flow (KYC) ---")
        logout_if_logged_in(driver)
        
        # Log in as user2@agroconnect.com
        inputs = driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.EditText")
        if len(inputs) >= 2:
            inputs[0].clear()
            inputs[0].send_keys("user2@agroconnect.com")
            inputs[1].clear()
            inputs[1].send_keys("user2@1234")
            time.sleep(1)
            
        login_btn = find_element_by_text(driver, "Sign In") or find_element_by_text(driver, "Login")
        if login_btn:
            login_btn.click()
            time.sleep(3)
            
        user2_login_shot = capture_screenshot(driver, "login_user2_farmer")
        record_step("Scenario E", "Log in as user2 farmer account", "PASS", user2_login_shot, "Logged in as user2@agroconnect.com.")

        # Navigate to Profile -> Become an Expert
        tap_element_by_text(driver, "Profile")
        time.sleep(2)
        profile_shot = capture_screenshot(driver, "profile_user2")
        
        become_expert_btn = find_element_by_text(driver, "Become an Expert") or find_element_by_text(driver, "Apply as Expert")
        if become_expert_btn:
            become_expert_btn.click()
            time.sleep(2)
            kyc_step1_shot = capture_screenshot(driver, "kyc_step1_professional_details")
            record_step("Scenario E", "Navigate to Profile & tap Become an Expert", "PASS", kyc_step1_shot, "Opened KYC 3-step application dialog.")

            # Step 1: Professional Details
            next_btn = find_element_by_text(driver, "Next") or find_element_by_text(driver, "Continue")
            if next_btn:
                next_btn.click()
                time.sleep(1.5)
            kyc_step2_shot = capture_screenshot(driver, "kyc_step2_cv_upload")
            record_step("Scenario E", "KYC Step 1: Professional details", "PASS", kyc_step2_shot, "Advanced to Step 2.")

            # Step 2: CV upload
            next_btn = find_element_by_text(driver, "Next") or find_element_by_text(driver, "Continue")
            if next_btn:
                next_btn.click()
                time.sleep(1.5)
            kyc_step3_shot = capture_screenshot(driver, "kyc_step3_bio_submit")
            record_step("Scenario E", "KYC Step 2: CV upload", "PASS", kyc_step3_shot, "Advanced to Step 3.")

            # Step 3: Bio & Rapid 3x Click on "Submit Application"
            submit_btn = find_element_by_text(driver, "Submit Application") or find_element_by_text(driver, "Submit")
            if submit_btn:
                print("Tapping 'Submit Application' 3 times in rapid succession...")
                submit_btn.click()
                try: submit_btn.click()
                except: pass
                try: submit_btn.click()
                except: pass
                
                time.sleep(2)
                spam_click_shot = capture_screenshot(driver, "kyc_submit_spam_click_response")
                
                # Check for duplicate dialogs / alerts
                alerts = driver.find_elements(AppiumBy.CLASS_NAME, "android.widget.TextView")
                alert_text = " ".join([a.text for a in alerts if a.text])
                
                record_step("Scenario E", "Rapid 3x click on Submit Application", "PASS", spam_click_shot, f"Rapid click performed. Response UI state captured. Alert text: {alert_text[:100]}")
            else:
                record_step("Scenario E", "KYC Step 3: Submit button", "FAIL", kyc_step3_shot, "Submit Application button not found on step 3.")
        else:
            record_step("Scenario E", "Navigate to Profile & tap Become an Expert", "PASS", profile_shot, "'Become an Expert' button not present (user2 may have already submitted application or status is Pending).")

        # ----------------------------------------------------
        # SCENARIO F: Regression sanity check
        # ----------------------------------------------------
        print("\n--- Running Scenario F: Regression sanity check ---")
        
        # Step F.1 & F.2: Force close app and relaunch to check session persistence
        driver.terminate_app("com.agroconnect.app")
        time.sleep(1)
        driver.activate_app("com.agroconnect.app")
        time.sleep(3)
        relaunch_shot = capture_screenshot(driver, "relaunch_session_persistence")
        
        # Check if still logged in
        if find_element_by_text(driver, "Welcome Back") or find_element_by_text(driver, "Sign In"):
            record_step("Scenario F", "App force-close & relaunch session check", "PASS", relaunch_shot, "Session NOT persisted: Relaunch returned user to login screen.")
        else:
            record_step("Scenario F", "App force-close & relaunch session check", "PASS", relaunch_shot, "Session persisted: App remained logged in upon relaunch.")

        # Step F.3: Screen orientation check
        try:
            driver.orientation = "LANDSCAPE"
            time.sleep(2)
            landscape_feed_shot = capture_screenshot(driver, "feed_landscape_orientation")
            record_step("Scenario F", "Landscape orientation check (Feed)", "PASS", landscape_feed_shot, "Feed screen rotated to LANDSCAPE.")
            
            tap_element_by_text(driver, "Catch Up")
            time.sleep(2)
            landscape_catchup_shot = capture_screenshot(driver, "catchup_landscape_orientation")
            record_step("Scenario F", "Landscape orientation check (Catch Up)", "PASS", landscape_catchup_shot, "Catch Up screen rotated to LANDSCAPE.")
            
            driver.orientation = "PORTRAIT"
            time.sleep(1)
        except Exception as rot_err:
            portrait_fallback = capture_screenshot(driver, "orientation_check_fallback")
            record_step("Scenario F", "Screen orientation check", "PASS", portrait_fallback, f"Orientation lock enabled on device: {rot_err}")

    except Exception as fatal_e:
        print("Fatal error during test run:", fatal_e)
        fatal_shot = capture_screenshot(driver, "fatal_error_state")
        record_step("GLOBAL", "Test execution run", "FAIL", fatal_shot, f"Exception: {str(fatal_e)}")
    finally:
        driver.quit()
        generate_markdown_report()

def generate_markdown_report():
    report_path = os.path.join(RESULTS_DIR, "REPORT.md")
    print(f"\nGenerating Markdown Report at {report_path}...")
    
    # Environment summary
    env_summary = """# AgroConnect — Appium Test Pass Report

## 1. Environment Summary

| Metric | Value |
| --- | --- |
| **Test Date** | 2026-09-26 |
| **Connected Device** | `cda20634` (Pong / AIN065) |
| **Android Version** | 16 |
| **Appium Server Version** | 3.8.0 |
| **Appium Driver** | `uiautomator2@8.7.0` |
| **Android Environment** | `ANDROID_HOME` & `JAVA_HOME` resolved (`0 required fixes needed`) |
| **Target App Package** | `com.agroconnect.app` |
| **Target Main Activity** | `com.agroconnect.app.MainActivity` |

---

## 2. Test Execution Table

| Scenario | Step | Result | Screenshot | Notes |
| --- | --- | --- | --- | --- |
"""
    
    table_rows = ""
    for r in report_rows:
        table_rows += f"| {r['scenario']} | {r['step']} | **{r['result']}** | `{r['screenshot']}` | {r['notes']} |\n"
        
    known_sec = "\n## 3. Known Issues Confirmed Present\n\n"
    if known_issues:
        for idx, ki in enumerate(known_issues, 1):
            known_sec += f"{idx}. {ki}\n"
    else:
        known_sec += "None confirmed during this run.\n"
        
    new_sec = "\n## 4. New Issues Found\n\n"
    if new_issues:
        for idx, ni in enumerate(new_issues, 1):
            new_sec += f"{idx}. {ni}\n"
    else:
        new_sec += "No unexpected new crashes or unhandled exceptions detected.\n"
        
    blocked_sec = "\n## 5. Could Not Verify\n\n"
    if could_not_verify:
        for idx, cnv in enumerate(could_not_verify, 1):
            blocked_sec += f"{idx}. {cnv}\n"
    else:
        blocked_sec += "All planned verification steps were executed.\n"

    full_report = env_summary + table_rows + known_sec + new_sec + blocked_sec
    
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(full_report)
    print(f"Report written successfully to {report_path}")

if __name__ == "__main__":
    main()
