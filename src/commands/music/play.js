const { getMusicManager } = require('../../utils/music');
const {
  buildQueuedPayload,
  musicComponentHandlers,
  sendMusicCommandError,
} = require('../../utils/musicUi');

async function execute({ args, client, message }) {
  try {
    const query = args.join(' ').trim();
    const manager = getMusicManager(client);
    const voiceChannel = manager.requireMemberVoiceChannel(message.member);
    const result = await manager.enqueue({
      guild: message.guild,
      query,
      requester: message.author,
      textChannelId: message.channel.id,
      voiceChannel,
    });

    await message.channel.send(buildQueuedPayload(result));
  } catch (error) {
    await sendMusicCommandError(message, error);
  }
}

module.exports = {
  name: 'play',
  aliases: ['p'],
  category: 'music',
  description: 'Searches for a song or URL and adds it to the Lavalink queue.',
  noTimeout: true,
  usage: 'LR!play <song name or URL>',
  execute,
  // Register shared player and queue buttons exactly once.
  componentHandlers: musicComponentHandlers,
};
