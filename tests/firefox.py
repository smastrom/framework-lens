"""Real Firefox integration check. Uses an isolated temporary profile only.
Run: python3 -m pip install -r tests/requirements.txt
     bun run fixtures && bun run package && python3 tests/firefox.py
"""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
import time
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.support.ui import WebDriverWait

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault('SE_AVOID_STATS', 'true')
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT / 'tests' / '.fixtures')))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:' + str(server.server_port)
options = Options()
options.binary_location = os.environ.get('FIREFOX_BINARY', '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox')
options.add_argument('-headless')
options.set_preference('datareporting.policy.dataSubmissionEnabled', False)
options.set_preference('toolkit.telemetry.enabled', False)
service = Service(service_args=['--allow-system-access'])
driver = webdriver.Firefox(options=options, service=service)
driver.set_script_timeout(10)
try:
    addon = driver.install_addon(str(ROOT / 'dist' / 'framework-lens-1.0.0.xpi'), temporary=True)
    driver.set_context('chrome')
    uuid = json.loads(driver.execute_script('return Services.prefs.getStringPref("extensions.webextensions.uuids")'))[addon]
    driver.set_context('content')
    page = driver.current_window_handle
    driver.switch_to.new_window('tab')
    inspector = driver.current_window_handle
    driver.get('moz-extension://' + uuid + '/popup/index.html')
    print('Firefox', driver.capabilities['browserVersion'], 'extension installed in isolated profile', flush=True)

    def stored():
        driver.switch_to.window(inspector)
        return driver.execute_async_script('''const done=arguments[arguments.length-1]; browser.storage.session.get(null).then(done);''')

    def result_for(url):
        data = stored()
        # The only normal webpage tab is the fixture; the inspector is protected.
        return next((v['result'] for v in data.values() if 'result' in v), None)

    def check(name, expected):
        driver.switch_to.window(page)
        driver.get(base + '/' + name + '.html')
        # Query without activating another tab: switching tabs triggers our rescan.
        time.sleep(2.0 if name != 'late' else 3.8)
        result = WebDriverWait(driver, 10).until(lambda _: result_for(name) or False)
        actual = sorted(f['id'] for f in result['frameworks'])
        assert actual == sorted(expected), (name, actual, expected, result)
        print('PASS', name, actual, flush=True)
        return result

    for framework in ['react','vue','svelte','solid','alpine','lit','preact']:
        check(framework, [framework])
    mixed = check('mixed', ['react','vue','svelte','solid','alpine','lit','preact'])
    assert mixed['frameworks'][0]['id'] == 'react', mixed
    check('plain', [])
    check('csp', ['react'])
    check('iframe', [])
    check('late', ['vue'])

    # Navigate after the startup observer has stopped, then trigger an SPA route.
    driver.switch_to.window(page)
    driver.get(base + '/plain.html')
    time.sleep(8.5)
    driver.execute_script('''document.body.innerHTML='<div id="preact"></div>';const s=document.createElement('script');s.src='preact.js';s.onload=()=>history.pushState({},'', '/spa-preact');document.body.append(s);''')
    time.sleep(1)
    result = result_for('spa-preact')
    assert [f['id'] for f in result['frameworks']] == ['preact'], result
    print('PASS SPA navigation after startup observation', flush=True)

    # Read-only detection must leave official hook slots available to DevTools.
    driver.switch_to.window(page)
    assert driver.execute_script('return window.__REACT_DEVTOOLS_GLOBAL_HOOK__ === undefined && window.__PREACT_DEVTOOLS__ === undefined && window.__VUE_DEVTOOLS_GLOBAL_HOOK__ === undefined')
    print('PASS does not install or overwrite DevTools hooks', flush=True)

    # Render the unchanged popup UI against deterministic visual fixtures.
    # Real detection, messaging and session storage were checked above.
    driver.switch_to.window(inspector)
    for theme in ['light','dark']:
        driver.set_context('chrome')
        driver.execute_script('Services.prefs.setIntPref("layout.css.prefers-color-scheme.content-override", arguments[0])', 0 if theme == 'dark' else 1)
        driver.set_context('content')
        driver.get(base + '/popup/index.html?state=mixed')
        WebDriverWait(driver, 5).until(lambda _: driver.find_elements('css selector', '.main-card'))
        assert driver.find_element('css selector', '.framework-name').text == 'Vue'
        assert len(driver.find_elements('css selector', '.other-row')) == 2
        driver.find_element('tag name','body').screenshot(str(ROOT / 'docs' / ('popup-' + theme + '.png')))
    for state in ['empty','protected']:
        driver.get(base + '/popup/index.html?state=' + state)
        expected = 'This page is protected' if state == 'protected' else 'No framework detected'
        WebDriverWait(driver, 5).until(lambda _: driver.find_element('id','empty-title').text == expected)
        assert driver.find_element('id','empty').is_displayed()
    driver.get(base + '/icons.html')
    assert driver.execute_async_script('''const done=arguments[arguments.length-1];Promise.all([...document.images].map(img=>img.decode())).then(()=>done(true),()=>done(false));''')
    driver.find_element('tag name','body').screenshot(str(ROOT / 'docs' / 'toolbar-icons.png'))
    print('PASS all 49 framework and counter icons decode in Firefox', flush=True)
    print('PASS popup main/additional, empty and protected states', flush=True)
    print('PASS screenshots saved', flush=True)
finally:
    driver.quit()
    server.shutdown()
