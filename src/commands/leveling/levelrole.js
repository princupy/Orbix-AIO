const { PermissionsBitField } = require('discord.js');
const { cv2Payload } = require('../../utils/cv2');
const {
  listLevelRoles,
  removeLevelRole,
  setLevelRole,
  updateLevelConfig,
} = require('../../supabase/leveling');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  buildErrorContainer,
  buildLevelingContainer,
  buildSuccessContainer,
  extractRoleId,
  getLevelAdminCheck,
  handleDeleteButton,
  parsePositiveInteger,
  resolveRole,
} = require('../../utils/leveling');

function formatRewards(rows) {
  if (rows.length === 0) {
    return '`None`';
  }

  return rows
    .map((row) => `Level **${row.level}** -> <@&${row.role_id}> (\`${row.role_id}\`)`)
    .join('\n');
}

function canBotManageRewardRole(botMember, role) {
  return Boolean(
    botMember?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || botMember?.permissions?.has(PermissionsBitField.Flags.ManageRoles),
  ) && role.editable;
}

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;
  const permissionError = getLevelAdminCheck(message);

  if (permissionError) {
    await message.reply(cv2Payload(permissionError));
    return;
  }

  const action = args[0]?.toLowerCase();

  if (!['add', 'remove', 'list', 'mode'].includes(action)) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: [
        `Usage: \`${prefix}levelrole add <level> @role\``,
        `Usage: \`${prefix}levelrole remove <level>\``,
        `Usage: \`${prefix}levelrole list\``,
        `Usage: \`${prefix}levelrole mode <stack|replace>\``,
      ].join('\n'),
      ownerId,
      title: 'Level Role Usage',
    })));
    return;
  }

  if (action === 'list') {
    const result = await listLevelRoles(message.guild.id);

    if (!result.ok) {
      await message.reply(cv2Payload(buildErrorContainer({
        description: result.reason,
        ownerId,
        title: 'Level Roles Load Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildLevelingContainer({
      ownerId,
      title: 'Level Role Rewards',
      description: formatRewards(result.roles),
    }), {
      allowedMentions: {
        parse: [],
        roles: [],
        repliedUser: false,
      },
    }));
    return;
  }

  if (action === 'mode') {
    const mode = args[1]?.toLowerCase();

    if (!['stack', 'replace'].includes(mode)) {
      await message.reply(cv2Payload(buildErrorContainer({
        description: `Usage: \`${prefix}levelrole mode <stack|replace>\``,
        ownerId,
        title: 'Invalid Mode',
      })));
      return;
    }

    const result = await updateLevelConfig(message.guild.id, {
      stack_roles: mode === 'stack',
    });

    if (!result.ok) {
      await message.reply(cv2Payload(buildErrorContainer({
        description: result.reason,
        ownerId,
        title: 'Mode Update Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildSuccessContainer({
      ownerId,
      title: 'Level Role Mode Updated',
      description: `Reward role mode is now **${mode}**.`,
    })));
    return;
  }

  const level = parsePositiveInteger(args[1], { min: 1, max: 10000 });

  if (!level) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: `Usage: \`${prefix}levelrole ${action} <level>${action === 'add' ? ' @role' : ''}\``,
      ownerId,
      title: 'Invalid Level',
    })));
    return;
  }

  if (action === 'remove') {
    const result = await removeLevelRole({
      guildId: message.guild.id,
      level,
    });

    if (!result.ok) {
      await message.reply(cv2Payload(buildErrorContainer({
        description: result.reason,
        ownerId,
        title: 'Level Role Remove Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildSuccessContainer({
      ownerId,
      title: 'Level Role Removed',
      description: `Removed reward role for level **${level}**.`,
    })));
    return;
  }

  const role = resolveRole(message, args[2]);
  const roleId = role?.id || extractRoleId(args[2]);

  if (!role || !roleId) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: `Usage: \`${prefix}levelrole add <level> @role\``,
      ownerId,
      title: 'Invalid Role',
    })));
    return;
  }

  if (role.id === message.guild.id || role.managed) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: 'That role cannot be used as a level reward.',
      ownerId,
      title: 'Invalid Role',
    })));
    return;
  }

  const botMember = message.guild.members.me
    || await message.guild.members.fetchMe().catch(() => null);

  if (!canBotManageRewardRole(botMember, role)) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: 'I need **Manage Roles** and my highest role must be above that reward role.',
      ownerId,
      title: 'Bot Permission Missing',
    })));
    return;
  }

  const result = await setLevelRole({
    guildId: message.guild.id,
    level,
    roleId,
  });

  if (!result.ok) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: result.reason,
      ownerId,
      title: 'Level Role Add Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildSuccessContainer({
    ownerId,
    title: 'Level Role Added',
    description: `Users will receive <@&${roleId}> at level **${level}**.`,
  }), {
    allowedMentions: {
      parse: [],
      roles: [],
      repliedUser: false,
    },
  }));
}

module.exports = {
  name: 'levelrole',
  aliases: ['levelroles', 'rewardrole'],
  category: 'leveling',
  description: 'Manage level role rewards and stack/replace mode.',
  usage: 'LR!levelrole <add|remove|list|mode> ...',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
