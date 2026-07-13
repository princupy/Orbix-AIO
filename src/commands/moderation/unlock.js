const { createChannelPermissionCommand } = require('../../utils/channelModerationCommand');

module.exports = createChannelPermissionCommand({
  name: 'unlock',
  aliases: ['unlockchannel'],
  operation: 'unlock',
  usage: 'LR!unlock [reason]',
});
