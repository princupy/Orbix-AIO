const { createChannelPermissionCommand } = require('../../utils/channelModerationCommand');

module.exports = createChannelPermissionCommand({
  name: 'lockall',
  aliases: ['lockchannels'],
  allChannels: true,
  operation: 'lock',
  usage: 'LR!lockall [reason]',
});
