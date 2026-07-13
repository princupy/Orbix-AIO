const { cv2Payload } = require('../../utils/cv2');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  buildErrorContainer,
  buildLevelingContainer,
  createProgressBar,
  formatNumber,
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
      title: 'Progress Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildLevelingContainer({
    ownerId,
    title: 'Rank Progress',
    description: [
      `<@${data.user.id}> is level **${data.userLevel.level}**.`,
      `${createProgressBar(data.progress.percent)} **${Math.floor(data.progress.percent * 100)}%**`,
      `Needs **${formatNumber(data.progress.remainingXp)} XP** for level **${data.userLevel.level + 1}**.`,
    ].join('\n'),
  }), {
    allowedMentions: {
      parse: [],
      users: [data.user.id],
      repliedUser: false,
    },
  }));
}

module.exports = {
  name: 'rankprogress',
  aliases: ['progress', 'levelprogress'],
  category: 'leveling',
  description: 'Shows exact XP needed for the next level.',
  usage: 'LR!rankprogress [@user]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
