const { getMusicManager } = require('../../utils/music');
const { buildQueuePayload, sendMusicCommandError } = require('../../utils/musicUi');

async function execute({ client, message }) {
  try {
    const manager = getMusicManager(client);
    const session = manager.requireSession(message.guild.id);
    manager.assertMemberInSession(message.member, session);
    session.textChannelId = message.channel.id;

    await message.channel.send(buildQueuePayload(session));
  } catch (error) {
    await sendMusicCommandError(message, error);
  }
}

module.exports = {
  name: 'queue',
  aliases: ['q', 'musicqueue'],
  category: 'music',
  description: 'Shows and manages the interactive Lavalink music queue.',
  noTimeout: true,
  usage: 'LR!queue',
  execute,
};
