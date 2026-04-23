const puppeteerExtra = require('puppeteer-extra')
const puppeteer = require('puppeteer')
const { executablePath } = puppeteer

const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteerExtra.use(StealthPlugin())

const CDP_PORT = process.env.CDP_PORT || 9222
const VIEWPORT_WIDTH = parseInt(process.env.VIEWPORT_WIDTH || '1920')
const VIEWPORT_HEIGHT = parseInt(process.env.VIEWPORT_HEIGHT || '1080')
const START_URL = process.env.START_URL || 'about:blank'
const USER_AGENT = process.env.USER_AGENT || null

async function main() {
  const browserOptions = {
    args: [
      `--remote-debugging-port=${CDP_PORT}`,
      `--remote-debugging-address=0.0.0.0`,
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--blink-settings=isOnHeadlessHistoricalMode=true',
    ],
    headless: true,
    defaultViewport: null,
    executablePath: executablePath(),
  }

  console.log('Launching stealth Chrome on port ' + CDP_PORT + '...')
  const browser = await puppeteerExtra.launch(browserOptions)

  const context = browser.defaultBrowserContext()
  const page = await browser.newPage()

  await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT })

  if (USER_AGENT) {
    await page.setUserAgent(USER_AGENT)
  }

  // Extra anti-detection: make navigator.webdriver truly undefined
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    })
  })

  console.log('Navigating to: ' + START_URL)
  const response = await page.goto(START_URL, { waitUntil: 'networkidle2' })
  if (response && !response.ok()) {
    console.error('Navigation failed with status: ' + response.status())
  } else {
    console.log('Page loaded successfully')
  }

  console.log('Stealth Chrome ready on port ' + CDP_PORT)
  console.log('CDP endpoint: http://0.0.0.0:' + CDP_PORT)

  // Keep browser alive
  await new Promise(() => {})
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
