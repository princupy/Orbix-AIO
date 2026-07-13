const { createChannelPermissionCommand } = require('../../utils/channelModerationCommand');

module.exports = createChannelPermissionCommand({
  name: 'unhide',
  aliases: ['unhidechannel'],
  operation: 'unhide',
  usage: 'LR!unhide [reason]',
});
