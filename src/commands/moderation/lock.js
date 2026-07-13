const { createChannelPermissionCommand } = require('../../utils/channelModerationCommand');

module.exports = createChannelPermissionCommand({
  name: 'lock',
  aliases: ['lockchannel'],
  operation: 'lock',
  usage: 'LR!lock [reason]',
});
