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

const ROLEICON_DELETE_CUSTOM_ID_PREFIX = 'roleicon:delete:';
const RESET_VALUES = new Set(['reset', 'remove', 'clear', 'none', 'null']);
const CUSTOM_EMOJI_REGEX = /^<a?:\w+:(\d{17,20})>$/;
const ANIMATED_CUSTOM_EMOJI_REGEX = /^<a:\w+:(\d{17,20})>$/;

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
      .setCustomId(`${ROLEICON_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
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

function hasRolePermission(member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.ManageRoles),
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
        'You need **Manage Roles** or **Administrator** permission to use this command.',
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
        'I need **Manage Roles** or **Administrator** permission to edit role icons.',
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
        `## ${emojis.label('status.warning', 'Role Icon Usage')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Usage:** \`${prefix}roleicon <role_id|@role> <icon|reset>\``,
        '',
        '**Examples:**',
        `> \`${prefix}roleicon 123456789012345678 https://example.com/icon.png\``,
        `> \`${prefix}roleicon @role <:emoji:123456789012345678>\``,
        `> \`${prefix}roleicon @role reset\``,
        '',
        '*You can also attach an image and run the command with only the role.*',
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildErrorContainer({ errorMessage, ownerId, title = 'Role Icon Failed' }) {
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
  iconLabel,
  ownerId,
  resetIcon,
  role,
}) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', resetIcon ? 'Role Icon Removed' : 'Role Icon Updated')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        resetIcon
          ? `Successfully removed icon from <@&${role.id}>.`
          : `Successfully updated icon for <@&${role.id}>.`,
        `**Role:** ${role.name} (\`${role.id}\`)`,
        `**Icon:** ${iconLabel}`,
        '',
        `*Updated by <@${ownerId}>*`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function extractRoleId(value) {
  const mentionMatch = value?.match(/^<@&(\d{17,20})>$/);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  return /^\d{17,20}$/.test(value || '') ? value : null;
}

function canManageRole(member, role) {
  if (member.id === member.guild.ownerId) {
    return true;
  }

  return member.roles.highest.position > role.position;
}

function getFirstAttachmentUrl(message) {
  const attachment = message.attachments?.first();
  return attachment?.url || null;
}

function getCustomEmojiSource(guild, rawIcon) {
  const match = rawIcon.match(CUSTOM_EMOJI_REGEX);

  if (!match) {
    return null;
  }

  const emojiId = match[1];

  if (guild.emojis.cache.has(emojiId)) {
    return {
      icon: emojiId,
      label: rawIcon,
      type: 'custom',
    };
  }

  const animated = ANIMATED_CUSTOM_EMOJI_REGEX.test(rawIcon);
  return {
    icon: `https://cdn.discordapp.com/emojis/${emojiId}.${animated ? 'gif' : 'png'}`,
    label: rawIcon,
    type: 'custom',
  };
}

function parseIconSource(message, args) {
  const rawIcon = args.slice(1).join(' ').trim();
  const attachmentUrl = getFirstAttachmentUrl(message);

  if (rawIcon && RESET_VALUES.has(rawIcon.toLowerCase())) {
    return {
      icon: null,
      label: 'Removed',
      resetIcon: true,
      type: 'reset',
    };
  }

  if (attachmentUrl && !rawIcon) {
    return {
      icon: attachmentUrl,
      label: 'Attached image',
      resetIcon: false,
      type: 'image',
    };
  }

  if (!rawIcon) {
    return null;
  }

  const customEmojiSource = getCustomEmojiSource(message.guild, rawIcon);

  if (customEmojiSource) {
    return {
      ...customEmojiSource,
      resetIcon: false,
    };
  }

  if (/^https?:\/\//i.test(rawIcon)) {
    return {
      icon: rawIcon,
      label: rawIcon,
      resetIcon: false,
      type: 'image',
    };
  }

  return {
    icon: rawIcon,
    label: rawIcon,
    resetIcon: false,
    type: 'unicode',
  };
}

function getReadableError(error) {
  if (error.code === 50013) {
    return 'I could not edit this role because my highest role is too low or I am missing **Manage Roles** permission.';
  }

  if (error.code === 50035) {
    return [
      'Discord rejected this role icon.',
      '',
      '*Use a valid image URL/attachment, custom emoji, or unicode emoji. Image icons must fit Discord role icon limits.*',
    ].join('\n');
  }

  if (error.code === 30031) {
    return 'This server does not have enough boosts/features for role icons.';
  }

  return `An error occurred while updating this role icon.\n\`${error.message}\``;
}

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;

  if (!hasRolePermission(message.member)) {
    await message.reply(cv2Payload(buildMissingUserPermContainer()));
    return;
  }

  const botMember = message.guild.members.me
    || await message.guild.members.fetchMe().catch(() => null);

  if (!hasRolePermission(botMember)) {
    await message.reply(cv2Payload(buildMissingBotPermContainer({ ownerId })));
    return;
  }

  const roleId = extractRoleId(args[0]);
  const role = roleId ? message.guild.roles.cache.get(roleId) : null;
  const iconSource = parseIconSource(message, args);

  if (!role || !iconSource) {
    await message.reply(cv2Payload(buildUsageContainer({ ownerId, prefix })));
    return;
  }

  if (role.id === message.guild.id) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'You cannot set an icon for the **@everyone** role.',
      ownerId,
    })));
    return;
  }

  if (role.managed) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'This role is managed by an integration/bot, so its icon cannot be edited.',
      ownerId,
    })));
    return;
  }

  if (!iconSource.resetIcon && !message.guild.features.includes('ROLE_ICONS')) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'This server does not currently have the **ROLE_ICONS** feature enabled.',
      ownerId,
      title: 'Role Icons Unavailable',
    })));
    return;
  }

  if (!canManageRole(message.member, role)) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'You cannot edit this role because it is equal to or higher than your highest role.',
      ownerId,
    })));
    return;
  }

  if (!canManageRole(botMember, role) || !role.editable) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'I cannot edit this role because it is equal to or higher than my highest role.',
      ownerId,
    })));
    return;
  }

  const auditReason = `Role icon updated by ${message.author.tag} (${message.author.id})`;

  try {
    if (iconSource.resetIcon) {
      await role.edit({
        icon: null,
        reason: auditReason,
        unicodeEmoji: null,
      });
    } else if (iconSource.type === 'unicode') {
      await role.edit({
        icon: null,
        reason: auditReason,
        unicodeEmoji: iconSource.icon,
      });
    } else {
      await role.edit({
        icon: iconSource.icon,
        reason: auditReason,
        unicodeEmoji: null,
      });
    }

    await message.channel.send(cv2Payload(buildSuccessContainer({
      iconLabel: iconSource.label,
      ownerId,
      resetIcon: iconSource.resetIcon,
      role,
    })));
  } catch (error) {
    console.error('Role icon failed:', error);

    await message.channel.send(cv2Payload(buildErrorContainer({
      errorMessage: getReadableError(error),
      ownerId,
    })));
  }
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(ROLEICON_DELETE_CUSTOM_ID_PREFIX.length);

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
  name: 'roleicon',
  aliases: ['setroleicon', 'ricon'],
  category: 'moderation',
  description: 'Set or remove a role icon using an image, custom emoji, or unicode emoji.',
  usage: 'LR!roleicon <role_id|@role> <icon|reset>',
  execute,
  componentHandlers: [
    {
      customIdPrefix: ROLEICON_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
