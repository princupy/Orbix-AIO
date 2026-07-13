const { cv2Payload } = require('../../utils/cv2');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  buildErrorContainer,
  buildRankAttachment,
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
      title: 'Rank Failed',
    })));
    return;
  }

  const attachment = await buildRankAttachment({
    guild: message.guild,
    user: data.user,
    userLevel: data.userLevel,
  });

  await message.channel.send({
    content: `<@${data.user.id}> rank card`,
    files: [attachment],
    allowedMentions: {
      parse: [],
      users: [data.user.id],
      repliedUser: false,
    },
  });
}

module.exports = {
  name: 'rank',
  aliases: ['profile'],
  category: 'leveling',
  description: 'Shows a user rank card with level, XP, rank, and progress.',
  usage: 'LR!rank [@user]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
