const { getMusicManager } = require('../../utils/music');
const { buildMusicNoticePayload, sendMusicCommandError } = require('../../utils/musicUi');

async function execute({ client, message }) {
  try {
    const manager = getMusicManager(client);
    const session = manager.requireSession(message.guild.id);
    manager.assertMemberInSession(message.member, session);
    await manager.resume(message.guild.id);

    await message.reply(buildMusicNoticePayload({
      description: `Resumed **${session.current.info.title}**.`,
      title: 'Playback Resumed',
    }));
  } catch (error) {
    await sendMusicCommandError(message, error);
  }
}

module.exports = {
  name: 'resume',
  aliases: ['unpause'],
  category: 'music',
  description: 'Resumes a paused Lavalink track.',
  noTimeout: true,
  usage: 'LR!resume',
  execute,
};
