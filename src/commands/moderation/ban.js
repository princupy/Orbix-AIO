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
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const BAN_CONFIRM_CUSTOM_ID_PREFIX = 'ban:confirm:';
const BAN_CANCEL_CUSTOM_ID_PREFIX = 'ban:cancel:';
const BAN_DELETE_CUSTOM_ID_PREFIX = 'ban:delete:';
const DEFAULT_REASON = 'No reason provided.';
const DISCORD_REASON_LIMIT = 512;
const SESSION_TTL = 5 * 60 * 1000;

const banSessions = new Map();

function cleanupSessions() {
  const now = Date.now();

  for (const [key, session] of banSessions) {
    if (now - session.createdAt > SESSION_TTL) {
      banSessions.delete(key);
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
      .setCustomId(`${BAN_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Secondary),
  );
}

function createConfirmRow(ownerId, sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BAN_CONFIRM_CUSTOM_ID_PREFIX}${ownerId}:${sessionId}`)
      .setLabel('Confirm Ban')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${BAN_CANCEL_CUSTOM_ID_PREFIX}${ownerId}:${sessionId}`)
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

function hasBanPermission(member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.BanMembers),
  );
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
        'You need **Ban Members** or **Administrator** permission to use this command.',
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
        'I need **Ban Members** or **Administrator** permission to ban members.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildUsageContainer({ ownerId, prefix }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', 'Ban Usage')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Usage:** \`${prefix}ban @user [reason]\``,
        '',
        '**Examples:**',
        `> \`${prefix}ban @user repeated raids\``,
        `> \`${prefix}ban 123456789012345678 scam links\``,
        '',
        '*A confirmation button will appear before the ban is applied.*',
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildErrorContainer({ errorMessage, ownerId, title = 'Ban Failed' }) {
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
  ownerId,
  reason,
  sessionId,
  targetId,
  targetTag,
}) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', 'Confirm Ban')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `Are you sure you want to ban <@${targetId}>?`,
        `**User:** ${targetTag || 'Unknown user'} (\`${targetId}\`)`,
        `**Reason:** ${reason}`,
        '',
        '*This action will ban the user from the server.*',
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
  ownerId,
  reason,
  targetId,
  targetTag,
}) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', 'User Banned')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `Successfully banned <@${targetId}>.`,
        `**User:** ${targetTag || 'Unknown user'} (\`${targetId}\`)`,
        `**Reason:** ${reason}`,
        '',
        `*Banned by <@${ownerId}>*`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function extractUserId(value) {
  const mentionMatch = value?.match(/^<@!?(\d{17,20})>$/);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  return /^\d{17,20}$/.test(value || '') ? value : null;
}

function cleanReason(reason) {
  const normalized = reason?.trim() || DEFAULT_REASON;
  return normalized.slice(0, DISCORD_REASON_LIMIT);
}

function getUserTag(user) {
  if (!user) {
    return null;
  }

  return user.tag || user.username || `${user.id}`;
}

async function resolveBanTarget(message, targetArg) {
  const targetId = extractUserId(targetArg);

  if (!targetId) {
    return null;
  }

  const targetMember = await message.guild.members.fetch(targetId).catch(() => null);
  const targetUser = targetMember?.user
    || await message.client.users.fetch(targetId).catch(() => null);

  return {
    targetId,
    targetMember,
    targetTag: getUserTag(targetUser),
  };
}

function canMemberModerateTarget(actorMember, targetMember) {
  if (actorMember.id === actorMember.guild.ownerId) {
    return true;
  }

  if (targetMember.id === actorMember.guild.ownerId) {
    return false;
  }

  return actorMember.roles.highest.position > targetMember.roles.highest.position;
}

async function validateBan({
  actorMember,
  botMember,
  clientUserId,
  guild,
  ownerId,
  targetId,
  targetMember,
}) {
  if (!hasBanPermission(actorMember)) {
    return buildMissingUserPermContainer();
  }

  if (!hasBanPermission(botMember)) {
    return buildMissingBotPermContainer({ ownerId });
  }

  if (targetId === actorMember.id) {
    return buildErrorContainer({
      errorMessage: 'You cannot ban yourself.',
      ownerId,
    });
  }

  if (targetId === clientUserId) {
    return buildErrorContainer({
      errorMessage: 'I cannot ban myself.',
      ownerId,
    });
  }

  if (targetId === guild.ownerId) {
    return buildErrorContainer({
      errorMessage: 'You cannot ban the server owner.',
      ownerId,
    });
  }

  if (targetMember && !canMemberModerateTarget(actorMember, targetMember)) {
    return buildErrorContainer({
      errorMessage: 'You cannot ban this member because their highest role is equal to or higher than yours, or they own the server.',
      ownerId,
    });
  }

  if (targetMember && (!canMemberModerateTarget(botMember, targetMember) || !targetMember.bannable)) {
    return buildErrorContainer({
      errorMessage: 'I cannot ban this member because their highest role is equal to or higher than mine, or they own the server.',
      ownerId,
    });
  }

  const existingBan = await guild.bans.fetch(targetId).catch(() => null);

  if (existingBan) {
    return buildErrorContainer({
      errorMessage: 'This user is already banned from this server.',
      ownerId,
      title: 'Already Banned',
    });
  }

  return null;
}

function getReadableError(error) {
  if (error.code === 50013) {
    return 'I could not ban this user because my role is too low or I am missing **Ban Members** permission.';
  }

  if (error.code === 10013) {
    return 'Discord could not find that user. Please check the user ID and try again.';
  }

  if (error.code === 50035) {
    return 'Discord rejected the ban request. Please check the user ID and try again.';
  }

  return `An error occurred while banning this user.\n\`${error.message}\``;
}

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;

  if (!hasBanPermission(message.member)) {
    await message.reply(cv2Payload(buildMissingUserPermContainer()));
    return;
  }

  const botMember = message.guild.members.me
    || await message.guild.members.fetchMe().catch(() => null);

  if (!hasBanPermission(botMember)) {
    await message.reply(cv2Payload(buildMissingBotPermContainer({ ownerId })));
    return;
  }

  const target = await resolveBanTarget(message, args[0]);

  if (!target) {
    await message.reply(cv2Payload(buildUsageContainer({ ownerId, prefix })));
    return;
  }

  const validationError = await validateBan({
    actorMember: message.member,
    botMember,
    clientUserId: message.client.user.id,
    guild: message.guild,
    ownerId,
    targetId: target.targetId,
    targetMember: target.targetMember,
  });

  if (validationError) {
    await message.reply(cv2Payload(validationError));
    return;
  }

  cleanupSessions();

  const sessionId = createSessionId();
  const reason = cleanReason(args.slice(1).join(' '));

  banSessions.set(`${ownerId}:${sessionId}`, {
    createdAt: Date.now(),
    guildId: message.guild.id,
    ownerId,
    reason,
    targetId: target.targetId,
    targetTag: target.targetTag,
  });

  await message.reply(cv2Payload(buildConfirmContainer({
    ownerId,
    reason,
    sessionId,
    targetId: target.targetId,
    targetTag: target.targetTag,
  })));
}

async function handleConfirmButton({ interaction }) {
  const payload = interaction.customId.slice(BAN_CONFIRM_CUSTOM_ID_PREFIX.length);
  const [ownerId, sessionId] = payload.split(':');

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can confirm this ban.')).catch(() => null);
    return;
  }

  const sessionKey = `${ownerId}:${sessionId}`;
  const session = banSessions.get(sessionKey);

  if (!session || session.guildId !== interaction.guildId) {
    await interaction.reply(createEphemeralTextPayload('This ban confirmation has expired. Please run the command again.')).catch(() => null);
    return;
  }

  await interaction.deferUpdate().catch(() => null);
  await interaction.message.delete().catch(() => null);
  banSessions.delete(sessionKey);

  const actorMember = await interaction.guild.members.fetch(ownerId).catch(() => null);
  const botMember = interaction.guild.members.me
    || await interaction.guild.members.fetchMe().catch(() => null);
  const targetMember = await interaction.guild.members.fetch(session.targetId).catch(() => null);

  const validationError = await validateBan({
    actorMember,
    botMember,
    clientUserId: interaction.client.user.id,
    guild: interaction.guild,
    ownerId,
    targetId: session.targetId,
    targetMember,
  });

  if (validationError) {
    await interaction.channel.send(cv2Payload(validationError)).catch(() => null);
    return;
  }

  const auditReason = cleanReason(`Banned by ${interaction.user.tag} (${interaction.user.id}): ${session.reason}`);

  try {
    await interaction.guild.members.ban(session.targetId, {
      deleteMessageSeconds: 0,
      reason: auditReason,
    });

    await interaction.channel.send(cv2Payload(buildSuccessContainer({
      ownerId,
      reason: session.reason,
      targetId: session.targetId,
      targetTag: session.targetTag,
    })));
  } catch (error) {
    console.error('Ban failed:', error);

    await interaction.channel.send(cv2Payload(buildErrorContainer({
      errorMessage: getReadableError(error),
      ownerId,
    }))).catch(() => null);
  }
}

async function handleCancelButton({ interaction }) {
  const payload = interaction.customId.slice(BAN_CANCEL_CUSTOM_ID_PREFIX.length);
  const [ownerId, sessionId] = payload.split(':');

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can cancel this ban.')).catch(() => null);
    return;
  }

  banSessions.delete(`${ownerId}:${sessionId}`);

  await interaction.deferUpdate().catch(() => null);
  await interaction.message.delete().catch(() => null);
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(BAN_DELETE_CUSTOM_ID_PREFIX.length);

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
  name: 'ban',
  aliases: ['hackban'],
  category: 'moderation',
  description: 'Ban a user from the server after a confirmation prompt.',
  usage: 'LR!ban @user [reason]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: BAN_CONFIRM_CUSTOM_ID_PREFIX,
      execute: handleConfirmButton,
    },
    {
      customIdPrefix: BAN_CANCEL_CUSTOM_ID_PREFIX,
      execute: handleCancelButton,
    },
    {
      customIdPrefix: BAN_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
