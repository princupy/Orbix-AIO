const { createCanvas } = require('@napi-rs/canvas');

const WIDTH = 900;
const HEIGHT = 360;

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

function getLatencyColor(value) {
  if (value <= 150) {
    return '#31D0AA';
  }

  if (value <= 300) {
    return '#F2C94C';
  }

  return '#F06A6A';
}

function getLatencyLabel(value) {
  if (value <= 150) {
    return 'Fast';
  }

  if (value <= 300) {
    return 'Stable';
  }

  return 'Slow';
}

function drawMetric(ctx, { label, value, x, y, color }) {
  drawText(ctx, label, x, y, {
    color: '#9EA7B3',
    size: 21,
    weight: 600,
  });
  drawText(ctx, `${value}ms`, x, y + 52, {
    color,
    size: 44,
    weight: 800,
  });
}

function drawProgress(ctx, { x, y, width, value, max, color }) {
  const fillWidth = clamp(value / max, 0.04, 1) * width;

  drawPanel(ctx, x, y, width, 14, 7, 'rgba(255,255,255,0.10)');
  drawPanel(ctx, x, y, fillWidth, 14, 7, color);
}

function drawGauge(ctx, { x, y, radius, value, color }) {
  const start = Math.PI * 0.78;
  const end = Math.PI * 2.22;
  const progress = clamp(value / 500, 0, 1);
  const current = start + (end - start) * progress;

  ctx.lineCap = 'round';
  ctx.lineWidth = 18;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(x, y, radius, start, end);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, start, current);
  ctx.stroke();

  const dotX = x + Math.cos(current) * radius;
  const dotY = y + Math.sin(current) * radius;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(dotX, dotY, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawSparkline(ctx, { x, y, width, height, latency, websocket, color }) {
  const values = [
    websocket * 0.7,
    latency * 0.55,
    websocket * 0.9,
    latency * 0.82,
    websocket,
    latency * 0.95,
    latency,
  ];
  const max = Math.max(250, ...values);
  const step = width / (values.length - 1);

  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.beginPath();

  values.forEach((point, index) => {
    const px = x + step * index;
    const py = y + height - clamp(point / max, 0, 1) * height;

    if (index === 0) {
      ctx.moveTo(px, py);
      return;
    }

    ctx.lineTo(px, py);
  });

  ctx.stroke();
}

async function createPingCard({ botName, latencyMs, websocketMs }) {
  const latency = Number.isFinite(latencyMs) ? latencyMs : 0;
  const websocket = Number.isFinite(websocketMs) ? websocketMs : 0;
  const color = latencyMs === null ? '#7AA2FF' : getLatencyColor(latency);
  const label = latencyMs === null ? 'Checking' : getLatencyLabel(latency);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, '#191B21');
  background.addColorStop(0.45, '#22252D');
  background.addColorStop(1, '#111318');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.beginPath();
  ctx.arc(725, 82, 250, 0, Math.PI * 2);
  ctx.fill();

  drawPanel(ctx, 32, 30, WIDTH - 64, HEIGHT - 60, 30, 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.12)');
  drawText(ctx, 'PING MONITOR', 68, 76, {
    color: '#9EA7B3',
    size: 20,
    weight: 800,
  });
  drawText(ctx, botName || 'Discord Bot', 68, 122, {
    color: '#FFFFFF',
    size: 40,
    weight: 800,
  });
  drawText(ctx, label, 68, 158, {
    color,
    size: 24,
    weight: 800,
  });

  drawPanel(ctx, 510, 62, 322, 92, 22, 'rgba(0,0,0,0.18)', 'rgba(255,255,255,0.10)');
  drawText(ctx, 'Live Trend', 538, 96, {
    color: '#9EA7B3',
    size: 18,
    weight: 700,
  });
  drawSparkline(ctx, {
    x: 538,
    y: 105,
    width: 248,
    height: 34,
    latency,
    websocket,
    color,
  });

  drawPanel(ctx, 68, 186, 300, 126, 22, 'rgba(0,0,0,0.22)', 'rgba(255,255,255,0.10)');
  drawMetric(ctx, {
    label: 'Bot Latency',
    value: latency,
    x: 96,
    y: 224,
    color,
  });
  drawProgress(ctx, {
    x: 96,
    y: 286,
    width: 220,
    value: latency,
    max: 500,
    color,
  });

  drawPanel(ctx, 390, 186, 240, 126, 22, 'rgba(0,0,0,0.22)', 'rgba(255,255,255,0.10)');
  drawMetric(ctx, {
    label: 'WebSocket',
    value: websocket,
    x: 418,
    y: 224,
    color: '#62C7FF',
  });
  drawProgress(ctx, {
    x: 418,
    y: 286,
    width: 176,
    value: websocket,
    max: 500,
    color: '#62C7FF',
  });

  drawPanel(ctx, 652, 186, 180, 126, 22, 'rgba(0,0,0,0.22)', 'rgba(255,255,255,0.10)');
  drawGauge(ctx, {
    x: 742,
    y: 247,
    radius: 46,
    value: latency,
    color,
  });
  drawText(ctx, 'Load', 742, 255, {
    align: 'center',
    baseline: 'middle',
    color: '#C8D0DA',
    size: 18,
    weight: 800,
  });

  return canvas.toBuffer('image/png');
}

module.exports = {
  createPingCard,
};
