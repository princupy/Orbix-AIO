const {
  AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
  handleAutomodDelete,
  handleFilterCommand,
} = require('../../utils/automod');

const threshold = {
  summary(config) {
    return `max ${config.mention_limit} mentions per message`;
  },
  usageLines(prefix, commandName) {
    return [
      `> \`${prefix}${commandName} <limit>\` — max mentions allowed (e.g. \`${prefix}${commandName} 5\`)`,
    ];
  },
  parse(args) {
    if (!/^\d+$/.test(args[0] || '')) {
      return null;
    }

    const limit = Number(args[0]);

    if (limit < 2 || limit > 50) {
      return { error: 'Mention limit must be between **2** and **50**.' };
    }

    return {
      patch: { mention_limit: limit },
      summary: `Mass-mention limit set to **${limit} mentions** per message.`,
    };
  },
};

async function execute({ args, message, prefix }) {
  await handleFilterCommand({
    actionField: 'mention_action',
    args,
    commandName: 'antimention',
    enabledField: 'mention_enabled',
    filterLabel: 'Anti-Mention',
    message,
    prefix,
    threshold,
    whatItBlocks: 'Blocks **mass mention** messages that ping more than the allowed number of users/roles.',
  });
}

module.exports = {
  name: 'antimention',
  aliases: ['antimassmention', 'nomention', 'antimentions'],
  category: 'automod',
  description: 'Toggle and configure the mass-mention AutoMod filter.',
  usage: 'LR!antimention <on|off|action <...>|<limit>>',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
      execute: handleAutomodDelete,
    },
  ],
};
