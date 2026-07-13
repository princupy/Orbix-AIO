const { cv2Payload } = require('../../utils/cv2');
const { updateLevelConfig } = require('../../supabase/leveling');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  buildErrorContainer,
  buildSuccessContainer,
  getLevelAdminCheck,
  handleDeleteButton,
  parsePositiveInteger,
} = require('../../utils/leveling');

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;
  const permissionError = getLevelAdminCheck(message);

  if (permissionError) {
    await message.reply(cv2Payload(permissionError));
    return;
  }

  const min = parsePositiveInteger(args[0], { min: 1, max: 100000 });
  const max = parsePositiveInteger(args[1], { min: 1, max: 100000 });

  if (!min || !max || min > max) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: `Usage: \`${prefix}setxprate <min> <max>\`\nExample: \`${prefix}setxprate 15 25\``,
      ownerId,
      title: 'XP Rate Usage',
    })));
    return;
  }

  const result = await updateLevelConfig(message.guild.id, {
    xp_max: max,
    xp_min: min,
  });

  if (!result.ok) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: result.reason,
      ownerId,
      title: 'XP Rate Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildSuccessContainer({
    ownerId,
    title: 'XP Rate Updated',
    description: `Users now earn **${result.config.xp_min}-${result.config.xp_max} XP** per eligible message.`,
  })));
}

module.exports = {
  name: 'setxprate',
  aliases: ['xprate'],
  category: 'leveling',
  description: 'Set per-message XP minimum and maximum.',
  usage: 'LR!setxprate <min> <max>',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
