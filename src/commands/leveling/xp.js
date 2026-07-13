const { cv2Payload } = require('../../utils/cv2');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  buildErrorContainer,
  buildLevelStatAttachment,
  getRankData,
  handleDeleteButton,
} = require('../../utils/leveling');

async function execute({ args, message }) {
  const ownerId = message.author.id;
  const data = await getRankData(message, args[0]);

  if (!data.ok) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: data.reason,
      ownerId,
      title: 'XP Failed',
    })));
    return;
  }

  const attachment = await buildLevelStatAttachment({
    guild: message.guild,
    position: data.position,
    progress: data.progress,
    type: 'xp',
    user: data.user,
    userLevel: data.userLevel,
  });

  await message.channel.send({
    files: [attachment],
    allowedMentions: {
      parse: [],
      repliedUser: false,
    },
  });
}

module.exports = {
  name: 'xp',
  aliases: ['totalxp'],
  category: 'leveling',
  description: 'Shows raw total XP for a user.',
  usage: 'LR!xp [@user]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
