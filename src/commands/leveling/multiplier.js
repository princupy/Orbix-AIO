const { cv2Payload } = require('../../utils/cv2');
const {
  listMultipliers,
  removeMultiplier,
  setMultiplier,
} = require('../../supabase/leveling');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  buildErrorContainer,
  buildLevelingContainer,
  buildSuccessContainer,
  extractRoleId,
  formatDecimal,
  getLevelAdminCheck,
  handleDeleteButton,
  parsePositiveNumber,
  resolveRole,
} = require('../../utils/leveling');

function formatMultipliers(rows) {
  if (rows.length === 0) {
    return '`None`';
  }

  return rows
    .map((row, index) => `${index + 1}. <@&${row.role_id}> - **${formatDecimal(row.multiplier)}x**`)
    .join('\n');
}

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;
  const permissionError = getLevelAdminCheck(message);

  if (permissionError) {
    await message.reply(cv2Payload(permissionError));
    return;
  }

  const action = args[0]?.toLowerCase();

  if (!['set', 'remove', 'list'].includes(action)) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: `Usage: \`${prefix}multiplier <set|remove|list> [@role] [value]\``,
      ownerId,
      title: 'Multiplier Usage',
    })));
    return;
  }

  if (action === 'list') {
    const result = await listMultipliers(message.guild.id);

    if (!result.ok) {
      await message.reply(cv2Payload(buildErrorContainer({
        description: result.reason,
        ownerId,
        title: 'Multiplier Load Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildLevelingContainer({
      ownerId,
      title: 'Active XP Multipliers',
      description: formatMultipliers(result.multipliers),
    }), {
      allowedMentions: {
        parse: [],
        roles: [],
        repliedUser: false,
      },
    }));
    return;
  }

  const role = resolveRole(message, args[1]);
  const roleId = role?.id || extractRoleId(args[1]);

  if (!roleId) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: `Usage: \`${prefix}multiplier ${action} @role${action === 'set' ? ' <value>' : ''}\``,
      ownerId,
      title: 'Invalid Role',
    })));
    return;
  }

  if (action === 'remove') {
    const result = await removeMultiplier({
      guildId: message.guild.id,
      roleId,
    });

    if (!result.ok) {
      await message.reply(cv2Payload(buildErrorContainer({
        description: result.reason,
        ownerId,
        title: 'Multiplier Remove Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildSuccessContainer({
      ownerId,
      title: 'Multiplier Removed',
      description: `Removed XP multiplier from <@&${roleId}>.`,
    }), {
      allowedMentions: {
        parse: [],
        roles: [],
        repliedUser: false,
      },
    }));
    return;
  }

  const multiplier = parsePositiveNumber(args[2], { min: 0.01, max: 100 });

  if (!multiplier) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: `Usage: \`${prefix}multiplier set @role <value>\`\nExample: \`${prefix}multiplier set @Booster 2\``,
      ownerId,
      title: 'Invalid Multiplier',
    })));
    return;
  }

  const result = await setMultiplier({
    guildId: message.guild.id,
    multiplier,
    roleId,
  });

  if (!result.ok) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: result.reason,
      ownerId,
      title: 'Multiplier Set Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildSuccessContainer({
    ownerId,
    title: 'Multiplier Set',
    description: `<@&${roleId}> now earns **${formatDecimal(result.multiplier)}x XP**.`,
  }), {
    allowedMentions: {
      parse: [],
      roles: [],
      repliedUser: false,
    },
  }));
}

module.exports = {
  name: 'multiplier',
  aliases: ['xpmultiplier'],
  category: 'leveling',
  description: 'Set, remove, or list role XP multipliers.',
  usage: 'LR!multiplier <set|remove|list> [@role] [value]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
