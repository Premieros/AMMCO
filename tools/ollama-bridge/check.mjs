const bridge = (process.env.BRIDGE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const token = process.env.BRIDGE_TOKEN

if (!token) {
  console.error('Set BRIDGE_TOKEN first.')
  process.exit(1)
}

const health = await fetch(bridge + '/health')
console.log('health:', health.status, await health.text())

const models = await fetch(bridge + '/v1/models', {
  headers: { Authorization: 'Bearer ' + token },
})
console.log('models:', models.status, await models.text())
