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

const KICK_DELETE_CUSTOM_ID_PREFIX = 'kick:delete:';
const DEFAULT_REASON = 'No reason provided.';
const DISCORD_REASON_LIMIT = 512;

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
      .setCustomId(`${KICK_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
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

function hasKickPermission(member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.KickMembers),
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
        'You need **Kick Members** or **Administrator** permission to use this command.',
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
        'I need **Kick Members** or **Administrator** permission to kick members.',
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
        `## ${emojis.label('status.warning', 'Kick Usage')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Usage:** \`${prefix}kick @user [reason]\``,
        '',
        '**Examples:**',
        `> \`${prefix}kick @user repeated rule breaks\``,
        `> \`${prefix}kick 123456789012345678 spam\``,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildErrorContainer({ errorMessage, ownerId, title = 'Kick Failed' }) {
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

function buildSuccessContainer({
  ownerId,
  reason,
  targetId,
  targetTag,
}) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', 'User Kicked')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `Successfully kicked <@${targetId}>.`,
        `**User:** ${targetTag} (\`${targetId}\`)`,
        `**Reason:** ${reason}`,
        '',
        `*Kicked by <@${ownerId}>*`,
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
  return user?.tag || user?.username || 'Unknown user';
}

async function resolveTargetMember(message, targetArg) {
  const targetId = extractUserId(targetArg);

  if (!targetId) {
    return null;
  }

  return message.guild.members.fetch(targetId).catch(() => null);
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

function getReadableError(error) {
  if (error.code === 50013) {
    return 'I could not kick this member because my role is too low or I am missing **Kick Members** permission.';
  }

  if (error.code === 10007) {
    return 'This member is no longer in the server.';
  }

  return `An error occurred while kicking this member.\n\`${error.message}\``;
}

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;

  if (!hasKickPermission(message.member)) {
    await message.reply(cv2Payload(buildMissingUserPermContainer()));
    return;
  }

  const botMember = message.guild.members.me
    || await message.guild.members.fetchMe().catch(() => null);

  if (!hasKickPermission(botMember)) {
    await message.reply(cv2Payload(buildMissingBotPermContainer({ ownerId })));
    return;
  }

  const targetMember = await resolveTargetMember(message, args[0]);

  if (!targetMember) {
    await message.reply(cv2Payload(buildUsageContainer({ ownerId, prefix })));
    return;
  }

  if (targetMember.id === message.author.id) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'You cannot kick yourself.',
      ownerId,
    })));
    return;
  }

  if (targetMember.id === message.client.user.id) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'I cannot kick myself.',
      ownerId,
    })));
    return;
  }

  if (targetMember.id === message.guild.ownerId) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'You cannot kick the server owner.',
      ownerId,
    })));
    return;
  }

  if (!canMemberModerateTarget(message.member, targetMember)) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'You cannot kick this member because their highest role is equal to or higher than yours, or they own the server.',
      ownerId,
    })));
    return;
  }

  if (!canMemberModerateTarget(botMember, targetMember) || !targetMember.kickable) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'I cannot kick this member because their highest role is equal to or higher than mine, or they own the server.',
      ownerId,
    })));
    return;
  }

  const reason = cleanReason(args.slice(1).join(' '));
  const auditReason = cleanReason(`Kicked by ${message.author.tag} (${message.author.id}): ${reason}`);
  const targetId = targetMember.id;
  const targetTag = getUserTag(targetMember.user);

  try {
    await targetMember.kick(auditReason);

    await message.channel.send(cv2Payload(buildSuccessContainer({
      ownerId,
      reason,
      targetId,
      targetTag,
    })));
  } catch (error) {
    console.error('Kick failed:', error);

    await message.channel.send(cv2Payload(buildErrorContainer({
      errorMessage: getReadableError(error),
      ownerId,
    })));
  }
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(KICK_DELETE_CUSTOM_ID_PREFIX.length);

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
  name: 'kick',
  aliases: ['boot'],
  category: 'moderation',
  description: 'Kick a member from the server with permission and role hierarchy checks.',
  usage: 'LR!kick @user [reason]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: KICK_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
