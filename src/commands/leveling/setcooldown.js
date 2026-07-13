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

  const seconds = parsePositiveInteger(args[0], { min: 0, max: 86400 });

  if (seconds === null) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: `Usage: \`${prefix}setcooldown <seconds>\`\nExample: \`${prefix}setcooldown 60\``,
      ownerId,
      title: 'Cooldown Usage',
    })));
    return;
  }

  const result = await updateLevelConfig(message.guild.id, {
    cooldown_seconds: seconds,
  });

  if (!result.ok) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: result.reason,
      ownerId,
      title: 'Cooldown Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildSuccessContainer({
    ownerId,
    title: 'Cooldown Updated',
    description: `XP cooldown is now **${result.config.cooldown_seconds} seconds**.`,
  })));
}

module.exports = {
  name: 'setcooldown',
  aliases: ['levelcooldown'],
  category: 'leveling',
  description: 'Set XP cooldown in seconds.',
  usage: 'LR!setcooldown <seconds>',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
