const {
  AttachmentBuilder,
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const { createMemberCountCard } = require('../../canvas/memberCountCard');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const GREEN_DOT = '<:dot_green:1501449633828962304>';
const FALLBACK_ICON = 'https://cdn.discordapp.com/embed/avatars/0.png';

function getServerIconUrl(guild, size = 256) {
  return guild.iconURL?.({
    extension: 'png',
    forceStatic: true,
    size,
  }) || null;
}

function collectStats(guild) {
  const roleCount = Math.max(0, guild.roles.cache.size - 1);
  const channelCount = guild.channels.cache.filter(
    (channel) => channel.type !== ChannelType.GuildCategory,
  ).size;

  return {
    boostCount: guild.premiumSubscriptionCount || 0,
    boostTier: guild.premiumTier || 0,
    channelCount,
    createdTimestamp: guild.createdTimestamp,
    emojiCount: guild.emojis.cache.size,
    memberCount: guild.memberCount || 0,
    roleCount,
  };
}

function formatCreatedLabel(timestamp) {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function createTopSection({ guild, stats }) {
  const section = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## ${emojis.label('config.settings', 'Member Count')}`,
        ` > ${GREEN_DOT} **Members:** ${stats.memberCount.toLocaleString('en-US')}`,
        ` > ${GREEN_DOT} **Roles:** ${stats.roleCount} • **Channels:** ${stats.channelCount}`,
        ` > ${GREEN_DOT} **Created:** <t:${Math.floor(stats.createdTimestamp / 1000)}:D>`,
      ].join('\n'),
    ),
  );
  const iconUrl = getServerIconUrl(guild, 128) || FALLBACK_ICON;

  section.setThumbnailAccessory(
    new ThumbnailBuilder()
      .setURL(iconUrl)
      .setDescription(`${guild.name} icon`),
  );

  return section;
}

function createMemberGallery(filename) {
  return new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder()
      .setURL(`attachment://${filename}`)
      .setDescription('Server member count canvas'),
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

function buildMemberContainerTextOnly({ guild, stats }) {
  return new ContainerBuilder()
    .addSectionComponents(createTopSection({ guild, stats }))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          ` > ${GREEN_DOT} **Boosts:** ${stats.boostCount} (Level ${stats.boostTier})`,
          ` > ${GREEN_DOT} **Emojis:** ${stats.emojiCount}`,
        ].join('\n'),
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildMemberContainer({ filename, guild, stats }) {
  return new ContainerBuilder()
    .addSectionComponents(createTopSection({ guild, stats }))
    .addSeparatorComponents(createSeparator())
    .addMediaGalleryComponents(createMemberGallery(filename))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

async function buildMemberPayload({ guild, requesterId }) {
  const stats = collectStats(guild);
  const filename = `membercount-${requesterId}-${Date.now()}.png`;
  const canvas = await createMemberCountCard({
    boostCount: stats.boostCount,
    boostTier: stats.boostTier,
    channelCount: stats.channelCount,
    createdLabel: formatCreatedLabel(stats.createdTimestamp),
    emojiCount: stats.emojiCount,
    iconURL: getServerIconUrl(guild, 256),
    memberCount: stats.memberCount,
    roleCount: stats.roleCount,
    serverName: guild.name,
  });

  // canvas is null when @napi-rs/canvas is unavailable on this server
  if (!canvas) {
    return cv2Payload(buildMemberContainerTextOnly({ guild, stats }));
  }

  const attachment = new AttachmentBuilder(canvas, {
    name: filename,
    description: 'Server member count canvas',
  });

  return cv2Payload(
    buildMemberContainer({ filename, guild, stats }),
    { files: [attachment] },
  );
}

async function execute({ message }) {
  await message.channel.send(await buildMemberPayload({
    guild: message.guild,
    requesterId: message.author.id,
  }));
}

module.exports = {
  name: 'membercount',
  aliases: ['members', 'mc'],
  category: 'utility',
  description: 'Shows the server member count and key server stats.',
  usage: 'LR!membercount',
  noTimeout: true,
  execute,
};
