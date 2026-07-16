const {
  AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
  handleAutomodDelete,
  handleFilterCommand,
} = require('../../utils/automod');

const threshold = {
  summary(config) {
    return `${config.duplicate_limit} identical messages in a row`;
  },
  usageLines(prefix, commandName) {
    return [
      `> \`${prefix}${commandName} <limit>\` — repeated messages allowed (e.g. \`${prefix}${commandName} 3\`)`,
    ];
  },
  parse(args) {
    if (!/^\d+$/.test(args[0] || '')) {
      return null;
    }

    const limit = Number(args[0]);

    if (limit < 2 || limit > 20) {
      return { error: 'Duplicate limit must be between **2** and **20**.' };
    }

    return {
      patch: { duplicate_limit: limit },
      summary: `Duplicate limit set to **${limit} identical messages** in a row.`,
    };
  },
};

async function execute({ args, message, prefix }) {
  await handleFilterCommand({
    actionField: 'duplicate_action',
    args,
    commandName: 'antiduplicate',
    enabledField: 'duplicate_enabled',
    filterLabel: 'Anti-Duplicate',
    message,
    prefix,
    threshold,
    whatItBlocks: 'Blocks users who send the **same message repeatedly** (copy-paste flooding).',
  });
}

module.exports = {
  name: 'antiduplicate',
  aliases: ['antidupe', 'noduplicate', 'antispamtext'],
  category: 'automod',
  description: 'Toggle and configure the duplicate-message AutoMod filter.',
  usage: 'LR!antiduplicate <on|off|action <...>|<limit>>',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
      execute: handleAutomodDelete,
    },
  ],
};
