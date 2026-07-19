let createCanvas;
let loadImage;
try {
  ({ createCanvas, loadImage } = require('@napi-rs/canvas'));
} catch (err) {
  console.warn('[canvas] @napi-rs/canvas failed to load. Gay card will be disabled.', err.message);
}

const WIDTH = 1000;
const HEIGHT = 440;

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

function rainbowGradient(ctx, x0, x1) {
  const gradient = ctx.createLinearGradient(x0, 0, x1, 0);
  gradient.addColorStop(0.0, '#FF3B3B');
  gradient.addColorStop(0.17, '#FF9F1C');
  gradient.addColorStop(0.34, '#FFDD00');
  gradient.addColorStop(0.5, '#2ECC71');
  gradient.addColorStop(0.67, '#3B82F6');
  gradient.addColorStop(0.84, '#8B5CF6');
  gradient.addColorStop(1.0, '#EC4899');
  return gradient;
}

async function drawRainbowAvatar(ctx, {
  cx, cy, radius, url, fallbackText,
}) {
  ctx.save();
  ctx.shadowColor = 'rgba(236,72,153,0.7)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#EC4899';
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 7, 0, Math.PI * 2);
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
    drawText(ctx, (fallbackText || '?').charAt(0).toUpperCase(), cx, cy + 2, {
      align: 'center',
      baseline: 'middle',
      color: '#FFFFFF',
      size: 52,
      weight: 800,
    });
  }

  ctx.restore();

  // Rainbow ring.
  ctx.strokeStyle = rainbowGradient(ctx, cx - radius, cx + radius);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
  ctx.stroke();
}

function fitFont(ctx, text, maxWidth, startSize, minSize, weight = 800) {
  let size = startSize;
  ctx.font = `${weight} ${size}px Arial`;

  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 2;
    ctx.font = `${weight} ${size}px Arial`;
  }

  return size;
}

async function createGayCard({ message, percent, user }) {
  if (!createCanvas) {
    return null;
  }

  const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background.
  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, '#0F0D16');
  background.addColorStop(0.5, '#151320');
  background.addColorStop(1, '#0D0B12');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawDotGrid(ctx);
  radialGlow(ctx, 160, 90, 460, [[0, 'rgba(255,59,59,0.10)'], [1, 'rgba(0,0,0,0)']]);
  radialGlow(ctx, 500, 240, 520, [[0, 'rgba(255,221,0,0.07)'], [1, 'rgba(0,0,0,0)']]);
  radialGlow(ctx, 860, 400, 480, [[0, 'rgba(139,92,246,0.12)'], [1, 'rgba(0,0,0,0)']]);

  // Glass panel.
  drawPanel(ctx, 28, 28, WIDTH - 56, HEIGHT - 56, 34, 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.09)', 2);

  // Rainbow accent line.
  ctx.save();
  roundRect(ctx, 70, 30, WIDTH - 140, 3, 1.5);
  ctx.clip();
  ctx.fillStyle = rainbowGradient(ctx, 70, WIDTH - 70);
  ctx.globalAlpha = 0.65;
  ctx.fillRect(70, 30, WIDTH - 140, 3);
  ctx.restore();

  // Title.
  const label = 'PRIDE METER';
  drawSpacedText(ctx, label, WIDTH / 2 - measureSpacedText(ctx, label, 4, { size: 15, weight: 800 }) / 2, 66, 4, {
    color: '#A79AB2',
    size: 15,
    weight: 800,
  });

  // Avatar (left) with rainbow ring.
  await drawRainbowAvatar(ctx, {
    cx: 235,
    cy: 232,
    fallbackText: user?.name,
    radius: 92,
    url: user?.avatarURL,
  });

  // Username under avatar.
  const name = (user?.name || 'User').slice(0, 18);
  drawText(ctx, name, 235, 360, {
    align: 'center',
    color: '#E9E2F2',
    size: fitFont(ctx, name, 280, 26, 15, 700),
    weight: 700,
  });

  // Right column: label, big % (rainbow), meter.
  const colCx = 655;

  drawSpacedText(ctx, 'GAY RATE', colCx - measureSpacedText(ctx, 'GAY RATE', 5, { size: 20, weight: 800 }) / 2, 132, 5, {
    color: '#8A93A3',
    size: 20,
    weight: 800,
  });

  const pctText = `${pct}%`;
  const pctSize = fitFont(ctx, pctText, 440, 118, 60);
  ctx.font = `800 ${pctSize}px Arial`;
  const pctWidth = ctx.measureText(pctText).width;
  ctx.save();
  ctx.shadowColor = 'rgba(236,72,153,0.35)';
  ctx.shadowBlur = 24;
  drawText(ctx, pctText, colCx, 226, {
    align: 'center',
    baseline: 'middle',
    color: rainbowGradient(ctx, colCx - pctWidth / 2, colCx + pctWidth / 2),
    size: pctSize,
    weight: 800,
  });
  ctx.restore();

  // Rainbow meter.
  const barX = 430;
  const barY = 300;
  const barW = 450;
  const barH = 24;
  drawPanel(ctx, barX, barY, barW, barH, barH / 2, 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.12)', 1.5);

  const fillW = Math.max(pct > 0 ? barH : 0, (barW * pct) / 100);

  if (fillW > 0) {
    ctx.save();
    roundRect(ctx, barX, barY, fillW, barH, barH / 2);
    ctx.clip();
    ctx.shadowColor = 'rgba(236,72,153,0.6)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = rainbowGradient(ctx, barX, barX + barW);
    ctx.fillRect(barX, barY, fillW, barH);
    ctx.restore();
  }

  // Message.
  const msg = (message || '').slice(0, 60);
  drawText(ctx, msg, WIDTH / 2, 402, {
    align: 'center',
    baseline: 'middle',
    color: '#D9CFE6',
    size: fitFont(ctx, msg, WIDTH - 140, 24, 15, 700),
    weight: 700,
  });

  return canvas.toBuffer('image/png');
}

module.exports = {
  createGayCard,
};
