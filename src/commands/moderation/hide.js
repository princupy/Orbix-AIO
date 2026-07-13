const { createChannelPermissionCommand } = require('../../utils/channelModerationCommand');

module.exports = createChannelPermissionCommand({
  name: 'hide',
  aliases: ['hidechannel'],
  operation: 'hide',
  usage: 'LR!hide [reason]',
});
