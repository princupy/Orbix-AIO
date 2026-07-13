const { cv2Payload } = require('../../utils/cv2');
const { getLevelConfig, setUserLevel } = require('../../supabase/leveling');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  applyLevelRoles,
  buildErrorContainer,
  buildSuccessContainer,
  formatNumber,
  getLevelAdminCheck,
  handleDeleteButton,
  parsePositiveInteger,
  resolveMember,
} = require('../../utils/leveling');

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;
  const permissionError = getLevelAdminCheck(message);

  if (permissionError) {
    await message.reply(cv2Payload(permissionError));
    return;
  }

  const targetMember = await resolveMember(message, args[0]);
  const level = parsePositiveInteger(args[1], { min: 0, max: 10000 });

  if (!targetMember || level === null) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: `Usage: \`${prefix}setlevel @user <level>\``,
      ownerId,
      title: 'Set Level Usage',
    })));
    return;
  }

  const result = await setUserLevel({
    guildId: message.guild.id,
    level,
    userId: targetMember.id,
  });

  if (!result.ok) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: result.reason,
      ownerId,
      title: 'Set Level Failed',
    })));
    return;
  }

  const config = await getLevelConfig(message.guild.id);
  const roleResult = await applyLevelRoles({
    guild: message.guild,
    member: targetMember,
    newLevel: result.after.level,
    oldLevel: config.config?.stack_roles ? result.before.level : 0,
    stackRoles: config.config?.stack_roles ?? true,
  });
  const roleText = roleResult.added.length > 0 || roleResult.removed.length > 0
    ? `\nRoles added: ${roleResult.added.map((roleId) => `<@&${roleId}>`).join(', ') || '`None`'}\nRoles removed: ${roleResult.removed.map((roleId) => `<@&${roleId}>`).join(', ') || '`None`'}`
    : '';

  await message.channel.send(cv2Payload(buildSuccessContainer({
    ownerId,
    title: 'Level Set',
    description: [
      `Set <@${targetMember.id}> to level **${result.after.level}**.`,
      `XP set to **${formatNumber(result.after.xp)}** by formula.${roleText}`,
    ].join('\n'),
  }), {
    allowedMentions: {
      parse: [],
      users: [targetMember.id],
      roles: [],
      repliedUser: false,
    },
  }));
}

module.exports = {
  name: 'setlevel',
  aliases: [],
  category: 'leveling',
  description: 'Set a user level and auto-set XP by formula.',
  usage: 'LR!setlevel @user <level>',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
