const { getMusicManager } = require('../../utils/music');
const { buildMusicNoticePayload, sendMusicCommandError } = require('../../utils/musicUi');

async function execute({ client, message }) {
  try {
    const manager = getMusicManager(client);
    const session = manager.requireSession(message.guild.id);
    manager.assertMemberInSession(message.member, session);
    const voiceChannelId = session.voiceChannelId;
    await manager.disconnect(message.guild.id, { reason: 'manual' });

    await message.reply(buildMusicNoticePayload({
      description: `Stopped playback, cleared the queue, and disconnected from <#${voiceChannelId}>.`,
      title: 'Disconnected',
    }));
  } catch (error) {
    await sendMusicCommandError(message, error);
  }
}

module.exports = {
  name: 'dc',
  aliases: ['disconnect', 'leave', 'stop'],
  category: 'music',
  description: 'Stops playback, clears the queue, and disconnects the player.',
  noTimeout: true,
  usage: 'LR!dc',
  execute,
};
