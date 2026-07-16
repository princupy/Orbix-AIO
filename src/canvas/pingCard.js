let createCanvas;
let loadImage;
try {
  ({ createCanvas, loadImage } = require('@napi-rs/canvas'));
} catch (err) {
  console.warn('[canvas] @napi-rs/canvas failed to load. Ping card will be disabled.', err.message);
}

const WIDTH = 1000;
const HEIGHT = 440;
const GAUGE_MAX = 500;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawPanel(ctx, x, y, width, height, radius, fill, stroke, lineWidth = 1.5) {
  roundRect(ctx, x, y, width, height, radius);

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawText(ctx, text, x, y, options = {}) {
  ctx.font = `${options.weight || 600} ${options.size || 24}px ${options.family || 'Arial'}`;
  ctx.fillStyle = options.color || '#FFFFFF';
  ctx.textAlign = options.align || 'left';
  ctx.textBaseline = options.baseline || 'alphabetic';
  ctx.fillText(text, x, y);
}

function drawSpacedText(ctx, text, x, y, spacing, options = {}) {
  ctx.font = `${options.weight || 700} ${options.size || 16}px ${options.family || 'Arial'}`;
  ctx.fillStyle = options.color || '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = options.baseline || 'alphabetic';

  let cursor = x;

  for (const char of text) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + spacing;
  }

  return cursor - spacing - x;
}

function measureSpacedText(ctx, text, spacing, options = {}) {
  ctx.font = `${options.weight || 700} ${options.size || 16}px ${options.family || 'Arial'}`;
  let total = 0;

  for (const char of text) {
    total += ctx.measureText(char).width + spacing;
  }

  return total - spacing;
}

function radialGlow(ctx, cx, cy, radius, colorStops) {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  colorStops.forEach(([stop, color]) => gradient.addColorStop(stop, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function getStatus(latencyMs) {
  if (latencyMs === null || latencyMs === undefined || !Number.isFinite(latencyMs)) {
    return { color: '#7AA2FF', glow: 'rgba(122,162,255,', label: 'Checking' };
  }

  if (latencyMs <= 120) {
    return { color: '#34E1A1', glow: 'rgba(52,225,161,', label: 'Fast' };
  }

  if (latencyMs <= 260) {
    return { color: '#F5C451', glow: 'rgba(245,196,81,', label: 'Stable' };
  }

  return { color: '#FF6B6B', glow: 'rgba(255,107,107,', label: 'Slow' };
}

function drawDotGrid(ctx) {
  ctx.fillStyle = 'rgba(255,255,255,0.022)';

  for (let gx = 44; gx < WIDTH; gx += 27) {
    for (let gy = 44; gy < HEIGHT; gy += 27) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPill(ctx, { x, y, text, color, glow, height = 32 }) {
  ctx.font = '800 16px Arial';
  const textWidth = ctx.measureText(text).width;
  const padX = 16;
  const dotR = 5;
  const dotGap = 10;
  const width = padX * 2 + dotR * 2 + dotGap + textWidth;

  drawPanel(ctx, x, y, width, height, height / 2, `${glow}0.14)`, `${glow}0.45)`, 1.5);

  ctx.save();
  ctx.shadowColor = `${glow}0.9)`;
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + padX + dotR, y + height / 2, dotR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawText(ctx, text, x + padX + dotR * 2 + dotGap, y + height / 2 + 1, {
    baseline: 'middle',
    color,
    size: 16,
    weight: 800,
  });

  return width;
}

async function drawAvatar(ctx, {
  cx, cy, radius, url, ringColor, glow, fallbackText,
}) {
  // Soft glowing halo behind the avatar.
  ctx.save();
  ctx.shadowColor = `${glow}0.85)`;
  ctx.shadowBlur = 28;
  ctx.fillStyle = ringColor;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  let image = null;

  if (url && loadImage) {
    image = await loadImage(url).catch(() => null);
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (image) {
    ctx.drawImage(image, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = '#2A2F3A';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    drawText(ctx, (fallbackText || 'B').charAt(0).toUpperCase(), cx, cy + 2, {
      align: 'center',
      baseline: 'middle',
      color: '#FFFFFF',
      size: 46,
      weight: 800,
    });
  }

  ctx.restore();

  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawMetricCard(ctx, {
  x, y, width, height, label, value, unit, accent, glow, ratio,
}) {
  drawPanel(ctx, x, y, width, height, 20, 'rgba(255,255,255,0.045)', 'rgba(255,255,255,0.09)', 1.5);

  ctx.save();
  ctx.shadowColor = `${glow}0.9)`;
  ctx.shadowBlur = 10;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(x + 28, y + 29, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawText(ctx, label.toUpperCase(), x + 44, y + 35, {
    color: '#9AA3B2',
    size: 16,
    weight: 700,
  });

  const valueStr = String(value);
  ctx.font = '800 35px Arial';
  const valueWidth = ctx.measureText(valueStr).width;

  drawText(ctx, valueStr, x + 28, y + 74, {
    color: '#FFFFFF',
    size: 35,
    weight: 800,
  });
  drawText(ctx, unit, x + 28 + valueWidth + 7, y + 74, {
    color: '#8A93A3',
    size: 18,
    weight: 700,
  });

  const barX = x + 28;
  const barY = y + height - 14;
  const barWidth = width - 56;
  const barHeight = 7;

  drawPanel(ctx, barX, barY, barWidth, barHeight, 4, 'rgba(255,255,255,0.10)');

  ctx.save();
  ctx.shadowColor = `${glow}0.8)`;
  ctx.shadowBlur = 12;
  drawPanel(ctx, barX, barY, Math.max(barHeight, clamp(ratio, 0.03, 1) * barWidth), barHeight, 4, accent);
  ctx.restore();
}

function drawGauge(ctx, {
  cx, cy, radius, value, color, glow, isChecking,
}) {
  const start = Math.PI * 0.75;
  const end = Math.PI * 2.25;
  const progress = isChecking ? 0 : clamp(value / GAUGE_MAX, 0, 1);
  const current = start + (end - start) * progress;

  ctx.lineCap = 'round';

  // Track.
  ctx.lineWidth = 20;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end);
  ctx.stroke();

  if (!isChecking) {
    // Glowing progress arc.
    ctx.save();
    ctx.shadowColor = `${glow}0.95)`;
    ctx.shadowBlur = 24;
    ctx.strokeStyle = color;
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, current);
    ctx.stroke();
    ctx.restore();

    // End cap dot.
    const dotX = cx + Math.cos(current) * radius;
    const dotY = cy + Math.sin(current) * radius;

    ctx.save();
    ctx.shadowColor = `${glow}0.95)`;
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(dotX, dotY, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

async function createPingCard({
  avatarURL, botName, latencyMs, websocketMs,
}) {
  if (!createCanvas) {
    return null;
  }

  const isChecking = latencyMs === null || latencyMs === undefined || !Number.isFinite(latencyMs);
  const latency = isChecking ? 0 : latencyMs;
  const websocket = Number.isFinite(websocketMs) ? websocketMs : 0;
  const status = getStatus(isChecking ? null : latency);
  const wsGlow = 'rgba(92,200,255,';
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Base background gradient.
  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, '#0E1016');
  background.addColorStop(0.5, '#161922');
  background.addColorStop(1, '#0C0E13');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawDotGrid(ctx);

  // Ambient status glow + secondary cool glow.
  radialGlow(ctx, 812, 70, 560, [[0, `${status.glow}0.16)`], [1, 'rgba(0,0,0,0)']]);
  radialGlow(ctx, 120, 430, 460, [[0, 'rgba(92,200,255,0.10)'], [1, 'rgba(0,0,0,0)']]);

  // Outer glass panel.
  drawPanel(ctx, 28, 28, WIDTH - 56, HEIGHT - 56, 34, 'rgba(255,255,255,0.045)', 'rgba(255,255,255,0.09)', 2);

  // Top accent line.
  const accentLine = ctx.createLinearGradient(60, 0, WIDTH - 60, 0);
  accentLine.addColorStop(0, 'rgba(0,0,0,0)');
  accentLine.addColorStop(0.5, `${status.glow}0.55)`);
  accentLine.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = accentLine;
  ctx.fillRect(70, 30, WIDTH - 140, 2.5);

  // Avatar with glowing status ring.
  await drawAvatar(ctx, {
    cx: 100,
    cy: 102,
    fallbackText: botName,
    glow: status.glow,
    radius: 50,
    ringColor: status.color,
    url: avatarURL,
  });

  // Header text.
  drawSpacedText(ctx, 'LATENCY MONITOR', 176, 78, 3.5, {
    color: '#7C8698',
    size: 15,
    weight: 800,
  });
  drawText(ctx, (botName || 'Discord Bot').slice(0, 22), 176, 120, {
    color: '#FFFFFF',
    size: 38,
    weight: 800,
  });
  drawPill(ctx, {
    color: status.color,
    glow: status.glow,
    text: isChecking ? 'Checking' : status.label,
    x: 176,
    y: 136,
  });

  // "LIVE" pill (top-right).
  const liveText = 'LIVE';
  ctx.font = '800 16px Arial';
  const livePillWidth = 16 * 2 + 5 * 2 + 10 + ctx.measureText(liveText).width;
  drawPill(ctx, {
    color: '#FF6B6B',
    glow: 'rgba(255,107,107,',
    text: liveText,
    x: WIDTH - 44 - livePillWidth,
    y: 60,
  });

  // Divider.
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(52, 192);
  ctx.lineTo(WIDTH - 52, 192);
  ctx.stroke();

  // Left metric cards.
  drawMetricCard(ctx, {
    accent: status.color,
    glow: status.glow,
    height: 94,
    label: 'Bot Latency',
    ratio: isChecking ? 0 : latency / GAUGE_MAX,
    unit: 'ms',
    value: isChecking ? '—' : latency,
    width: 452,
    x: 52,
    y: 210,
  });
  drawMetricCard(ctx, {
    accent: '#5CC8FF',
    glow: wsGlow,
    height: 94,
    label: 'WebSocket',
    ratio: websocket / GAUGE_MAX,
    unit: 'ms',
    value: websocket,
    width: 452,
    x: 52,
    y: 314,
  });

  // Vertical divider between metrics and gauge.
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(548, 214);
  ctx.lineTo(548, 402);
  ctx.stroke();

  // Gauge (right side, hero element).
  const gaugeX = 764;
  const gaugeY = 308;
  const gaugeRadius = 96;

  drawGauge(ctx, {
    color: status.color,
    cx: gaugeX,
    cy: gaugeY,
    glow: status.glow,
    isChecking,
    radius: gaugeRadius,
    value: latency,
  });

  drawSpacedText(
    ctx,
    'BOT PING',
    gaugeX - measureSpacedText(ctx, 'BOT PING', 2.5, { size: 14, weight: 800 }) / 2,
    gaugeY - 40,
    2.5,
    {
      color: '#7C8698',
      size: 14,
      weight: 800,
    },
  );
  drawText(ctx, isChecking ? '···' : String(latency), gaugeX, gaugeY + 8, {
    align: 'center',
    baseline: 'middle',
    color: '#FFFFFF',
    size: 58,
    weight: 800,
  });
  drawText(ctx, isChecking ? 'CHECKING' : 'MS', gaugeX, gaugeY + 44, {
    align: 'center',
    baseline: 'middle',
    color: status.color,
    size: 17,
    weight: 800,
  });

  return canvas.toBuffer('image/png');
}

module.exports = {
  createPingCard,
};
