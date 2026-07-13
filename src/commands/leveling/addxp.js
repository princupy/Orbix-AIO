const { cv2Payload } = require('../../utils/cv2');
const { addXpToUser, getLevelConfig } = require('../../supabase/leveling');
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
  const amount = parsePositiveInteger(args[1], { min: 1, max: 10000000 });

  if (!targetMember || !amount) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: `Usage: \`${prefix}addxp @user <amount>\``,
      ownerId,
      title: 'Add XP Usage',
    })));
    return;
  }

  const result = await addXpToUser({
    amount,
    guildId: message.guild.id,
    userId: targetMember.id,
  });

  if (!result.ok) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: result.reason,
      ownerId,
      title: 'Add XP Failed',
    })));
    return;
  }

  let roleText = '';

  if (result.leveledUp) {
    const config = await getLevelConfig(message.guild.id);
    const roleResult = await applyLevelRoles({
      guild: message.guild,
      member: targetMember,
      newLevel: result.after.level,
      oldLevel: result.before.level,
      stackRoles: config.config?.stack_roles ?? true,
    });

    if (roleResult.added.length > 0) {
      roleText = `\nReward roles: ${roleResult.added.map((roleId) => `<@&${roleId}>`).join(', ')}`;
    }
  }

  await message.channel.send(cv2Payload(buildSuccessContainer({
    ownerId,
    title: 'XP Added',
    description: [
      `Added **${formatNumber(result.addedXp)} XP** to <@${targetMember.id}>.`,
      `Level: **${result.before.level}** -> **${result.after.level}**`,
      `Total XP: **${formatNumber(result.after.xp)}**${roleText}`,
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
  name: 'addxp',
  aliases: [],
  category: 'leveling',
  description: 'Manually add XP to a user.',
  usage: 'LR!addxp @user <amount>',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
