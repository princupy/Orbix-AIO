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
const { isBotOwner } = require('../config');
const emojis = require('../emojis');
const {
  getSetupAccessRoleIds,
  getSetupRoleCommand,
} = require('../supabase/setupRoles');
const { cv2Payload } = require('./cv2');

const SETUP_ROLES_DELETE_CUSTOM_ID_PREFIX = 'setup-roles:delete:';
const SETUP_ROLE_NAME_PATTERN = /^[a-z0-9_-]{2,32}$/;

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
      .setCustomId(`${SETUP_ROLES_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
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

function buildSetupRoleContainer({
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

function buildSetupRoleError({
  description,
  ownerId,
  title = 'Setup Role Error',
}) {
  return buildSetupRoleContainer({
    description,
    ownerId,
    title: emojis.label('status.error', title),
  });
}

function buildSetupRoleSuccess({
  description,
  ownerId,
  title = 'Setup Role Updated',
}) {
  return buildSetupRoleContainer({
    description,
    ownerId,
    title: emojis.label('status.success', title),
  });
}

function buildSetupRoleWarning({
  description,
  ownerId,
  title = 'Setup Role Notice',
}) {
  return buildSetupRoleContainer({
    description,
    ownerId,
    title: emojis.label('status.warning', title),
  });
}

function normalizeSetupRoleName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return SETUP_ROLE_NAME_PATTERN.test(normalized) ? normalized : null;
}

function extractRoleId(value) {
  const mentionMatch = String(value || '').match(/^<@&(\d{17,20})>$/);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  return /^\d{17,20}$/.test(String(value || '')) ? String(value) : null;
}

function extractUserId(value) {
  const mentionMatch = String(value || '').match(/^<@!?(\d{17,20})>$/);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  return /^\d{17,20}$/.test(String(value || '')) ? String(value) : null;
}

function isAdministrator(member) {
  return Boolean(member?.permissions?.has(PermissionsBitField.Flags.Administrator));
}

function canConfigureSetupAccess(member, userId = member?.id) {
  return Boolean(
    isBotOwner(userId)
    || isAdministrator(member)
    || member?.permissions?.has(PermissionsBitField.Flags.ManageGuild),
  );
}

function canConfigureSetupCommands(member, userId = member?.id) {
  return Boolean(
    isBotOwner(userId)
    || isAdministrator(member)
    || (
      member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)
      && member?.permissions?.has(PermissionsBitField.Flags.ManageRoles)
    ),
  );
}

function memberHasSetupRoleAccess(member, roleIds, userId = member?.id) {
  if (isBotOwner(userId) || isAdministrator(member)) {
    return true;
  }

  return [...roleIds].some((roleId) => member?.roles?.cache?.has(String(roleId)));
}

function canMemberManageRole(member, role) {
  if (!member || !role) {
    return false;
  }

  if (member.id === member.guild.ownerId || isAdministrator(member)) {
    return true;
  }

  return member.roles.highest.position > role.position;
}

function canBotAssignRole(botMember, role) {
  return Boolean(
    botMember
    && (
      isAdministrator(botMember)
      || botMember.permissions?.has(PermissionsBitField.Flags.ManageRoles)
    )
    && role?.editable
  );
}

async function resolveGuildRole(guild, value) {
  const roleId = extractRoleId(value);

  if (!roleId) {
    return null;
  }

  return guild.roles.cache.get(roleId)
    || await guild.roles.fetch(roleId).catch(() => null);
}

async function resolveTargetMember(message, value) {
  const mentionedMember = message.mentions.members.first();

  if (mentionedMember) {
    return mentionedMember;
  }

  const userId = extractUserId(value);

  if (!userId) {
    return null;
  }

  return message.guild.members.fetch(userId).catch(() => null);
}

function parseSetupRoleInvocation(input) {
  const parts = String(input || '').trim().split(/\s+/).filter(Boolean);
  const commandName = normalizeSetupRoleName(parts[0]);

  if (!commandName) {
    return null;
  }

  return {
    args: parts.slice(1),
    commandName,
  };
}

function getRoleAssignmentError(error) {
  if (error?.code === 50013) {
    return 'I could not assign this role because my role is too low or I am missing **Manage Roles** permission.';
  }

  if (error?.code === 10011) {
    return 'The configured role no longer exists.';
  }

  if (error?.code === 10007) {
    return 'The target user is no longer in this server.';
  }

  return `Role assignment failed.\n\`${error?.message || 'Unknown error'}\``;
}

async function executeMappedSetupRole({
  args,
  mapping,
  message,
  prefix,
}) {
  const ownerId = message.author.id;
  const accessResult = await getSetupAccessRoleIds(message.guild.id);

  if (!accessResult.ok) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: `Could not load setup-role access.\n\`${accessResult.reason}\``,
      ownerId,
      title: 'Database Error',
    })));
    return;
  }

  if (!memberHasSetupRoleAccess(message.member, accessResult.roleIds, ownerId)) {
    const noAccessRolesConfigured = accessResult.roleIds.size === 0;

    await message.reply(cv2Payload(buildSetupRoleError({
      description: noAccessRolesConfigured
        ? `No staff access role is configured. An administrator must run \`${prefix}setuprole @role\` first.`
        : [
          'You do not have a configured setup-role access role.',
          '',
          `Allowed roles: ${[...accessResult.roleIds].map((roleId) => `<@&${roleId}>`).join(', ')}`,
        ].join('\n'),
      ownerId,
      title: noAccessRolesConfigured ? 'Access Role Missing' : 'Missing Access Role',
    }), {
      allowedMentions: {
        parse: [],
        roles: [],
        repliedUser: false,
      },
    }));
    return;
  }

  const targetMember = await resolveTargetMember(message, args[0]);

  if (!targetMember) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: `Usage: \`${prefix}${mapping.command_name} @user\``,
      ownerId,
      title: 'Invalid User',
    })));
    return;
  }

  const role = message.guild.roles.cache.get(String(mapping.role_id))
    || await message.guild.roles.fetch(String(mapping.role_id)).catch(() => null);

  if (!role || role.id === message.guild.id || role.managed) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: [
        `The role configured for \`${mapping.command_name}\` is missing or cannot be assigned.`,
        '',
        'Ask an administrator to update this mapping with `setuprolecreate`.',
      ].join('\n'),
      ownerId,
      title: 'Configured Role Invalid',
    })));
    return;
  }

  if (!canMemberManageRole(message.member, role)) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: 'Your highest role must be above the configured role before you can assign it.',
      ownerId,
      title: 'Role Hierarchy',
    })));
    return;
  }

  const botMember = message.guild.members.me
    || await message.guild.members.fetchMe().catch(() => null);

  if (!canBotAssignRole(botMember, role)) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: 'I need **Manage Roles** permission and my highest role must be above the configured role.',
      ownerId,
      title: 'Bot Permission Missing',
    })));
    return;
  }

  if (targetMember.roles.cache.has(role.id)) {
    await message.reply(cv2Payload(buildSetupRoleWarning({
      description: `<@${targetMember.id}> already has <@&${role.id}>.`,
      ownerId,
      title: 'Role Already Assigned',
    }), {
      allowedMentions: {
        parse: [],
        roles: [],
        users: [targetMember.id],
        repliedUser: false,
      },
    }));
    return;
  }

  try {
    await targetMember.roles.add(
      role,
      `${mapping.command_name} setup-role command used by ${message.author.tag} (${ownerId})`,
    );

    await message.channel.send(cv2Payload(buildSetupRoleSuccess({
      description: [
        `Assigned <@&${role.id}> to <@${targetMember.id}>.`,
        `**Command:** \`${prefix}${mapping.command_name}\``,
        `**Used By:** <@${ownerId}>`,
      ].join('\n'),
      ownerId,
      title: 'Role Assigned',
    }), {
      allowedMentions: {
        parse: [],
        roles: [],
        users: [targetMember.id, ownerId],
        repliedUser: false,
      },
    }));
  } catch (error) {
    await message.channel.send(cv2Payload(buildSetupRoleError({
      description: getRoleAssignmentError(error),
      ownerId,
      title: 'Role Assignment Failed',
    })));
  }
}

function createMappedSetupRoleCommand(mapping) {
  return {
    name: mapping.command_name,
    aliases: [],
    category: 'setup-roles',
    description: `Assigns the configured ${mapping.command_name} role.`,
    usage: `LR!${mapping.command_name} @user`,
    async execute(context) {
      await executeMappedSetupRole({
        ...context,
        mapping,
      });
    },
  };
}

async function resolveSetupRoleCommand({ input, message }) {
  const parsed = parseSetupRoleInvocation(input);

  if (!parsed) {
    return null;
  }

  const result = await getSetupRoleCommand(message.guild.id, parsed.commandName);

  if (!result.ok) {
    console.warn(`[setup-roles] Failed to resolve ${parsed.commandName} in ${message.guild.id}: ${result.reason}`);
    return null;
  }

  if (!result.command) {
    return null;
  }

  return {
    args: parsed.args,
    command: createMappedSetupRoleCommand(result.command),
    resolvedName: parsed.commandName,
  };
}

async function handleSetupRolesDelete({ interaction }) {
  const ownerId = interaction.customId.slice(SETUP_ROLES_DELETE_CUSTOM_ID_PREFIX.length);

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
  SETUP_ROLES_DELETE_CUSTOM_ID_PREFIX,
  buildSetupRoleContainer,
  buildSetupRoleError,
  buildSetupRoleSuccess,
  buildSetupRoleWarning,
  canBotAssignRole,
  canConfigureSetupAccess,
  canConfigureSetupCommands,
  canMemberManageRole,
  extractRoleId,
  handleSetupRolesDelete,
  memberHasSetupRoleAccess,
  normalizeSetupRoleName,
  parseSetupRoleInvocation,
  resolveGuildRole,
  resolveSetupRoleCommand,
};
