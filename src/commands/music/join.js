const { getMusicManager } = require('../../utils/music');
const { buildMusicNoticePayload, sendMusicCommandError } = require('../../utils/musicUi');

async function execute({ client, message }) {
  try {
    const manager = getMusicManager(client);
    const voiceChannel = manager.requireMemberVoiceChannel(message.member);
    const { created } = await manager.connect({
      guild: message.guild,
      textChannelId: message.channel.id,
      voiceChannel,
    });

    await message.reply(buildMusicNoticePayload({
      description: created
        ? `Connected to ${voiceChannel}. Use the \`play\` command to add music.`
        : `I am already connected to ${voiceChannel}.`,
      title: created ? 'Joined Voice' : 'Already Connected',
    }));
  } catch (error) {
    await sendMusicCommandError(message, error);
  }
}

module.exports = {
  name: 'join',
  aliases: ['j'],
  category: 'music',
  description: 'Connects the Lavalink player to your voice channel.',
  noTimeout: true,
  usage: 'LR!join',
  execute,
};
