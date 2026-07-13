const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  PermissionsBitField,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const emojis = require('../emojis');
const { cv2Payload } = require('./cv2');

const MEDIA_DELETE_CUSTOM_ID_PREFIX = 'media:delete:';

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('lr.logo') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} **Powered by Prince**`);
}

function createDeleteRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${MEDIA_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Secondary),
  );
}

function createEphemeralTextPayload(content) {
  return cv2Payload(
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    ),
    { ephemeral: true },
  );
}

function canManageMediaOnly(member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.ManageChannels),
  );
}

function canEnforceMediaOnly(member, channel) {
  return Boolean(
    member
    && (
      member.permissions?.has(PermissionsBitField.Flags.Administrator)
      || channel.permissionsFor(member)?.has(PermissionsBitField.Flags.ManageMessages)
    ),
  );
}

function isSupportedMediaOnlyChannel(channel) {
  return Boolean(
    channel?.guild
    && channel?.isTextBased?.()
    && !channel?.isDMBased?.()
    && !channel?.isThread?.()
  );
}

function parseChannelId(value) {
  const mentionMatch = value?.match(/^<#(\d{17,20})>$/);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  return /^\d{17,20}$/.test(value || '') ? value : null;
}

function getTargetChannelIds(message, args) {
  const channelIds = new Set();

  for (const channel of message.mentions.channels.values()) {
    channelIds.add(channel.id);
  }

  for (const arg of args) {
    const channelId = parseChannelId(arg);

    if (channelId) {
      channelIds.add(channelId);
    }
  }

  if (channelIds.size === 0) {
    channelIds.add(message.channel.id);
  }

  return [...channelIds];
}

async function resolveGuildChannel(guild, channelId) {
  return guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);
}

async function getTargetChannels(message, args) {
  const channels = await Promise.all(
    getTargetChannelIds(message, args)
      .map((channelId) => resolveGuildChannel(message.guild, channelId)),
  );

  return channels.filter(isSupportedMediaOnlyChannel);
}

function formatChannelList(channelIds, guild) {
  if (channelIds.length === 0) {
    return '`None`';
  }

  return channelIds
    .map((channelId, index) => `${index + 1}. <#${channelId}> (\`${channelId}\`)`)
    .join('\n');
}

function buildMediaHomeContainer({ ownerId, prefix }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', 'Media Only')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Usage:** \`${prefix}media\``,
        '',
        `\`${prefix}media setup [#channel/channelId]\``,
        'Add channels to media only.',
        '',
        `\`${prefix}media remove [#channel/channelId]\``,
        'Remove channels from media only.',
        '',
        `\`${prefix}media show\``,
        'Shows the current channels for media only.',
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildNoticeContainer({
  description,
  ownerId,
  title,
}) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(description),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildMediaShowContainer({
  channelIds,
  guild,
  ownerId,
  prefix,
}) {
  return buildNoticeContainer({
    ownerId,
    title: emojis.label('status.success', 'Media Only Channels'),
    description: [
      `Current media-only channels for **${guild.name}**:`,
      '',
      formatChannelList(channelIds, guild),
      '',
      `Use \`${prefix}media setup #channel\` or \`${prefix}media setup channelId\` to add more channels.`,
    ].join('\n'),
  });
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(MEDIA_DELETE_CUSTOM_ID_PREFIX.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can delete this panel.')).catch(() => null);
    return;
  }

  await interaction.deferUpdate().catch(() => null);

  const deleted = await interaction.message.delete()
    .then(() => true)
    .catch(() => false);

  if (!deleted) {
    await interaction.followUp(createEphemeralTextPayload('I could not delete this panel.')).catch(() => null);
  }
}

module.exports = {
  MEDIA_DELETE_CUSTOM_ID_PREFIX,
  buildMediaHomeContainer,
  buildMediaShowContainer,
  buildNoticeContainer,
  canEnforceMediaOnly,
  canManageMediaOnly,
  formatChannelList,
  getTargetChannelIds,
  getTargetChannels,
  handleDeleteButton,
  isSupportedMediaOnlyChannel,
};
