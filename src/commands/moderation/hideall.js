const { createChannelPermissionCommand } = require('../../utils/channelModerationCommand');

module.exports = createChannelPermissionCommand({
  name: 'hideall',
  aliases: ['hidechannels'],
  allChannels: true,
  operation: 'hide',
  usage: 'LR!hideall [reason]',
});
