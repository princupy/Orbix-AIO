const { getMusicManager } = require('../../utils/music');
const { buildMusicNoticePayload, sendMusicCommandError } = require('../../utils/musicUi');

async function execute({ client, message }) {
  try {
    const manager = getMusicManager(client);
    const session = manager.requireSession(message.guild.id);
    manager.assertMemberInSession(message.member, session);
    await manager.pause(message.guild.id);

    await message.reply(buildMusicNoticePayload({
      description: `Paused **${session.current.info.title}**.`,
      title: 'Playback Paused',
    }));
  } catch (error) {
    await sendMusicCommandError(message, error);
  }
}

module.exports = {
  name: 'pause',
  aliases: ['hold'],
  category: 'music',
  description: 'Pauses the current Lavalink track.',
  noTimeout: true,
  usage: 'LR!pause',
  execute,
};
