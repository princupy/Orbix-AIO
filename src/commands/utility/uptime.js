const {
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const { createUptimeCard } = require('../../canvas/uptimeCard');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const SUPPORT_INVITE_URL = 'https://discord.gg/vR55mBkjYY';
const GREEN_DOT = '<:dot_green:1501449633828962304>';

function getSafeWebSocketPing(client) {
  const ping = Math.round(client.ws.ping);
  return Number.isFinite(ping) && ping >= 0 ? ping : 0;
}

function getBotAvatarUrl(client, size = 256) {
  return client.user?.displayAvatarURL?.({
    extension: 'png',
    forceStatic: true,
    size,
  }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function collectStats(client) {
  const uptimeMs = client.uptime ?? 0;
  const serverCount = client.guilds.cache.size;
  const userCount = client.guilds.cache.reduce(
    (sum, guild) => sum + (guild.memberCount || 0),
    0,
  ) || client.users.cache.size;
  const memoryMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

  return {
    memoryMB,
    onlineSince: Date.now() - uptimeMs,
    serverCount,
    uptimeMs,
    userCount,
    websocketMs: getSafeWebSocketPing(client),
  };
}

function formatUptimeText(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];

  if (days) {
    parts.push(`${days}d`);
  }

  if (hours) {
    parts.push(`${hours}h`);
  }

  if (minutes) {
    parts.push(`${minutes}m`);
  }

  parts.push(`${seconds}s`);

  return parts.join(' ');
}

function formatSinceLabel(ms) {
  return new Date(ms).toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });
}

function createTopSection({ client, stats }) {
  const section = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## ${emojis.label('status.success', 'Bot Uptime')}`,
        ` > ${GREEN_DOT} **Uptime:** [${formatUptimeText(stats.uptimeMs)}](${SUPPORT_INVITE_URL})`,
        ` > ${GREEN_DOT} **Online since:** <t:${Math.floor(stats.onlineSince / 1000)}:F>`,
      ].join('\n'),
    ),
  );
  const avatarUrl = getBotAvatarUrl(client, 128);

  if (avatarUrl) {
    section.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(avatarUrl)
        .setDescription(`${client.user?.username || 'Bot'} avatar`),
    );
  }

  return section;
}

function createUptimeGallery(filename) {
  return new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder()
      .setURL(`attachment://${filename}`)
      .setDescription('Bot uptime canvas'),
  );
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
}

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function buildUptimeContainerTextOnly({ client, stats }) {
  return new ContainerBuilder()
    .addSectionComponents(createTopSection({ client, stats }))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          ` > ${GREEN_DOT} **Servers:** ${stats.serverCount}`,
          ` > ${GREEN_DOT} **Users:** ${stats.userCount}`,
          ` > ${GREEN_DOT} **Memory:** ${stats.memoryMB} MB`,
          ` > ${GREEN_DOT} **WebSocket:** ${stats.websocketMs}ms`,
        ].join('\n'),
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildUptimeContainer({ client, filename, stats }) {
  return new ContainerBuilder()
    .addSectionComponents(createTopSection({ client, stats }))
    .addSeparatorComponents(createSeparator())
    .addMediaGalleryComponents(createUptimeGallery(filename))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

async function buildUptimePayload({ client, requesterId }) {
  const stats = collectStats(client);
  const filename = `uptime-card-${requesterId}-${Date.now()}.png`;
  const canvas = await createUptimeCard({
    avatarURL: getBotAvatarUrl(client, 256),
    botName: client.user?.username,
    memoryMB: stats.memoryMB,
    serverCount: stats.serverCount,
    sinceLabel: formatSinceLabel(stats.onlineSince),
    uptimeMs: stats.uptimeMs,
    userCount: stats.userCount,
    websocketMs: stats.websocketMs,
  });

  // canvas is null when @napi-rs/canvas is unavailable on this server
  if (!canvas) {
    return cv2Payload(buildUptimeContainerTextOnly({ client, stats }));
  }

  const attachment = new AttachmentBuilder(canvas, {
    name: filename,
    description: 'Bot uptime canvas',
  });

  return cv2Payload(
    buildUptimeContainer({ client, filename, stats }),
    { files: [attachment] },
  );
}

async function execute({ client, message }) {
  await message.channel.send(await buildUptimePayload({
    client,
    requesterId: message.author.id,
  }));
}

module.exports = {
  name: 'uptime',
  aliases: ['up', 'online'],
  category: 'utility',
  description: 'Shows how long the bot has been online with live system stats.',
  usage: 'LR!uptime',
  noTimeout: true,
  execute,
};
