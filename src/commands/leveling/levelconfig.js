const { cv2Payload } = require('../../utils/cv2');
const { getLevelConfig, updateLevelConfig } = require('../../supabase/leveling');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  buildErrorContainer,
  buildLevelingContainer,
  buildSuccessContainer,
  getLevelAdminCheck,
  handleDeleteButton,
} = require('../../utils/leveling');

function formatConfig(config) {
  return [
    `Leveling: **${config.leveling_enabled ? 'Enabled' : 'Disabled'}**`,
    `XP Rate: **${config.xp_min}-${config.xp_max} XP**`,
    `Cooldown: **${config.cooldown_seconds}s**`,
    `Level-up Messages: **${config.levelup_enabled ? 'Enabled' : 'Disabled'}**`,
    `Level-up Channel: ${config.levelup_channel_id ? `<#${config.levelup_channel_id}>` : '`Current channel`'}`,
    `Level-up Message: ${config.levelup_message}`,
    `Reward Role Mode: **${config.stack_roles ? 'stack' : 'replace'}**`,
  ].join('\n');
}

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;
  const permissionError = getLevelAdminCheck(message);

  if (permissionError) {
    await message.reply(cv2Payload(permissionError));
    return;
  }

  const action = args[0]?.toLowerCase();

  if (!['toggle', 'view'].includes(action)) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: `Usage: \`${prefix}levelconfig <toggle|view>\``,
      ownerId,
      title: 'Level Config Usage',
    })));
    return;
  }

  if (action === 'view') {
    const result = await getLevelConfig(message.guild.id);

    if (!result.ok) {
      await message.reply(cv2Payload(buildErrorContainer({
        description: result.reason,
        ownerId,
        title: 'Config Load Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildLevelingContainer({
      ownerId,
      title: 'Level Config',
      description: formatConfig(result.config),
    })));
    return;
  }

  const current = await getLevelConfig(message.guild.id);
  const result = await updateLevelConfig(message.guild.id, {
    leveling_enabled: !current.config.leveling_enabled,
  });

  if (!result.ok) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: result.reason,
      ownerId,
      title: 'Config Update Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildSuccessContainer({
    ownerId,
    title: 'Leveling Toggled',
    description: `Leveling is now **${result.config.leveling_enabled ? 'enabled' : 'disabled'}**.`,
  })));
}

module.exports = {
  name: 'levelconfig',
  aliases: ['levelsconfig'],
  category: 'leveling',
  description: 'View or toggle leveling settings.',
  usage: 'LR!levelconfig <toggle|view>',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
