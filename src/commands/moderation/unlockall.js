const { createChannelPermissionCommand } = require('../../utils/channelModerationCommand');

module.exports = createChannelPermissionCommand({
  name: 'unlockall',
  aliases: ['unlockchannels'],
  allChannels: true,
  operation: 'unlock',
  usage: 'LR!unlockall [reason]',
});
