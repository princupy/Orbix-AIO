const { cv2Payload } = require('../../utils/cv2');
const { resetGuildLevels } = require('../../supabase/leveling');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  buildErrorContainer,
  buildLevelingContainer,
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

  await message.reply(cv2Payload(buildLevelingContainer({
    ownerId,
    title: 'Confirm Leaderboard Reset',
    description: 'Type `confirm` within **15 seconds** to reset this server leaderboard.',
  })));

  const collected = await message.channel.awaitMessages({
    filter: (reply) => reply.author.id === ownerId && reply.content.toLowerCase().trim() === 'confirm',
    max: 1,
    time: 15_000,
  }).catch(() => null);

  if (!collected?.size) {
    await message.channel.send(cv2Payload(buildErrorContainer({
      description: 'Reset cancelled. Confirmation was not received in time.',
      ownerId,
      title: 'Reset Cancelled',
    })));
    return;
  }

  const result = await resetGuildLevels(message.guild.id);

  if (!result.ok) {
    await message.channel.send(cv2Payload(buildErrorContainer({
      description: result.reason,
      ownerId,
      title: 'Reset Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildSuccessContainer({
    ownerId,
    title: 'Leaderboard Reset',
    description: 'All XP, levels, message counts, and cooldown timestamps have been reset for this server.',
  })));
}

module.exports = {
  name: 'resetall',
  aliases: ['resetleaderboard'],
  category: 'leveling',
  description: 'Reset this server leaderboard after confirmation.',
  usage: 'LR!resetall',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
