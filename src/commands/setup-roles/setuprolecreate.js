const { cv2Payload } = require('../../utils/cv2');
const {
  getSetupRoleCommand,
  listSetupRoleCommands,
  removeSetupRoleCommand,
  setSetupRoleCommand,
} = require('../../supabase/setupRoles');
const {
  buildSetupRoleError,
  buildSetupRoleSuccess,
  buildSetupRoleWarning,
  canBotAssignRole,
  canConfigureSetupCommands,
  canMemberManageRole,
  normalizeSetupRoleName,
  resolveGuildRole,
} = require('../../utils/setupRoles');

const RESERVED_ACTIONS = new Set(['add', 'create', 'delete', 'list', 'remove']);

function formatRoleCommands(rows, prefix) {
  if (rows.length === 0) {
    return '`None`';
  }

  return rows
    .map((row, index) => (
      `${index + 1}. \`${prefix}${row.command_name} @user\` -> <@&${row.role_id}>`
    ))
    .join('\n');
}

function hasStaticCommandConflict(client, commandName) {
  return client.commands.has(commandName) || client.aliases.has(commandName);
}

async function execute({ args, client, message, prefix }) {
  const ownerId = message.author.id;

  if (!canConfigureSetupCommands(message.member, ownerId)) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: 'You need **Manage Server** and **Manage Roles**, or **Administrator**, to configure role commands.',
      ownerId,
      title: 'Missing Permission',
    })));
    return;
  }

  const action = args[0]?.toLowerCase();

  if (action === 'list') {
    const result = await listSetupRoleCommands(message.guild.id);

    if (!result.ok) {
      await message.reply(cv2Payload(buildSetupRoleError({
        description: result.reason,
        ownerId,
        title: 'Role Commands Load Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildSetupRoleWarning({
      description: [
        'Configured dynamic role commands:',
        '',
        formatRoleCommands(result.commands, prefix),
      ].join('\n'),
      ownerId,
      title: 'Setup Role Commands',
    }), {
      allowedMentions: {
        parse: [],
        roles: [],
        repliedUser: false,
      },
    }));
    return;
  }

  if (action === 'remove' || action === 'delete') {
    const commandName = normalizeSetupRoleName(args[1]);

    if (!commandName) {
      await message.reply(cv2Payload(buildSetupRoleError({
        description: `Usage: \`${prefix}setuprolecreate remove <name>\``,
        ownerId,
        title: 'Invalid Command Name',
      })));
      return;
    }

    const existing = await getSetupRoleCommand(message.guild.id, commandName);

    if (!existing.ok) {
      await message.reply(cv2Payload(buildSetupRoleError({
        description: existing.reason,
        ownerId,
        title: 'Database Error',
      })));
      return;
    }

    if (!existing.command) {
      await message.reply(cv2Payload(buildSetupRoleWarning({
        description: `No setup-role command named \`${commandName}\` exists.`,
        ownerId,
        title: 'Command Not Found',
      })));
      return;
    }

    const result = await removeSetupRoleCommand({
      commandName,
      guildId: message.guild.id,
    });

    if (!result.ok) {
      await message.reply(cv2Payload(buildSetupRoleError({
        description: result.reason,
        ownerId,
        title: 'Command Remove Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildSetupRoleSuccess({
      description: `Removed the dynamic command \`${prefix}${commandName}\`.`,
      ownerId,
      title: 'Role Command Removed',
    })));
    return;
  }

  const commandName = normalizeSetupRoleName(args[0]);
  const role = await resolveGuildRole(message.guild, args[1]);

  if (!commandName || !role) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: [
        `Create: \`${prefix}setuprolecreate <name> <@role|role_id>\``,
        `Remove: \`${prefix}setuprolecreate remove <name>\``,
        `List: \`${prefix}setuprolecreate list\``,
        '',
        'Names may contain lowercase letters, numbers, `_`, or `-` and must be 2-32 characters.',
      ].join('\n'),
      ownerId,
      title: 'Setup Role Create Usage',
    })));
    return;
  }

  if (RESERVED_ACTIONS.has(commandName) || hasStaticCommandConflict(client, commandName)) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: `\`${commandName}\` is reserved or already used by an existing bot command/alias.`,
      ownerId,
      title: 'Command Name Conflict',
    })));
    return;
  }

  if (role.id === message.guild.id || role.managed) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: 'The **@everyone** role and integration-managed roles cannot be used.',
      ownerId,
      title: 'Invalid Role',
    })));
    return;
  }

  if (!canMemberManageRole(message.member, role)) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: 'Your highest role must be above the role you are configuring.',
      ownerId,
      title: 'Role Hierarchy',
    })));
    return;
  }

  const botMember = message.guild.members.me
    || await message.guild.members.fetchMe().catch(() => null);

  if (!canBotAssignRole(botMember, role)) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: 'I need **Manage Roles** and my highest role must be above the configured role.',
      ownerId,
      title: 'Bot Permission Missing',
    })));
    return;
  }

  const existing = await getSetupRoleCommand(message.guild.id, commandName);

  if (!existing.ok) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: existing.reason,
      ownerId,
      title: 'Database Error',
    })));
    return;
  }

  const result = await setSetupRoleCommand({
    commandName,
    createdBy: ownerId,
    guildId: message.guild.id,
    roleId: role.id,
  });

  if (!result.ok) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: result.reason,
      ownerId,
      title: 'Role Command Save Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildSetupRoleSuccess({
    description: [
      `${existing.command ? 'Updated' : 'Created'} \`${prefix}${commandName} @user\`.`,
      `Running it assigns <@&${role.id}> to the mentioned user.`,
      '',
      `Only configured access roles from \`${prefix}setuprole list\` can use it.`,
    ].join('\n'),
    ownerId,
    title: existing.command ? 'Role Command Updated' : 'Role Command Created',
  }), {
    allowedMentions: {
      parse: [],
      roles: [],
      repliedUser: false,
    },
  }));
}

module.exports = {
  name: 'setuprolecreate',
  aliases: ['createrolecommand'],
  category: 'setup-roles',
  description: 'Create, update, remove, or list dynamic role assignment commands.',
  usage: 'LR!setuprolecreate <name> <@role|role_id>',
  execute,
};
