const { createChannelPermissionCommand } = require('../../utils/channelModerationCommand');

module.exports = createChannelPermissionCommand({
  name: 'unhideall',
  aliases: ['unhidechannels'],
  allChannels: true,
  operation: 'unhide',
  usage: 'LR!unhideall [reason]',
});
