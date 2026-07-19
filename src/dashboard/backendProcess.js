// Optionally launch the dashboard backend alongside the bot as a child process,
// so a single `npm start` runs both on the same host. Enabled only when
// START_DASHBOARD_BACKEND is truthy. The backend runs isolated (its own deps,
// cwd and .env), so if it crashes it never takes the bot down.

const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');

let child = null;
let restarts = 0;
const MAX_RESTARTS = 3;
const RESTART_DELAY_MS = 3000;

function isEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.START_DASHBOARD_BACKEND || '').trim());
}

function pipePrefixed(stream, target, prefix) {
  if (!stream) {
    return;
  }

  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      target.write(`${prefix}${line}\n`);
    }
  });
}

function startDashboardBackend() {
  if (!isEnabled()) {
    return null;
  }

  const backendDir = path.join(__dirname, '..', '..', 'dashboard', 'backend');
  const entry = path.join(backendDir, 'src', 'index.js');

  if (!fs.existsSync(entry)) {
    console.warn(`[dashboard-backend] autostart skipped — entry not found at ${entry}`);
    return null;
  }

  const spawnChild = () => {
    child = fork(entry, [], {
      cwd: backendDir,
      env: process.env,
      silent: true,
    });

    pipePrefixed(child.stdout, process.stdout, '[backend] ');
    pipePrefixed(child.stderr, process.stderr, '[backend] ');

    child.on('error', (error) => {
      console.warn('[dashboard-backend] failed to start:', error.message);
    });

    child.on('exit', (code, signal) => {
      const wasClean = code === 0 || signal === 'SIGTERM' || signal === 'SIGINT';
      child = null;

      if (wasClean) {
        return;
      }

      console.warn(`[dashboard-backend] exited unexpectedly (code=${code}, signal=${signal}).`);

      if (restarts < MAX_RESTARTS) {
        restarts += 1;
        console.log(`[dashboard-backend] restarting in ${RESTART_DELAY_MS}ms (attempt ${restarts}/${MAX_RESTARTS})...`);
        const timer = setTimeout(spawnChild, RESTART_DELAY_MS);
        timer.unref?.();
      } else {
        console.warn('[dashboard-backend] giving up after repeated failures — run it manually to debug.');
      }
    });
  };

  spawnChild();
  console.log('[dashboard-backend] autostart enabled — launching backend alongside the bot.');

  // Ensure the child is stopped when the bot process exits.
  process.once('exit', () => {
    if (child) {
      child.kill();
      child = null;
    }
  });

  return child;
}

module.exports = { startDashboardBackend };
