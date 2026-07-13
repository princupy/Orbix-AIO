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

const UNMUTE_DELETE_CUSTOM_ID_PREFIX = 'unmute:delete:';
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
      .setCustomId(`${UNMUTE_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
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

function hasModerationPermission(member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.ModerateMembers),
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
        'You need **Moderate Members / Timeout Members** or **Administrator** permission to use this command.',
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
        'I need **Moderate Members / Timeout Members** or **Administrator** permission to unmute members.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildUsageContainer({ prefix, ownerId }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', 'Unmute Usage')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Usage:** \`${prefix}unmute @user [reason]\``,
        '',
        '**Examples:**',
        `> \`${prefix}unmute @user appeal accepted\``,
        `> \`${prefix}unmute 123456789012345678 manual review\``,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildErrorContainer({ errorMessage, ownerId, title = 'Unmute Failed' }) {
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
  targetMember,
  wasMutedUntil,
}) {
  const lines = [
    `Successfully unmuted <@${targetMember.id}>.`,
    `**Reason:** ${reason}`,
    '',
    `*Unmuted by <@${ownerId}>*`,
  ];

  if (wasMutedUntil) {
    lines.splice(1, 0, `**Previous mute until:** <t:${Math.floor(wasMutedUntil / 1000)}:F>`);
  }

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', 'User Unmuted')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join('\n')),
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

function isTimedOut(member) {
  return Boolean(
    member.communicationDisabledUntilTimestamp
    && member.communicationDisabledUntilTimestamp > Date.now(),
  );
}

function getReadableError(error) {
  if (error.code === 50013) {
    return 'I could not unmute this member because my role is too low or I am missing **Moderate Members** permission.';
  }

  if (error.code === 50035) {
    return 'Discord rejected the unmute request. Please try again.';
  }

  return `An error occurred while unmuting this member.\n\`${error.message}\``;
}

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;

  if (!hasModerationPermission(message.member)) {
    await message.reply(cv2Payload(buildMissingUserPermContainer()));
    return;
  }

  const botMember = message.guild.members.me
    || await message.guild.members.fetchMe().catch(() => null);

  if (!hasModerationPermission(botMember)) {
    await message.reply(cv2Payload(buildMissingBotPermContainer({ ownerId })));
    return;
  }

  const targetMember = await resolveTargetMember(message, args[0]);

  if (!targetMember) {
    await message.reply(cv2Payload(buildUsageContainer({ prefix, ownerId })));
    return;
  }

  if (targetMember.id === message.author.id) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'You cannot unmute yourself.',
      ownerId,
    })));
    return;
  }

  if (targetMember.id === message.client.user.id) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'I am not muted.',
      ownerId,
    })));
    return;
  }

  if (!canMemberModerateTarget(message.member, targetMember)) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'You cannot unmute this member because their highest role is equal to or higher than yours, or they own the server.',
      ownerId,
    })));
    return;
  }

  if (!canMemberModerateTarget(botMember, targetMember) || !targetMember.moderatable) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'I cannot unmute this member because their highest role is equal to or higher than mine, or they own the server.',
      ownerId,
    })));
    return;
  }

  if (!isTimedOut(targetMember)) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'This member is not muted right now.',
      ownerId,
      title: 'Already Unmuted',
    })));
    return;
  }

  const reason = cleanReason(args.slice(1).join(' '));
  const auditReason = cleanReason(`Unmuted by ${message.author.tag} (${message.author.id}): ${reason}`);
  const wasMutedUntil = targetMember.communicationDisabledUntilTimestamp;

  try {
    await targetMember.timeout(null, auditReason);

    await message.channel.send(cv2Payload(buildSuccessContainer({
      ownerId,
      reason,
      targetMember,
      wasMutedUntil,
    })));
  } catch (error) {
    console.error('Unmute failed:', error);

    await message.channel.send(cv2Payload(buildErrorContainer({
      errorMessage: getReadableError(error),
      ownerId,
    })));
  }
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(UNMUTE_DELETE_CUSTOM_ID_PREFIX.length);

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
  name: 'unmute',
  aliases: ['untimeout', 'rmute'],
  category: 'moderation',
  description: 'Remove Discord timeout from a muted member with permission and role hierarchy checks.',
  usage: 'LR!unmute @user [reason]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: UNMUTE_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
