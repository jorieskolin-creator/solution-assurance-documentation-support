import { spawn, type ChildProcess } from 'node:child_process'
import { createAiAssistServer } from './aiAssist.ts'

const server = createAiAssistServer()
let caddy: ChildProcess | undefined
let stopping = false

function stop(code: number) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  if (code) console.error('Workspace server stopped unexpectedly.')
  server.close()
  server.closeAllConnections()
  if (caddy && caddy.exitCode === null && caddy.signalCode === null) {
    const child = caddy
    child.kill('SIGTERM')
    setTimeout(() => child.kill('SIGKILL'), 5000).unref()
  }
}

process.once('SIGTERM', () => stop(0))
process.once('SIGINT', () => stop(0))
server.once('error', () => stop(1))
server.listen(3081, '127.0.0.1', () => {
  if (stopping) return
  caddy = spawn('/usr/bin/caddy', ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], {
    // Caddy gets its listen port and writable directories, not the provider keys.
    env: {
      PORT: process.env.PORT || '8080',
      XDG_CONFIG_HOME: '/home/node/.config',
      XDG_DATA_HOME: '/home/node/.local/share',
    },
    stdio: 'ignore',
  })
  caddy.once('error', () => stop(1))
  caddy.once('exit', () => stop(1))
})
