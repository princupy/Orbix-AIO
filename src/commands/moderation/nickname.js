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

const NICKNAME_DELETE_CUSTOM_ID_PREFIX = 'nickname:delete:';
const MAX_NICKNAME_LENGTH = 32;
const DEFAULT_REASON = 'No reason provided.';
const DISCORD_REASON_LIMIT = 512;
const RESET_VALUES = new Set(['reset', 'remove', 'clear', 'none', 'null']);

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
      .setCustomId(`${NICKNAME_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
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

function hasNicknamePermission(member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.ManageNicknames),
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
        'You need **Manage Nicknames** or **Administrator** permission to use this command.',
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
        'I need **Manage Nicknames** or **Administrator** permission to change nicknames.',
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
        `## ${emojis.label('status.warning', 'Nickname Usage')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Usage:** \`${prefix}nickname @user <nickname>\``,
        '',
        '**Examples:**',
        `> \`${prefix}nickname @user Prince OP\``,
        `> \`${prefix}nickname 123456789012345678 Cool Member\``,
        `> \`${prefix}nickname @user reset\``,
        '',
        `*Nickname max length: **${MAX_NICKNAME_LENGTH}** characters.*`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildErrorContainer({ errorMessage, ownerId, title = 'Nickname Failed' }) {
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
  newNickname,
  oldNickname,
  ownerId,
  resetNickname,
  targetMember,
}) {
  const lines = [
    resetNickname
      ? `Successfully reset nickname for <@${targetMember.id}>.`
      : `Successfully changed nickname for <@${targetMember.id}>.`,
    `**Old Nickname:** ${oldNickname || targetMember.user.username}`,
    `**New Nickname:** ${newNickname || targetMember.user.username}`,
    '',
    `*Changed by <@${ownerId}>*`,
  ];

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', resetNickname ? 'Nickname Reset' : 'Nickname Changed')}`,
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

function canMemberManageTarget(actorMember, targetMember) {
  if (actorMember.id === actorMember.guild.ownerId) {
    return true;
  }

  if (actorMember.id === targetMember.id) {
    return true;
  }

  if (targetMember.id === actorMember.guild.ownerId) {
    return false;
  }

  return actorMember.roles.highest.position > targetMember.roles.highest.position;
}

function parseNickname(args) {
  const rawNickname = args.slice(1).join(' ').trim();

  if (!rawNickname) {
    return {
      nickname: undefined,
      resetNickname: false,
    };
  }

  if (RESET_VALUES.has(rawNickname.toLowerCase())) {
    return {
      nickname: null,
      resetNickname: true,
    };
  }

  return {
    nickname: rawNickname,
    resetNickname: false,
  };
}

function getReadableError(error) {
  if (error.code === 50013) {
    return 'I could not change this nickname because my role is too low or I am missing **Manage Nicknames** permission.';
  }

  if (error.code === 50035) {
    return 'Discord rejected this nickname. Please check the nickname length and content.';
  }

  return `An error occurred while changing this nickname.\n\`${error.message}\``;
}

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;

  if (!hasNicknamePermission(message.member)) {
    await message.reply(cv2Payload(buildMissingUserPermContainer()));
    return;
  }

  const botMember = message.guild.members.me
    || await message.guild.members.fetchMe().catch(() => null);

  if (!hasNicknamePermission(botMember)) {
    await message.reply(cv2Payload(buildMissingBotPermContainer({ ownerId })));
    return;
  }

  const targetMember = await resolveTargetMember(message, args[0]);
  const { nickname, resetNickname } = parseNickname(args);

  if (!targetMember || typeof nickname === 'undefined') {
    await message.reply(cv2Payload(buildUsageContainer({ ownerId, prefix })));
    return;
  }

  if (targetMember.id === message.guild.ownerId) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'You cannot change the server owner\'s nickname.',
      ownerId,
    })));
    return;
  }

  if (!resetNickname && nickname.length > MAX_NICKNAME_LENGTH) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: `Nickname cannot be longer than **${MAX_NICKNAME_LENGTH}** characters.`,
      ownerId,
      title: 'Invalid Nickname',
    })));
    return;
  }

  if (!canMemberManageTarget(message.member, targetMember)) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'You cannot change this member\'s nickname because their highest role is equal to or higher than yours, or they own the server.',
      ownerId,
    })));
    return;
  }

  if (!canMemberManageTarget(botMember, targetMember) || !targetMember.manageable) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'I cannot change this member\'s nickname because their highest role is equal to or higher than mine, or they own the server.',
      ownerId,
    })));
    return;
  }

  const oldNickname = targetMember.nickname;
  const auditReason = cleanReason(`Nickname changed by ${message.author.tag} (${message.author.id})`);

  try {
    await targetMember.setNickname(nickname, auditReason);

    await message.channel.send(cv2Payload(buildSuccessContainer({
      newNickname: nickname,
      oldNickname,
      ownerId,
      resetNickname,
      targetMember,
    })));
  } catch (error) {
    console.error('Nickname failed:', error);

    await message.channel.send(cv2Payload(buildErrorContainer({
      errorMessage: getReadableError(error),
      ownerId,
    })));
  }
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(NICKNAME_DELETE_CUSTOM_ID_PREFIX.length);

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
  name: 'nickname',
  aliases: ['nick', 'setnick', 'changenick'],
  category: 'moderation',
  description: 'Change or reset a member nickname with permission and role hierarchy checks.',
  usage: 'LR!nickname @user <nickname|reset>',
  execute,
  componentHandlers: [
    {
      customIdPrefix: NICKNAME_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
