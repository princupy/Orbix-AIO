const { cv2Payload } = require('../../utils/cv2');
const { updateLevelConfig } = require('../../supabase/leveling');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  buildErrorContainer,
  buildSuccessContainer,
  getLevelAdminCheck,
  handleDeleteButton,
  resolveTextChannel,
} = require('../../utils/leveling');

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;
  const permissionError = getLevelAdminCheck(message);

  if (permissionError) {
    await message.reply(cv2Payload(permissionError));
    return;
  }

  const target = args[0]?.toLowerCase();

  if (!target) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: `Usage: \`${prefix}setlevelchannel #channel\` or \`${prefix}setlevelchannel none\``,
      ownerId,
      title: 'Set Level Channel Usage',
    })));
    return;
  }

  const channel = target === 'none' ? null : await resolveTextChannel(message, args[0]);

  if (target !== 'none' && !channel) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: 'Please provide a valid text channel mention or channel ID.',
      ownerId,
      title: 'Invalid Channel',
    })));
    return;
  }

  const result = await updateLevelConfig(message.guild.id, {
    levelup_channel_id: channel?.id || null,
  });

  if (!result.ok) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: result.reason,
      ownerId,
      title: 'Channel Update Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildSuccessContainer({
    ownerId,
    title: 'Level Channel Updated',
    description: channel
      ? `Level-up announcements will go to <#${channel.id}>.`
      : 'Level-up announcements will be sent in the current channel.',
  }), {
    allowedMentions: {
      parse: [],
      repliedUser: false,
    },
  }));
}

module.exports = {
  name: 'setlevelchannel',
  aliases: ['levelchannel'],
  category: 'leveling',
  description: 'Set the level-up announcement channel, or none for current channel.',
  usage: 'LR!setlevelchannel #channel|none',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
