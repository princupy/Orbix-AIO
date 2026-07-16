let createCanvas;
let loadImage;
try {
  ({ createCanvas, loadImage } = require('@napi-rs/canvas'));
} catch (err) {
  console.warn('[canvas] @napi-rs/canvas failed to load. Uptime card will be disabled.', err.message);
}

const WIDTH = 1000;
const HEIGHT = 440;

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

function formatCount(value) {
  const num = Number(value) || 0;

  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }

  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }

  return String(num);
}

function radialGlow(ctx, cx, cy, radius, colorStops) {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  colorStops.forEach(([stop, color]) => gradient.addColorStop(stop, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
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

function drawPill(ctx, {
  x, y, text, color, glow, height = 32,
}) {
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

function drawTimeTile(ctx, {
  x, y, width, height, value, label, color, glow,
}) {
  drawPanel(ctx, x, y, width, height, 22, 'rgba(255,255,255,0.045)', 'rgba(255,255,255,0.09)', 1.5);

  const cx = x + width / 2;

  // Top accent bar.
  ctx.save();
  ctx.shadowColor = `${glow}0.9)`;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  roundRect(ctx, cx - 18, y + 16, 36, 4, 2);
  ctx.fill();
  ctx.restore();

  // Big number.
  ctx.save();
  ctx.shadowColor = `${glow}0.5)`;
  ctx.shadowBlur = 18;
  drawText(ctx, value, cx, y + 56, {
    align: 'center',
    baseline: 'middle',
    color,
    size: 46,
    weight: 800,
  });
  ctx.restore();

  // Label.
  const labelWidth = measureSpacedText(ctx, label, 2.5, { size: 13, weight: 800 });
  drawSpacedText(ctx, label, cx - labelWidth / 2, y + height - 18, 2.5, {
    color: '#8A93A3',
    size: 13,
    weight: 800,
  });
}

function drawStatChip(ctx, {
  x, y, width, height, label, value, color, glow,
}) {
  drawPanel(ctx, x, y, width, height, 16, 'rgba(255,255,255,0.045)', 'rgba(255,255,255,0.09)', 1.5);

  ctx.save();
  ctx.shadowColor = `${glow}0.9)`;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 24, y + height / 2, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawText(ctx, label.toUpperCase(), x + 40, y + height / 2 + 1, {
    baseline: 'middle',
    color: '#9AA3B2',
    size: 15,
    weight: 700,
  });
  drawText(ctx, String(value), x + width - 22, y + height / 2 + 1, {
    align: 'right',
    baseline: 'middle',
    color: '#FFFFFF',
    size: 22,
    weight: 800,
  });
}

async function createUptimeCard({
  avatarURL, botName, memoryMB, serverCount, sinceLabel, uptimeMs, userCount, websocketMs,
}) {
  if (!createCanvas) {
    return null;
  }

  const primary = '#34E1A1';
  const primaryGlow = 'rgba(52,225,161,';
  const totalSeconds = Math.max(0, Math.floor((uptimeMs || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (num) => String(num).padStart(2, '0');
  const websocket = Number.isFinite(websocketMs) ? Math.max(0, websocketMs) : 0;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, '#0E1016');
  background.addColorStop(0.5, '#161922');
  background.addColorStop(1, '#0C0E13');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawDotGrid(ctx);

  radialGlow(ctx, 812, 70, 560, [[0, `${primaryGlow}0.15)`], [1, 'rgba(0,0,0,0)']]);
  radialGlow(ctx, 120, 430, 460, [[0, 'rgba(92,200,255,0.10)'], [1, 'rgba(0,0,0,0)']]);

  drawPanel(ctx, 28, 28, WIDTH - 56, HEIGHT - 56, 34, 'rgba(255,255,255,0.045)', 'rgba(255,255,255,0.09)', 2);

  const accentLine = ctx.createLinearGradient(60, 0, WIDTH - 60, 0);
  accentLine.addColorStop(0, 'rgba(0,0,0,0)');
  accentLine.addColorStop(0.5, `${primaryGlow}0.55)`);
  accentLine.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = accentLine;
  ctx.fillRect(70, 30, WIDTH - 140, 2.5);

  await drawAvatar(ctx, {
    cx: 100,
    cy: 102,
    fallbackText: botName,
    glow: primaryGlow,
    radius: 50,
    ringColor: primary,
    url: avatarURL,
  });

  drawSpacedText(ctx, 'SYSTEM STATUS', 176, 78, 3.5, {
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
    color: primary,
    glow: primaryGlow,
    text: 'Online',
    x: 176,
    y: 136,
  });

  // WebSocket ping pill (top-right).
  const wsText = `${websocket} ms`;
  ctx.font = '800 16px Arial';
  const wsPillWidth = 16 * 2 + 5 * 2 + 10 + ctx.measureText(wsText).width;
  drawPill(ctx, {
    color: '#5CC8FF',
    glow: 'rgba(92,200,255,',
    text: wsText,
    x: WIDTH - 44 - wsPillWidth,
    y: 60,
  });

  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(52, 192);
  ctx.lineTo(WIDTH - 52, 192);
  ctx.stroke();

  // Uptime tiles.
  const tiles = [
    { color: '#34E1A1', glow: 'rgba(52,225,161,', label: 'DAYS', value: pad(days) },
    { color: '#5CC8FF', glow: 'rgba(92,200,255,', label: 'HOURS', value: pad(hours) },
    { color: '#A78BFA', glow: 'rgba(167,139,250,', label: 'MINUTES', value: pad(minutes) },
    { color: '#F5C451', glow: 'rgba(245,196,81,', label: 'SECONDS', value: pad(seconds) },
  ];
  const tileWidth = 212;
  const tileGap = 16;
  const tileY = 208;
  const tileHeight = 112;

  tiles.forEach((tile, index) => {
    drawTimeTile(ctx, {
      color: tile.color,
      glow: tile.glow,
      height: tileHeight,
      label: tile.label,
      value: tile.value,
      width: tileWidth,
      x: 52 + index * (tileWidth + tileGap),
      y: tileY,
    });
  });

  // Stat chips.
  const chips = [
    { color: '#34E1A1', glow: 'rgba(52,225,161,', label: 'Servers', value: formatCount(serverCount) },
    { color: '#5CC8FF', glow: 'rgba(92,200,255,', label: 'Users', value: formatCount(userCount) },
    { color: '#A78BFA', glow: 'rgba(167,139,250,', label: 'Memory', value: `${Math.round(memoryMB || 0)} MB` },
  ];
  const chipWidth = 288;
  const chipGap = 16;
  const chipY = 336;
  const chipHeight = 60;

  chips.forEach((chip, index) => {
    drawStatChip(ctx, {
      color: chip.color,
      glow: chip.glow,
      height: chipHeight,
      label: chip.label,
      value: chip.value,
      width: chipWidth,
      x: 52 + index * (chipWidth + chipGap),
      y: chipY,
    });
  });

  // "Online since" caption on the top-right, under the WS pill.
  if (sinceLabel) {
    drawText(ctx, `Online since ${sinceLabel}`, WIDTH - 44, 116, {
      align: 'right',
      color: '#7C8698',
      size: 16,
      weight: 600,
    });
  }

  return canvas.toBuffer('image/png');
}

module.exports = {
  createUptimeCard,
};
