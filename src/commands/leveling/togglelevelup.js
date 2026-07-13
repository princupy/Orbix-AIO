const { cv2Payload } = require('../../utils/cv2');
const { getLevelConfig, updateLevelConfig } = require('../../supabase/leveling');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  buildErrorContainer,
  buildSuccessContainer,
  getLevelAdminCheck,
  handleDeleteButton,
} = require('../../utils/leveling');

async function execute({ message }) {
  const ownerId = message.author.id;
  const permissionError = getLevelAdminCheck(message);

  if (permissionError) {
    await message.reply(cv2Payload(permissionError));
    return;
  }

  const current = await getLevelConfig(message.guild.id);
  const result = await updateLevelConfig(message.guild.id, {
    levelup_enabled: !current.config.levelup_enabled,
  });

  if (!result.ok) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: result.reason,
      ownerId,
      title: 'Level-up Toggle Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildSuccessContainer({
    ownerId,
    title: 'Level-up Messages Toggled',
    description: `Level-up messages are now **${result.config.levelup_enabled ? 'enabled' : 'disabled'}**.`,
  })));
}

module.exports = {
  name: 'togglelevelup',
  aliases: ['leveluptoggle'],
  category: 'leveling',
  description: 'Toggle level-up announcement messages.',
  usage: 'LR!togglelevelup',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
