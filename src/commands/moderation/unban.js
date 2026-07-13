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

const UNBAN_DELETE_CUSTOM_ID_PREFIX = 'unban:delete:';
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
      .setCustomId(`${UNBAN_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
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
        'I need **Ban Members** or **Administrator** permission to unban users.',
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
        `## ${emojis.label('status.warning', 'Unban Usage')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Usage:** \`${prefix}unban <user_id> [reason]\``,
        '',
        '**Examples:**',
        `> \`${prefix}unban 123456789012345678 appeal accepted\``,
        `> \`${prefix}unban @user wrong ban\``,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildErrorContainer({ errorMessage, ownerId, title = 'Unban Failed' }) {
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
        `## ${emojis.label('status.success', 'User Unbanned')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `Successfully unbanned <@${targetId}>.`,
        `**User:** ${targetTag || 'Unknown user'} (\`${targetId}\`)`,
        `**Reason:** ${reason}`,
        '',
        `*Unbanned by <@${ownerId}>*`,
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

function getReadableError(error) {
  if (error.code === 50013) {
    return 'I could not unban this user because I am missing **Ban Members** permission.';
  }

  if (error.code === 10026) {
    return 'This user is not banned from this server.';
  }

  if (error.code === 10013) {
    return 'Discord could not find that user. Please check the user ID and try again.';
  }

  return `An error occurred while unbanning this user.\n\`${error.message}\``;
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

  const targetId = extractUserId(args[0]);

  if (!targetId) {
    await message.reply(cv2Payload(buildUsageContainer({ ownerId, prefix })));
    return;
  }

  const existingBan = await message.guild.bans.fetch(targetId).catch(() => null);

  if (!existingBan) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'This user is not banned from this server.',
      ownerId,
      title: 'Not Banned',
    })));
    return;
  }

  const reason = cleanReason(args.slice(1).join(' '));
  const auditReason = cleanReason(`Unbanned by ${message.author.tag} (${message.author.id}): ${reason}`);

  try {
    await message.guild.bans.remove(targetId, auditReason);

    await message.channel.send(cv2Payload(buildSuccessContainer({
      ownerId,
      reason,
      targetId,
      targetTag: getUserTag(existingBan.user),
    })));
  } catch (error) {
    console.error('Unban failed:', error);

    await message.channel.send(cv2Payload(buildErrorContainer({
      errorMessage: getReadableError(error),
      ownerId,
    })));
  }
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(UNBAN_DELETE_CUSTOM_ID_PREFIX.length);

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
  name: 'unban',
  aliases: ['pardon'],
  category: 'moderation',
  description: 'Unban a user from the server.',
  usage: 'LR!unban <user_id> [reason]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: UNBAN_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
