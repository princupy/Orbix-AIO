let createCanvas;
let loadImage;
try {
  ({ createCanvas, loadImage } = require('@napi-rs/canvas'));
} catch (err) {
  console.warn('[canvas] @napi-rs/canvas failed to load. Ship card will be disabled.', err.message);
}

const WIDTH = 1000;
const HEIGHT = 440;

const PINK = '#FF6B9D';
const PINK_GLOW = 'rgba(255,107,157,';
const PURPLE = '#C77DFF';
const PURPLE_GLOW = 'rgba(199,125,255,';
const RED = '#FF4D6D';
const RED_GLOW = 'rgba(255,77,109,';

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

/** Heart path centered horizontally at cx, spanning topY .. topY + size vertically. */
function heartPath(ctx, cx, topY, size) {
  const w = size;
  const h = size;
  const topCurve = h * 0.3;

  ctx.beginPath();
  ctx.moveTo(cx, topY + topCurve);
  ctx.bezierCurveTo(cx, topY, cx - w / 2, topY, cx - w / 2, topY + topCurve);
  ctx.bezierCurveTo(cx - w / 2, topY + (h + topCurve) / 2, cx, topY + (h + topCurve) * 0.74, cx, topY + h);
  ctx.bezierCurveTo(cx, topY + (h + topCurve) * 0.74, cx + w / 2, topY + (h + topCurve) / 2, cx + w / 2, topY + topCurve);
  ctx.bezierCurveTo(cx + w / 2, topY, cx, topY, cx, topY + topCurve);
  ctx.closePath();
}

function drawFloatingHearts(ctx) {
  const hearts = [
    { a: 0.06, s: 26, x: 120, y: 360 },
    { a: 0.05, s: 18, x: 880, y: 350 },
    { a: 0.05, s: 20, x: 500, y: 330 },
    { a: 0.045, s: 16, x: 300, y: 90 },
    { a: 0.045, s: 22, x: 720, y: 100 },
  ];

  for (const h of hearts) {
    ctx.save();
    ctx.fillStyle = `rgba(255,107,157,${h.a})`;
    heartPath(ctx, h.x, h.y, h.s);
    ctx.fill();
    ctx.restore();
  }
}

async function drawAvatar(ctx, {
  cx, cy, radius, url, ringColor, glow, fallbackText,
}) {
  ctx.save();
  ctx.shadowColor = `${glow}0.85)`;
  ctx.shadowBlur = 30;
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
    drawText(ctx, (fallbackText || '?').charAt(0).toUpperCase(), cx, cy + 2, {
      align: 'center',
      baseline: 'middle',
      color: '#FFFFFF',
      size: 52,
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

function fitFont(ctx, text, maxWidth, startSize, minSize, weight = 800) {
  let size = startSize;
  ctx.font = `${weight} ${size}px Arial`;

  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 2;
    ctx.font = `${weight} ${size}px Arial`;
  }

  return size;
}

async function createShipCard({
  message, percent, shipName, user1, user2,
}) {
  if (!createCanvas) {
    return null;
  }

  const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background.
  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, '#160D14');
  background.addColorStop(0.5, '#1B1020');
  background.addColorStop(1, '#120A12');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawDotGrid(ctx);
  radialGlow(ctx, 500, 150, 620, [[0, `${PINK_GLOW}0.16)`], [1, 'rgba(0,0,0,0)']]);
  radialGlow(ctx, 130, 420, 460, [[0, `${PURPLE_GLOW}0.12)`], [1, 'rgba(0,0,0,0)']]);
  radialGlow(ctx, 880, 60, 440, [[0, `${RED_GLOW}0.12)`], [1, 'rgba(0,0,0,0)']]);
  drawFloatingHearts(ctx);

  // Glass panel border.
  drawPanel(ctx, 28, 28, WIDTH - 56, HEIGHT - 56, 34, 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.09)', 2);

  const accentLine = ctx.createLinearGradient(60, 0, WIDTH - 60, 0);
  accentLine.addColorStop(0, 'rgba(0,0,0,0)');
  accentLine.addColorStop(0.5, `${PINK_GLOW}0.6)`);
  accentLine.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = accentLine;
  ctx.fillRect(70, 30, WIDTH - 140, 2.5);

  // Title: ship name.
  drawSpacedText(ctx, 'LOVE MATCH', WIDTH / 2 - measureSpacedText(ctx, 'LOVE MATCH', 4, { size: 15, weight: 800 }) / 2, 66, 4, {
    color: '#B98BA8',
    size: 15,
    weight: 800,
  });

  const shipLabel = (shipName || 'Ship').slice(0, 22);
  const shipSize = fitFont(ctx, shipLabel, 420, 40, 22);
  ctx.save();
  ctx.shadowColor = `${PINK_GLOW}0.5)`;
  ctx.shadowBlur = 18;
  drawText(ctx, shipLabel, WIDTH / 2, 104, {
    align: 'center',
    baseline: 'middle',
    color: '#FFFFFF',
    size: shipSize,
    weight: 800,
  });
  ctx.restore();

  // Connecting gradient line behind the heart.
  const linkLine = ctx.createLinearGradient(210, 0, 790, 0);
  linkLine.addColorStop(0, `${PINK_GLOW}0.0)`);
  linkLine.addColorStop(0.5, `${RED_GLOW}0.55)`);
  linkLine.addColorStop(1, `${PURPLE_GLOW}0.0)`);
  ctx.fillStyle = linkLine;
  ctx.fillRect(210, 214, 580, 3);

  // Avatars.
  await drawAvatar(ctx, {
    cx: 205,
    cy: 216,
    fallbackText: user1?.name,
    glow: PINK_GLOW,
    radius: 82,
    ringColor: PINK,
    url: user1?.avatarURL,
  });
  await drawAvatar(ctx, {
    cx: 795,
    cy: 216,
    fallbackText: user2?.name,
    glow: PURPLE_GLOW,
    radius: 82,
    ringColor: PURPLE,
    url: user2?.avatarURL,
  });

  // Names under avatars.
  const name1 = (user1?.name || 'User').slice(0, 16);
  const name2 = (user2?.name || 'User').slice(0, 16);
  drawText(ctx, name1, 205, 332, {
    align: 'center', color: '#F2D6E4', size: fitFont(ctx, name1, 260, 24, 15, 700), weight: 700,
  });
  drawText(ctx, name2, 795, 332, {
    align: 'center', color: '#EADAF7', size: fitFont(ctx, name2, 260, 24, 15, 700), weight: 700,
  });

  // Center heart with the percentage inside.
  const heartCx = 500;
  const heartTop = 150;
  const heartSize = 150;
  const heartGrad = ctx.createLinearGradient(heartCx - 75, heartTop, heartCx + 75, heartTop + heartSize);
  heartGrad.addColorStop(0, '#FF7EB3');
  heartGrad.addColorStop(1, '#FF4D6D');

  ctx.save();
  ctx.shadowColor = `${RED_GLOW}0.75)`;
  ctx.shadowBlur = 34;
  heartPath(ctx, heartCx, heartTop, heartSize);
  ctx.fillStyle = heartGrad;
  ctx.fill();
  ctx.restore();

  drawText(ctx, `${pct}%`, heartCx, heartTop + heartSize * 0.5, {
    align: 'center',
    baseline: 'middle',
    color: '#FFFFFF',
    size: pct === 100 ? 44 : 50,
    weight: 800,
  });

  // Love meter (progress bar).
  const barX = 150;
  const barY = 356;
  const barW = WIDTH - barX * 2;
  const barH = 24;
  drawPanel(ctx, barX, barY, barW, barH, barH / 2, 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.12)', 1.5);

  const fillW = Math.max(pct > 0 ? barH : 0, (barW * pct) / 100);

  if (fillW > 0) {
    ctx.save();
    roundRect(ctx, barX, barY, fillW, barH, barH / 2);
    ctx.clip();
    const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    barGrad.addColorStop(0, PURPLE);
    barGrad.addColorStop(0.5, PINK);
    barGrad.addColorStop(1, RED);
    ctx.shadowColor = `${PINK_GLOW}0.7)`;
    ctx.shadowBlur = 14;
    ctx.fillStyle = barGrad;
    ctx.fillRect(barX, barY, fillW, barH);
    ctx.restore();
  }

  // Message.
  const msg = (message || '').slice(0, 60);
  drawText(ctx, msg, WIDTH / 2, 404, {
    align: 'center',
    baseline: 'middle',
    color: '#E7C9D8',
    size: fitFont(ctx, msg, WIDTH - 140, 24, 15, 700),
    weight: 700,
  });

  return canvas.toBuffer('image/png');
}

module.exports = {
  createShipCard,
};
