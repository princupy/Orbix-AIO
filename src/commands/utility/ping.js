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
const { createPingCard } = require('../../canvas/pingCard');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const SUPPORT_INVITE_URL = 'https://discord.gg/vR55mBkjYY';

function getSafeWebSocketPing(client) {
  const ping = Math.round(client.ws.ping);
  return Number.isFinite(ping) && ping >= 0 ? ping : 0;
}

function getBotAvatarUrl(client) {
  return client.user?.displayAvatarURL?.({
    extension: 'png',
    size: 128,
  }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function createTopSection({ client, latencyMs }) {
  const wsPing = getSafeWebSocketPing(client);
  const latencyText = latencyMs === null ? 'checking...' : `${latencyMs}ms`;
  const section = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## ${emojis.label('utility.ping', 'My Latency')}`,
        ` > <:dot_green:1501449633828962304> **Bot Latency:** [${latencyText}](${SUPPORT_INVITE_URL})`,
        ` > <:dot_green:1501449633828962304> **WebSocket:** [${wsPing}ms](${SUPPORT_INVITE_URL})`,
      ].join('\n'),
    ),
  );
  const avatarUrl = getBotAvatarUrl(client);

  if (avatarUrl) {
    section.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(avatarUrl)
        .setDescription(`${client.user.username} avatar`),
    );
  }

  return section;
}

function createPingGallery(filename) {
  return new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder()
      .setURL(`attachment://${filename}`)
      .setDescription('Live ping canvas'),
  );
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('lr.logo') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} **Powered by Prince**`);
}

function buildPingContainerTextOnly({ client, latencyMs }) {
  return new ContainerBuilder()
    .addSectionComponents(createTopSection({ client, latencyMs }))
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(createFooterText());
}

function buildPingContainer({ client, latencyMs, filename }) {
  return new ContainerBuilder()
    .addSectionComponents(createTopSection({ client, latencyMs }))
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addMediaGalleryComponents(createPingGallery(filename))
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(createFooterText());
}

async function buildPingPayload({ client, latencyMs, requesterId, replaceAttachments = false }) {
  const wsPing = getSafeWebSocketPing(client);
  const filename = `ping-card-${requesterId}-${Date.now()}.png`;
  const avatarURL = client.user?.displayAvatarURL?.({
    extension: 'png',
    forceStatic: true,
    size: 256,
  }) || null;
  const canvas = await createPingCard({
    avatarURL,
    botName: client.user?.username,
    latencyMs,
    websocketMs: wsPing,
  });

  // canvas is null when @napi-rs/canvas is unavailable on this server
  if (!canvas) {
    return cv2Payload(buildPingContainerTextOnly({ client, latencyMs }));
  }

  const attachment = new AttachmentBuilder(canvas, {
    name: filename,
    description: 'Live ping canvas',
  });

  return cv2Payload(
    buildPingContainer({
      client,
      filename,
      latencyMs,
    }),
    {
      attachments: replaceAttachments ? [] : undefined,
      files: [attachment],
    },
  );
}

async function execute({ client, message }) {
  const startedAt = Date.now();
  const pendingPayload = await buildPingPayload({
    client,
    latencyMs: null,
    requesterId: message.author.id,
  });

  const sentMessage = await message.channel.send(pendingPayload);
  const latencyMs = Math.max(0, Date.now() - startedAt);

  await sentMessage.edit(
    await buildPingPayload({
      client,
      latencyMs,
      requesterId: message.author.id,
      replaceAttachments: true,
    }),
  );
}

module.exports = {
  name: 'ping',
  aliases: ['latency'],
  category: 'utility',
  description: 'Shows bot latency.',
  usage: 'LR!ping',
  noTimeout: true,
  execute,
};
