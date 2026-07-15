let createCanvas;
try {
  ({ createCanvas } = require('@napi-rs/canvas'));
} catch (err) {
  console.warn('[canvas] @napi-rs/canvas failed to load. Permission card will be disabled.', err.message);
}

const WIDTH = 900;
const HEIGHT = 300;

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

function drawPanel(ctx, x, y, width, height, radius, fill, stroke) {
  roundRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
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

function drawBadge(ctx, text, x, y, width) {
  drawPanel(ctx, x, y, width, 48, 15, 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.16)');
  drawText(ctx, text, x + width / 2, y + 31, {
    align: 'center',
    color: '#FFFFFF',
    size: 21,
    weight: 800,
  });
}

async function createMissingPermissionCard() {
  if (!createCanvas) return null;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, '#171A20');
  background.addColorStop(0.55, '#252A33');
  background.addColorStop(1, '#111318');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = 'rgba(237,66,69,0.13)';
  ctx.beginPath();
  ctx.arc(792, 74, 220, 0, Math.PI * 2);
  ctx.fill();

  drawPanel(ctx, 34, 30, WIDTH - 68, HEIGHT - 60, 28, 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.13)');
  drawPanel(ctx, 58, 55, WIDTH - 116, HEIGHT - 110, 26, 'rgba(0,0,0,0.18)', 'rgba(255,255,255,0.08)');

  drawText(ctx, 'ACCESS REQUIRED', 90, 102, {
    color: '#AEB6C2',
    size: 21,
    weight: 800,
  });
  drawText(ctx, 'Permission Required', 90, 148, {
    color: '#FFFFFF',
    size: 40,
    weight: 800,
  });
  drawText(ctx, 'This command requires one of these server permissions.', 90, 187, {
    color: '#C8D0DA',
    size: 22,
    weight: 600,
  });

  drawBadge(ctx, 'Manage Server', 90, 211, 216);
  drawText(ctx, 'or', 330, 242, {
    color: '#AEB6C2',
    size: 22,
    weight: 700,
  });
  drawBadge(ctx, 'Administrator', 380, 211, 224);

  drawPanel(ctx, 682, 89, 132, 132, 32, 'rgba(237,66,69,0.18)', 'rgba(237,66,69,0.34)');
  drawText(ctx, '!', 748, 176, {
    align: 'center',
    color: '#FF6B6B',
    size: 86,
    weight: 900,
  });

  return canvas.toBuffer('image/png');
}

module.exports = {
  createMissingPermissionCard,
};
