const { cv2Payload } = require('../../utils/cv2');
const {
  addSetupAccessRole,
  listSetupAccessRoles,
  removeSetupAccessRole,
} = require('../../supabase/setupRoles');
const {
  SETUP_ROLES_DELETE_CUSTOM_ID_PREFIX,
  buildSetupRoleError,
  buildSetupRoleSuccess,
  buildSetupRoleWarning,
  canConfigureSetupAccess,
  extractRoleId,
  handleSetupRolesDelete,
  resolveGuildRole,
} = require('../../utils/setupRoles');

function formatAccessRoles(rows) {
  if (rows.length === 0) {
    return '`None`';
  }

  return rows
    .map((row, index) => `${index + 1}. <@&${row.role_id}> (\`${row.role_id}\`)`)
    .join('\n');
}

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;

  if (!canConfigureSetupAccess(message.member, ownerId)) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: 'You need **Manage Server** or **Administrator** permission to configure setup-role access.',
      ownerId,
      title: 'Missing Permission',
    })));
    return;
  }

  const action = args[0]?.toLowerCase();

  if (action === 'list') {
    const result = await listSetupAccessRoles(message.guild.id);

    if (!result.ok) {
      await message.reply(cv2Payload(buildSetupRoleError({
        description: result.reason,
        ownerId,
        title: 'Access Roles Load Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildSetupRoleWarning({
      description: [
        'Members with any of these roles can use configured setup-role commands:',
        '',
        formatAccessRoles(result.roles),
      ].join('\n'),
      ownerId,
      title: 'Setup Role Access',
    }), {
      allowedMentions: {
        parse: [],
        roles: [],
        repliedUser: false,
      },
    }));
    return;
  }

  const removing = action === 'remove' || action === 'delete';
  const roleArg = removing || action === 'add' ? args[1] : args[0];
  const roleId = extractRoleId(roleArg);
  const role = roleId ? await resolveGuildRole(message.guild, roleArg) : null;

  if (!roleId || (!removing && (!role || role.id === message.guild.id))) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: [
        `Usage: \`${prefix}setuprole @role\``,
        `Remove: \`${prefix}setuprole remove @role\``,
        `List: \`${prefix}setuprole list\``,
      ].join('\n'),
      ownerId,
      title: 'Setup Role Usage',
    })));
    return;
  }

  const result = removing
    ? await removeSetupAccessRole({
      guildId: message.guild.id,
      roleId,
    })
    : await addSetupAccessRole({
      addedBy: ownerId,
      guildId: message.guild.id,
      roleId,
    });

  if (!result.ok) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: result.reason,
      ownerId,
      title: removing ? 'Access Role Remove Failed' : 'Access Role Add Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildSetupRoleSuccess({
    description: removing
      ? `Removed <@&${roleId}> from setup-role command access.`
      : `Members with <@&${roleId}> can now use configured setup-role commands.`,
    ownerId,
    title: removing ? 'Access Role Removed' : 'Access Role Added',
  }), {
    allowedMentions: {
      parse: [],
      roles: [],
      repliedUser: false,
    },
  }));
}

module.exports = {
  name: 'setuprole',
  aliases: ['setupaccessrole'],
  category: 'setup-roles',
  description: 'Configure staff roles allowed to use dynamic role commands.',
  usage: 'LR!setuprole <@role|role_id> | remove <@role|role_id> | list',
  execute,
  componentHandlers: [
    {
      customIdPrefix: SETUP_ROLES_DELETE_CUSTOM_ID_PREFIX,
      execute: handleSetupRolesDelete,
    },
  ],
};
