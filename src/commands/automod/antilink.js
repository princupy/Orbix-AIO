const {
  AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
  handleAutomodDelete,
  handleFilterCommand,
} = require('../../utils/automod');

async function execute({ args, message, prefix }) {
  await handleFilterCommand({
    actionField: 'link_action',
    args,
    commandName: 'antilink',
    enabledField: 'link_enabled',
    filterLabel: 'Anti-Link',
    message,
    prefix,
    whatItBlocks: 'Blocks messages containing **URLs / website links** (http, https, www, and common domains).',
  });
}

module.exports = {
  name: 'antilink',
  aliases: ['antilinks', 'nolink', 'nolinks'],
  category: 'automod',
  description: 'Toggle and configure the URL/link AutoMod filter.',
  usage: 'LR!antilink <on|off|action <delete|warn|mute|kick|ban>>',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
      execute: handleAutomodDelete,
    },
  ],
};
