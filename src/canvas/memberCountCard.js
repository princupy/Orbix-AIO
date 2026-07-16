let createCanvas;
let loadImage;
try {
  ({ createCanvas, loadImage } = require('@napi-rs/canvas'));
} catch (err) {
  console.warn('[canvas] @napi-rs/canvas failed to load. Member count card will be disabled.', err.message);
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
  cx, cy, radius, url, ringColor, glow, fallbackText, rounded = false,
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

  if (rounded) {
    roundRect(ctx, cx - radius, cy - radius, radius * 2, radius * 2, radius * 0.42);
  } else {
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  }

  ctx.closePath();
  ctx.clip();

  if (image) {
    ctx.drawImage(image, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = '#2A2F3A';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    drawText(ctx, (fallbackText || 'S').charAt(0).toUpperCase(), cx, cy + 2, {
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

  if (rounded) {
    roundRect(ctx, cx - radius - 2, cy - radius - 2, (radius + 2) * 2, (radius + 2) * 2, (radius + 2) * 0.42);
  } else {
    ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
  }

  ctx.stroke();
}

function drawHeroMembers(ctx, {
  x, y, width, height, value, label, color, glow,
}) {
  drawPanel(ctx, x, y, width, height, 24, 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.10)', 1.5);

  const cx = x + width / 2;

  ctx.save();
  ctx.shadowColor = `${glow}0.9)`;
  ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  roundRect(ctx, cx - 24, y + 24, 48, 4, 2);
  ctx.fill();
  ctx.restore();

  // Auto-fit the big number to the panel width.
  let fontSize = 78;
  ctx.font = `800 ${fontSize}px Arial`;
  while (ctx.measureText(value).width > width - 64 && fontSize > 34) {
    fontSize -= 4;
    ctx.font = `800 ${fontSize}px Arial`;
  }

  ctx.save();
  ctx.shadowColor = `${glow}0.45)`;
  ctx.shadowBlur = 22;
  drawText(ctx, value, cx, y + height / 2 + 12, {
    align: 'center',
    baseline: 'middle',
    color,
    size: fontSize,
    weight: 800,
  });
  ctx.restore();

  const labelWidth = measureSpacedText(ctx, label, 3, { size: 15, weight: 800 });
  drawSpacedText(ctx, label, cx - labelWidth / 2, y + height - 28, 3, {
    color: '#8A93A3',
    size: 15,
    weight: 800,
  });
}

function drawInfoCard(ctx, {
  x, y, width, height, label, value, color, glow,
}) {
  drawPanel(ctx, x, y, width, height, 18, 'rgba(255,255,255,0.045)', 'rgba(255,255,255,0.09)', 1.5);

  ctx.save();
  ctx.shadowColor = `${glow}0.9)`;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 26, y + 30, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawText(ctx, label.toUpperCase(), x + 42, y + 35, {
    color: '#9AA3B2',
    size: 15,
    weight: 700,
  });
  drawText(ctx, String(value), x + 26, y + 72, {
    color: '#FFFFFF',
    size: 32,
    weight: 800,
  });
}

async function createMemberCountCard({
  boostCount, boostTier, channelCount, createdLabel, emojiCount, iconURL, memberCount, roleCount, serverName,
}) {
  if (!createCanvas) {
    return null;
  }

  const primary = '#A78BFA';
  const primaryGlow = 'rgba(167,139,250,';
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, '#0E1016');
  background.addColorStop(0.5, '#171622');
  background.addColorStop(1, '#0C0E13');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawDotGrid(ctx);

  radialGlow(ctx, 812, 70, 560, [[0, `${primaryGlow}0.16)`], [1, 'rgba(0,0,0,0)']]);
  radialGlow(ctx, 120, 430, 460, [[0, 'rgba(92,200,255,0.10)'], [1, 'rgba(0,0,0,0)']]);

  drawPanel(ctx, 28, 28, WIDTH - 56, HEIGHT - 56, 34, 'rgba(255,255,255,0.045)', 'rgba(255,255,255,0.09)', 2);

  const accentLine = ctx.createLinearGradient(60, 0, WIDTH - 60, 0);
  accentLine.addColorStop(0, 'rgba(0,0,0,0)');
  accentLine.addColorStop(0.5, `${primaryGlow}0.55)`);
  accentLine.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = accentLine;
  ctx.fillRect(70, 30, WIDTH - 140, 2.5);

  // Server icon (rounded square).
  await drawAvatar(ctx, {
    cx: 100,
    cy: 102,
    fallbackText: serverName,
    glow: primaryGlow,
    radius: 50,
    ringColor: primary,
    rounded: true,
    url: iconURL,
  });

  drawSpacedText(ctx, 'SERVER MEMBERS', 176, 78, 3.5, {
    color: '#7C8698',
    size: 15,
    weight: 800,
  });
  drawText(ctx, (serverName || 'Server').slice(0, 24), 176, 120, {
    color: '#FFFFFF',
    size: 36,
    weight: 800,
  });
  drawPill(ctx, {
    color: primary,
    glow: primaryGlow,
    text: boostTier > 0 ? `Boost Level ${boostTier}` : 'Community',
    x: 176,
    y: 136,
  });

  // "Established" pill (top-right).
  if (createdLabel) {
    const estText = `Est. ${createdLabel}`;
    ctx.font = '800 16px Arial';
    const estWidth = 16 * 2 + 5 * 2 + 10 + ctx.measureText(estText).width;
    drawPill(ctx, {
      color: '#F5C451',
      glow: 'rgba(245,196,81,',
      text: estText,
      x: WIDTH - 44 - estWidth,
      y: 60,
    });
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(52, 192);
  ctx.lineTo(WIDTH - 52, 192);
  ctx.stroke();

  // Hero: total members.
  drawHeroMembers(ctx, {
    color: primary,
    glow: primaryGlow,
    height: 188,
    label: 'TOTAL MEMBERS',
    value: (Number(memberCount) || 0).toLocaleString('en-US'),
    width: 432,
    x: 52,
    y: 208,
  });

  // 2x2 stat grid.
  const cards = [
    { color: '#A78BFA', glow: 'rgba(167,139,250,', label: 'Roles', value: formatCount(roleCount) },
    { color: '#5CC8FF', glow: 'rgba(92,200,255,', label: 'Channels', value: formatCount(channelCount) },
    { color: '#FF73FA', glow: 'rgba(255,115,250,', label: 'Boosts', value: formatCount(boostCount) },
    { color: '#F5C451', glow: 'rgba(245,196,81,', label: 'Emojis', value: formatCount(emojiCount) },
  ];
  const cardWidth = 216;
  const cardHeight = 86;
  const gap = 16;
  const gridX = 500;
  const gridY = 208;

  cards.forEach((card, index) => {
    drawInfoCard(ctx, {
      color: card.color,
      glow: card.glow,
      height: cardHeight,
      label: card.label,
      value: card.value,
      width: cardWidth,
      x: gridX + (index % 2) * (cardWidth + gap),
      y: gridY + Math.floor(index / 2) * (cardHeight + gap),
    });
  });

  return canvas.toBuffer('image/png');
}

module.exports = {
  createMemberCountCard,
};
