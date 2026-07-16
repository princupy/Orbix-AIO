const {
  AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
  handleAutomodDelete,
  handleFilterCommand,
} = require('../../utils/automod');

async function execute({ args, message, prefix }) {
  await handleFilterCommand({
    actionField: 'invite_action',
    args,
    commandName: 'antiinvite',
    enabledField: 'invite_enabled',
    filterLabel: 'Anti-Invite',
    message,
    prefix,
    whatItBlocks: 'Blocks Discord server **invite links** (discord.gg, discord.com/invite, dsc.gg, etc.).',
  });
}

module.exports = {
  name: 'antiinvite',
  aliases: ['antiinvites', 'noinvite', 'noinvites'],
  category: 'automod',
  description: 'Toggle and configure the Discord invite-link AutoMod filter.',
  usage: 'LR!antiinvite <on|off|action <delete|warn|mute|kick|ban>>',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
      execute: handleAutomodDelete,
    },
  ],
};
