const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  PermissionsBitField,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const SAY_CHANNEL_SELECT_PREFIX = 'say:channel:';
const SAY_CANCEL_PREFIX = 'say:cancel:';
const SAY_DELETE_PREFIX = 'say:delete:';

const SESSION_TTL = 5 * 60 * 1000;
const MAX_CONTENT_LENGTH = 2000;

// Holds the pending message text between the command and the channel pick.
// Keyed by `${ownerId}:${sessionId}`; entries are cleaned up on a TTL.
const saySessions = new Map();

function cleanupSessions() {
  const now = Date.now();

  for (const [key, session] of saySessions) {
    if (now - session.createdAt > SESSION_TTL) {
      saySessions.delete(key);
    }
  }
}

function createSessionId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* ── Reusable helpers (matches existing codebase style) ── */

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
      .setCustomId(`${SAY_DELETE_PREFIX}${ownerId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Secondary),
  );
}

function createChannelSelectRow(ownerId, sessionId) {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`${SAY_CHANNEL_SELECT_PREFIX}${ownerId}:${sessionId}`)
      .setPlaceholder('Select a channel to send this message')
      .setChannelTypes([ChannelType.GuildText, ChannelType.GuildAnnouncement])
      .setMinValues(1)
      .setMaxValues(1),
  );
}

function createCancelRow(ownerId, sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${SAY_CANCEL_PREFIX}${ownerId}:${sessionId}`)
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

function canSay(member) {
  return Boolean(member?.permissions?.has(PermissionsBitField.Flags.Administrator));
}

/**
 * Rebuild the raw text the user typed after the command word.
 * We use message.content (not args) so newlines and spacing are preserved.
 */
function extractContent(message, usedPrefix) {
  let content = message.content ?? '';

  if (usedPrefix && content.toLowerCase().startsWith(usedPrefix.toLowerCase())) {
    content = content.slice(usedPrefix.length);
  }

  // Strip leading whitespace + the command/alias token + the whitespace after it.
  return content.replace(/^\s*\S+\s*/, '').trim();
}

/* ── Container builders ── */

function buildMissingPermContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.label('status.error', 'Missing Permission')}`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('You need the **Administrator** permission to use this command.'),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildUsageContainer({ ownerId, prefix }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.label('status.warning', 'Say Usage')}`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Usage:** \`${prefix}say <message>\``,
        '',
        'Type your message, then pick a channel from the dropdown to post it there inside a clean container.',
        '',
        '**Example:**',
        `> \`${prefix}say Welcome to the server! Please read the rules.\``,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildErrorContainer({ ownerId, errorMessage, title = 'Say Failed' }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.label('status.error', title)}`),
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

function buildPreviewContainer({ content, ownerId, sessionId }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## 📢 Message Preview'),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('This message will be sent to the channel you pick below:'),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createChannelSelectRow(ownerId, sessionId))
    .addActionRowComponents(createCancelRow(ownerId, sessionId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Panel owner: <@${ownerId}>`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildSentContainer({ channelId, ownerId, url }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.label('status.success', 'Message Sent')}`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `Your message was sent to <#${channelId}>.`,
        url ? `[Jump to message](${url})` : null,
        '',
        `*Sent by <@${ownerId}>*`,
      ].filter(Boolean).join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

/** The actual message posted to the target channel — just the text in a clean container. */
function buildSayMessageContainer(content) {
  return new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(content),
  );
}

/* ── Command execute (prefix usage) ── */

async function execute({ message, prefix, usedPrefix }) {
  const ownerId = message.author.id;

  if (!canSay(message.member)) {
    await message.reply(cv2Payload(buildMissingPermContainer()));
    return;
  }

  const content = extractContent(message, usedPrefix);

  if (!content) {
    await message.reply(cv2Payload(buildUsageContainer({ ownerId, prefix })));
    return;
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    await message.reply(cv2Payload(buildErrorContainer({
      ownerId,
      title: 'Message Too Long',
      errorMessage: `Your message is **${content.length}** characters. The maximum is **${MAX_CONTENT_LENGTH}**.`,
    })));
    return;
  }

  cleanupSessions();

  const sessionId = createSessionId();
  saySessions.set(`${ownerId}:${sessionId}`, {
    content,
    createdAt: Date.now(),
    guildId: message.guild.id,
    ownerId,
  });

  await message.reply(cv2Payload(buildPreviewContainer({ content, ownerId, sessionId }), {
    allowedMentions: { parse: [] },
  }));
}

/* ── Interaction handlers ── */

async function handleChannelSelect({ interaction }) {
  const payload = interaction.customId.slice(SAY_CHANNEL_SELECT_PREFIX.length);
  const [ownerId, sessionId] = payload.split(':');

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the panel owner can use this menu.')).catch(() => null);
    return;
  }

  if (!canSay(interaction.member)) {
    await interaction.reply(createEphemeralTextPayload('You need the **Administrator** permission to use this.')).catch(() => null);
    return;
  }

  const session = saySessions.get(`${ownerId}:${sessionId}`);

  if (!session || session.guildId !== interaction.guildId) {
    await interaction.reply(createEphemeralTextPayload('This message preview has expired. Please run the command again.')).catch(() => null);
    return;
  }

  const targetId = interaction.values?.[0];
  const target = interaction.channels?.get(targetId)
    || interaction.guild.channels.cache.get(targetId)
    || await interaction.guild.channels.fetch(targetId).catch(() => null);

  if (!target || typeof target.send !== 'function' || !target.isTextBased?.()) {
    await interaction.reply(createEphemeralTextPayload('I cannot send messages to that channel. Please pick a text channel.')).catch(() => null);
    return;
  }

  const requiredPerms = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
  ];
  const botMember = interaction.guild.members.me
    || await interaction.guild.members.fetchMe().catch(() => null);

  if (!botMember || !target.permissionsFor(botMember)?.has(requiredPerms)) {
    await interaction.reply(createEphemeralTextPayload(`I do not have permission to send messages in <#${target.id}>.`)).catch(() => null);
    return;
  }

  let sent;

  try {
    sent = await target.send(cv2Payload(buildSayMessageContainer(session.content), {
      allowedMentions: { parse: ['everyone', 'roles', 'users'] },
    }));
  } catch (error) {
    await interaction.reply(createEphemeralTextPayload(`Failed to send the message: \`${error.message}\``)).catch(() => null);
    return;
  }

  saySessions.delete(`${ownerId}:${sessionId}`);

  await interaction.update(cv2Payload(buildSentContainer({
    channelId: target.id,
    ownerId,
    url: sent?.url,
  }))).catch(() => null);
}

async function handleCancel({ interaction }) {
  const payload = interaction.customId.slice(SAY_CANCEL_PREFIX.length);
  const [ownerId, sessionId] = payload.split(':');

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the panel owner can cancel this.')).catch(() => null);
    return;
  }

  saySessions.delete(`${ownerId}:${sessionId}`);

  await interaction.deferUpdate().catch(() => null);
  await interaction.message.delete().catch(() => null);
}

async function handleDelete({ interaction }) {
  const ownerId = interaction.customId.slice(SAY_DELETE_PREFIX.length);

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
  name: 'say',
  aliases: ['announce', 'echo'],
  category: 'moderation',
  description: 'Write a message, pick a channel, and the bot posts it there inside a clean container.',
  noTimeout: true, // Preview has a persistent channel-select dropdown that must not expire.
  usage: 'LR!say <message>',
  execute,
  componentHandlers: [
    {
      customIdPrefix: SAY_CHANNEL_SELECT_PREFIX,
      execute: handleChannelSelect,
    },
    {
      customIdPrefix: SAY_CANCEL_PREFIX,
      execute: handleCancel,
    },
    {
      customIdPrefix: SAY_DELETE_PREFIX,
      execute: handleDelete,
    },
  ],
};
