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

const ROLE_DELETE_CUSTOM_ID_PREFIX = 'role:delete:';
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
      .setCustomId(`${ROLE_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
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
        'I need **Manage Roles** or **Administrator** permission to manage roles.',
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
        `## ${emojis.label('status.warning', 'Role Usage')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Usage:** \`${prefix}role @user <role_id|@role> [reason]\``,
        '',
        '**Examples:**',
        `> \`${prefix}role @user 123456789012345678 verified\``,
        `> \`${prefix}role 123456789012345678 @Member event winner\``,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildErrorContainer({ errorMessage, ownerId, title = 'Role Failed' }) {
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
  action,
  ownerId,
  reason,
  role,
  targetMember,
}) {
  const added = action === 'add';

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', added ? 'Role Added' : 'Role Removed')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        added
          ? `Successfully added <@&${role.id}> to <@${targetMember.id}>.`
          : `Successfully removed <@&${role.id}> from <@${targetMember.id}>.`,
        `**Role:** ${role.name} (\`${role.id}\`)`,
        `**Reason:** ${reason}`,
        '',
        `*${added ? 'Added' : 'Removed'} by <@${ownerId}>*`,
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

function extractRoleId(value) {
  const mentionMatch = value?.match(/^<@&(\d{17,20})>$/);

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

function resolveRole(message, roleArg) {
  const roleId = extractRoleId(roleArg);

  if (!roleId) {
    return null;
  }

  return message.guild.roles.cache.get(roleId) || null;
}

function canManageRole(member, role) {
  if (member.id === member.guild.ownerId) {
    return true;
  }

  return member.roles.highest.position > role.position;
}

function getReadableError(error) {
  if (error.code === 50013) {
    return 'I could not manage this role because my highest role is too low or I am missing **Manage Roles** permission.';
  }

  if (error.code === 10011) {
    return 'Discord could not find that role. Please check the role ID and try again.';
  }

  if (error.code === 10007) {
    return 'This member is no longer in the server.';
  }

  return `An error occurred while managing this role.\n\`${error.message}\``;
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

  const targetMember = await resolveTargetMember(message, args[0]);
  const role = resolveRole(message, args[1]);

  if (!targetMember || !role) {
    await message.reply(cv2Payload(buildUsageContainer({ ownerId, prefix })));
    return;
  }

  if (role.id === message.guild.id) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'You cannot manage the **@everyone** role.',
      ownerId,
    })));
    return;
  }

  if (role.managed) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'This role is managed by an integration/bot and cannot be managed manually.',
      ownerId,
    })));
    return;
  }

  if (!canManageRole(message.member, role)) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'You cannot manage this role because it is equal to or higher than your highest role.',
      ownerId,
    })));
    return;
  }

  if (!canManageRole(botMember, role) || !role.editable) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'I cannot manage this role because it is equal to or higher than my highest role.',
      ownerId,
    })));
    return;
  }

  const reason = cleanReason(args.slice(2).join(' '));
  const hasRole = targetMember.roles.cache.has(role.id);
  const action = hasRole ? 'remove' : 'add';
  const auditReason = cleanReason(`Role ${action === 'add' ? 'added' : 'removed'} by ${message.author.tag} (${message.author.id}): ${reason}`);

  try {
    if (action === 'add') {
      await targetMember.roles.add(role, auditReason);
    } else {
      await targetMember.roles.remove(role, auditReason);
    }

    await message.channel.send(cv2Payload(buildSuccessContainer({
      action,
      ownerId,
      reason,
      role,
      targetMember,
    })));
  } catch (error) {
    console.error('Role toggle failed:', error);

    await message.channel.send(cv2Payload(buildErrorContainer({
      errorMessage: getReadableError(error),
      ownerId,
    })));
  }
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(ROLE_DELETE_CUSTOM_ID_PREFIX.length);

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
  name: 'role',
  aliases: ['addrole', 'giverole'],
  category: 'moderation',
  description: 'Add or remove a role from a member with permission and role hierarchy checks.',
  usage: 'LR!role @user <role_id|@role> [reason]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: ROLE_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
