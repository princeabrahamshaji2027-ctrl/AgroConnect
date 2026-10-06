import time
from appium import webdriver
from appium.options.common import AppiumOptions
from appium.webdriver.common.appiumby import AppiumBy

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

    print("Connecting...")
    driver = webdriver.Remote('http://127.0.0.1:4723', options=options)
    
    print("Fetching NATIVE_APP page source XML...")
    source = driver.page_source
    with open("page_source.xml", "w", encoding="utf-8") as f:
        f.write(source)
    print("Page source saved to page_source.xml (length: %d)" % len(source))
    
    driver.save_screenshot("native_screen.png")
    print("Screenshot saved to native_screen.png")
    
    driver.quit()

if __name__ == "__main__":
    main()
