// All-in-one startup script
// Runs: API (3001) + AI Proxy (3002) + Gateway (8080) serving static files & reverse proxy
// Container Apps では外部公開ポートは 1 つ (gateway:8080) に統一し他は内部アクセスのみ。

require('dotenv').config();
const { spawn } = require('child_process');

const processes = [];

function spawnProc(name, cmd, args, env = {}) {
  const child = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  child.on('exit', code => {
    console.log(`[${name}] exited with code ${code}`);
    // If one critical service exits, initiate shutdown.
    shutdown();
  });
  processes.push(child);
}

function shutdown() {
  console.log('⏬ Shutting down all child processes...');
  processes.forEach(p => {
    if (!p.killed) {
      p.kill('SIGTERM');
    }
  });
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Ports (can be overridden by Docker/Kubernetes ENV)
process.env.PORT = process.env.PORT || '3001';            // API
process.env.PROXY_PORT = process.env.PROXY_PORT || '3002';// AI Proxy
const GATEWAY_PORT = process.env.STATIC_PORT || '8080';   // Gateway (static + reverse proxy)

// Start services (proxy は廃止)
spawnProc('api', 'node', ['cosmos-api-server.js']);
spawnProc('gateway', 'node', ['gateway.js'], { GATEWAY_PORT });

console.log(`🚀 Services starting: gateway=${GATEWAY_PORT}, api=${process.env.PORT} (AIはFunction直叩き)`);
