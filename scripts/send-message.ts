import { Temporal } from '@js-temporal/polyfill'

const API_URL = process.env.API_URL
const JWT_TOKEN = process.env.JWT_TOKEN
const EMAIL = process.env.EMAIL ?? `smoke-${Temporal.Now.instant().epochMilliseconds}@example.com`

const main = async () => {
  if (!API_URL || !JWT_TOKEN) {
    console.error('Missing required env vars: API_URL, JWT_TOKEN')
    process.exit(1)
  }

  const payload = {
    email: EMAIL,
    firstName: 'Smoke',
    lastName: 'Test',
    data: 'send-message script',
  }

  console.log('Sending message:', payload)

  const response = await fetch(`${API_URL}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${JWT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const body = await response.text()
  console.log(`Status:   ${response.status}`)
  console.log(`Response: ${body}`)

  if (!response.ok) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
