const { cv2Payload } = require('../../utils/cv2');
const { listSetupRoleCommands } = require('../../supabase/setupRoles');
const {
  SETUP_ROLES_DELETE_CUSTOM_ID_PREFIX,
  buildSetupRoleError,
  buildSetupRoleWarning,
  canConfigureSetupCommands,
  handleSetupRolesDelete,
} = require('../../utils/setupRoles');

function formatRoleCommands(rows, guild, prefix) {
  if (rows.length === 0) {
    return '`None`';
  }

  return rows
    .map((row, index) => {
      const roleId = String(row.role_id);
      const roleExists = guild.roles.cache.has(roleId);
      const roleLabel = roleExists ? `<@&${roleId}>` : '`Deleted role`';
      const createdBy = row.created_by ? ` - by <@${row.created_by}>` : '';

      return `**${index + 1}.** \`${prefix}${row.command_name} @user\` -> ${roleLabel} (\`${roleId}\`)${createdBy}`;
    })
    .join('\n');
}

async function execute({ message, prefix }) {
  const ownerId = message.author.id;

  if (!canConfigureSetupCommands(message.member, ownerId)) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: 'You need **Manage Server** and **Manage Roles**, or **Administrator**, to view configured role commands.',
      ownerId,
      title: 'Missing Permission',
    })));
    return;
  }

  const result = await listSetupRoleCommands(message.guild.id);

  if (!result.ok) {
    await message.reply(cv2Payload(buildSetupRoleError({
      description: `Could not load setup-role commands.\n\`${result.reason}\``,
      ownerId,
      title: 'Role Commands Load Failed',
    })));
    return;
  }

  const commandCount = result.commands.length;
  const hasDeletedRole = result.commands.some((row) => (
    !message.guild.roles.cache.has(String(row.role_id))
  ));

  const description = [
    'These are the role-assignment commands created with `setuprolecreate`:',
    '',
    formatRoleCommands(result.commands, message.guild, prefix),
    '',
    `**Total:** ${commandCount} command${commandCount === 1 ? '' : 's'}`,
  ];

  if (hasDeletedRole) {
    description.push('Commands marked `Deleted role` point to a role that no longer exists.');
  }

  description.push(
    '',
    `Create: \`${prefix}setuprolecreate <name> @role\``,
    `Remove: \`${prefix}setuprolecreate remove <name>\``,
  );

  await message.channel.send(cv2Payload(buildSetupRoleWarning({
    description: description.join('\n'),
    ownerId,
    title: 'Setup Role Commands',
  }), {
    allowedMentions: {
      parse: [],
      roles: [],
      repliedUser: false,
    },
  }));
}

module.exports = {
  name: 'setuproleshow',
  aliases: ['setuprole show', 'setuprolelist', 'setuprole roles', 'setuprolecreate show'],
  category: 'setup-roles',
  description: 'Shows the role-assignment commands created with setuprolecreate.',
  usage: 'LR!setuproleshow',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: SETUP_ROLES_DELETE_CUSTOM_ID_PREFIX,
      execute: handleSetupRolesDelete,
    },
  ],
};
