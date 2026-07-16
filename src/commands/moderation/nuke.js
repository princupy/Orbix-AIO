const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  PermissionsBitField,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const NUKE_CONFIRM_CUSTOM_ID_PREFIX = 'nuke:confirm:';
const NUKE_CANCEL_CUSTOM_ID_PREFIX = 'nuke:cancel:';
const NUKE_DELETE_CUSTOM_ID_PREFIX = 'nuke:delete:';
const DEFAULT_REASON = 'No reason provided.';
const DISCORD_REASON_LIMIT = 512;
const SESSION_TTL = 5 * 60 * 1000;

const nukeSessions = new Map();

const NUKABLE_CHANNEL_TYPES = new Set([
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
  ChannelType.GuildStageVoice,
  ChannelType.GuildText,
  ChannelType.GuildVoice,
]);

function cleanupSessions() {
  const now = Date.now();

  for (const [key, session] of nukeSessions) {
    if (now - session.createdAt > SESSION_TTL) {
      nukeSessions.delete(key);
    }
  }
}

function createSessionId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
}

function createDeleteRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${NUKE_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Secondary),
  );
}

function createConfirmRow(ownerId, sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${NUKE_CONFIRM_CUSTOM_ID_PREFIX}${ownerId}:${sessionId}`)
      .setLabel('Confirm Nuke')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${NUKE_CANCEL_CUSTOM_ID_PREFIX}${ownerId}:${sessionId}`)
      .setLabel('Cancel')
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

function hasManageChannelsPermission(member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.ManageChannels),
  );
}

function hasChannelManagePermission(channel, member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || channel.permissionsFor(member)?.has(PermissionsBitField.Flags.ManageChannels),
  );
}

function cleanReason(reason) {
  const normalized = reason?.trim() || DEFAULT_REASON;
  return normalized.slice(0, DISCORD_REASON_LIMIT);
}

function buildMissingUserPermContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'Missing Permission')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'You need **Manage Channels** or **Administrator** permission to use this command.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildMissingBotPermContainer({ ownerId }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'Bot Permission Missing')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'I need **Manage Channels** or **Administrator** permission to nuke channels.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildUnsupportedContainer({ ownerId }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'Cannot Nuke Here')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'This command can only be used in normal guild channels, not threads or DMs.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildErrorContainer({ errorMessage, ownerId, title = 'Nuke Failed' }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', title)}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(errorMessage),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildConfirmContainer({
  channel,
  ownerId,
  reason,
  sessionId,
}) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', 'Confirm Channel Nuke')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `Are you sure you want to nuke ${channel}?`,
        `**Channel:** \`${channel.name}\` (\`${channel.id}\`)`,
        `**Reason:** ${reason}`,
        '',
        '*This deletes the current channel and recreates a fresh clone. Message history will be removed.*',
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createConfirmRow(ownerId, sessionId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Panel owner: <@${ownerId}>`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildSuccessContainer({
  oldChannelId,
  ownerId,
  reason,
}) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', 'Channel Nuked')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        'This channel has been recreated successfully.',
        `**Old Channel ID:** \`${oldChannelId}\``,
        `**Reason:** ${reason}`,
        '',
        `*Nuked by <@${ownerId}>*`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function isNukableChannel(channel) {
  return Boolean(
    channel?.guild
    && channel?.clone
    && channel?.delete
    && NUKABLE_CHANNEL_TYPES.has(channel.type),
  );
}

function getReadableError(error) {
  if (error.code === 50013) {
    return 'I could not nuke this channel because I am missing **Manage Channels** permission or the channel is protected.';
  }

  if (error.code === 10003) {
    return 'This channel no longer exists.';
  }

  if (error.code === 50001) {
    return 'I do not have access to this channel.';
  }

  return `An error occurred while nuking this channel.\n\`${error.message}\``;
}

async function validateNuke({
  botMember,
  channel,
  member,
  ownerId,
}) {
  if (!hasManageChannelsPermission(member) || !hasChannelManagePermission(channel, member)) {
    return buildMissingUserPermContainer();
  }

  if (!hasManageChannelsPermission(botMember) || !hasChannelManagePermission(channel, botMember)) {
    return buildMissingBotPermContainer({ ownerId });
  }

  if (!isNukableChannel(channel)) {
    return buildUnsupportedContainer({ ownerId });
  }

  if (!channel.deletable || !channel.manageable) {
    return buildErrorContainer({
      errorMessage: 'I cannot delete or recreate this channel. It may be protected or above my permissions.',
      ownerId,
    });
  }

  return null;
}

async function execute({ args, message }) {
  const ownerId = message.author.id;
  const botMember = message.guild.members.me
    || await message.guild.members.fetchMe().catch(() => null);
  const validationError = await validateNuke({
    botMember,
    channel: message.channel,
    member: message.member,
    ownerId,
  });

  if (validationError) {
    await message.reply(cv2Payload(validationError));
    return;
  }

  cleanupSessions();

  const sessionId = createSessionId();
  const reason = cleanReason(args.join(' '));

  nukeSessions.set(`${ownerId}:${sessionId}`, {
    channelId: message.channel.id,
    createdAt: Date.now(),
    guildId: message.guild.id,
    name: message.channel.name,
    ownerId,
    position: message.channel.rawPosition,
    reason,
  });

  await message.reply(cv2Payload(buildConfirmContainer({
    channel: message.channel,
    ownerId,
    reason,
    sessionId,
  })));
}

async function handleConfirmButton({ interaction }) {
  const payload = interaction.customId.slice(NUKE_CONFIRM_CUSTOM_ID_PREFIX.length);
  const [ownerId, sessionId] = payload.split(':');

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can confirm this nuke.')).catch(() => null);
    return;
  }

  const sessionKey = `${ownerId}:${sessionId}`;
  const session = nukeSessions.get(sessionKey);

  if (!session || session.guildId !== interaction.guildId) {
    await interaction.reply(createEphemeralTextPayload('This nuke confirmation has expired. Please run the command again.')).catch(() => null);
    return;
  }

  await interaction.deferUpdate().catch(() => null);
  nukeSessions.delete(sessionKey);

  const channel = await interaction.guild.channels.fetch(session.channelId).catch(() => null);
  const member = await interaction.guild.members.fetch(ownerId).catch(() => null);
  const botMember = interaction.guild.members.me
    || await interaction.guild.members.fetchMe().catch(() => null);

  if (!channel) {
    await interaction.followUp(createEphemeralTextPayload('This channel no longer exists.')).catch(() => null);
    return;
  }

  const validationError = await validateNuke({
    botMember,
    channel,
    member,
    ownerId,
  });

  if (validationError) {
    await interaction.editReply(cv2Payload(validationError)).catch(() => null);
    return;
  }

  const auditReason = cleanReason(`Nuked by ${interaction.user.tag} (${interaction.user.id}): ${session.reason}`);

  try {
    const clonedChannel = await channel.clone({
      name: session.name,
      position: session.position,
      reason: auditReason,
    });

    await channel.delete(auditReason);
    await clonedChannel.setPosition(session.position, { reason: auditReason }).catch(() => null);

    await clonedChannel.send(cv2Payload(buildSuccessContainer({
      oldChannelId: session.channelId,
      ownerId,
      reason: session.reason,
    }))).catch(() => null);
  } catch (error) {
    console.error('Nuke failed:', error);

    const errorPayload = cv2Payload(buildErrorContainer({
      errorMessage: getReadableError(error),
      ownerId,
    }));

    if (interaction.channel?.id === session.channelId) {
      await interaction.followUp(errorPayload).catch(() => null);
      return;
    }

    await interaction.channel?.send(errorPayload).catch(() => null);
  }
}

async function handleCancelButton({ interaction }) {
  const payload = interaction.customId.slice(NUKE_CANCEL_CUSTOM_ID_PREFIX.length);
  const [ownerId, sessionId] = payload.split(':');

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can cancel this nuke.')).catch(() => null);
    return;
  }

  nukeSessions.delete(`${ownerId}:${sessionId}`);

  await interaction.deferUpdate().catch(() => null);
  await interaction.message.delete().catch(() => null);
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(NUKE_DELETE_CUSTOM_ID_PREFIX.length);

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
  name: 'nuke',
  aliases: ['clonechannel'],
  category: 'moderation',
  description: 'Delete and recreate the current channel after confirmation.',
  usage: 'LR!nuke [reason]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: NUKE_CONFIRM_CUSTOM_ID_PREFIX,
      execute: handleConfirmButton,
    },
    {
      customIdPrefix: NUKE_CANCEL_CUSTOM_ID_PREFIX,
      execute: handleCancelButton,
    },
    {
      customIdPrefix: NUKE_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
