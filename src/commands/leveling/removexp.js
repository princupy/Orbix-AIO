const { cv2Payload } = require('../../utils/cv2');
const { removeXpFromUser } = require('../../supabase/leveling');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
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
      description: `Usage: \`${prefix}removexp @user <amount>\``,
      ownerId,
      title: 'Remove XP Usage',
    })));
    return;
  }

  const result = await removeXpFromUser({
    amount,
    guildId: message.guild.id,
    userId: targetMember.id,
  });

  if (!result.ok) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: result.reason,
      ownerId,
      title: 'Remove XP Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildSuccessContainer({
    ownerId,
    title: 'XP Removed',
    description: [
      `Removed **${formatNumber(result.removedXp)} XP** from <@${targetMember.id}>.`,
      `Level: **${result.before.level}** -> **${result.after.level}**`,
      `Total XP: **${formatNumber(result.after.xp)}**`,
    ].join('\n'),
  }), {
    allowedMentions: {
      parse: [],
      users: [targetMember.id],
      repliedUser: false,
    },
  }));
}

module.exports = {
  name: 'removexp',
  aliases: ['remxp', 'takexp'],
  category: 'leveling',
  description: 'Remove XP from a user without going below zero.',
  usage: 'LR!removexp @user <amount>',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
