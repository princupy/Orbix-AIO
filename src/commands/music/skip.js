const { getMusicManager } = require('../../utils/music');
const { buildMusicNoticePayload, sendMusicCommandError } = require('../../utils/musicUi');

async function execute({ client, message }) {
  try {
    const manager = getMusicManager(client);
    const session = manager.requireSession(message.guild.id);
    manager.assertMemberInSession(message.member, session);
    const { next, previous } = await manager.skip(message.guild.id);

    await message.reply(buildMusicNoticePayload({
      description: next
        ? `Skipped **${previous.info.title}**. Now playing **${next.info.title}**.`
        : `Skipped **${previous.info.title}**. The queue is now empty.`,
      title: 'Track Skipped',
    }));
  } catch (error) {
    await sendMusicCommandError(message, error);
  }
}

module.exports = {
  name: 'skip',
  aliases: ['next', 's'],
  category: 'music',
  description: 'Skips the current track and starts the next queued track.',
  noTimeout: true,
  usage: 'LR!skip',
  execute,
};
