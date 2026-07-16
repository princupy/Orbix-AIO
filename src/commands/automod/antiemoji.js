const {
  AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
  handleAutomodDelete,
  handleFilterCommand,
} = require('../../utils/automod');

const threshold = {
  summary(config) {
    return `max ${config.emoji_limit} emojis per message`;
  },
  usageLines(prefix, commandName) {
    return [
      `> \`${prefix}${commandName} <limit>\` — max emojis allowed (e.g. \`${prefix}${commandName} 8\`)`,
    ];
  },
  parse(args) {
    if (!/^\d+$/.test(args[0] || '')) {
      return null;
    }

    const limit = Number(args[0]);

    if (limit < 3 || limit > 50) {
      return { error: 'Emoji limit must be between **3** and **50**.' };
    }

    return {
      patch: { emoji_limit: limit },
      summary: `Emoji limit set to **${limit} emojis** per message.`,
    };
  },
};

async function execute({ args, message, prefix }) {
  await handleFilterCommand({
    actionField: 'emoji_action',
    args,
    commandName: 'antiemoji',
    enabledField: 'emoji_enabled',
    filterLabel: 'Anti-Emoji',
    message,
    prefix,
    threshold,
    whatItBlocks: 'Blocks messages with **too many emojis** (custom + unicode) above the limit.',
  });
}

module.exports = {
  name: 'antiemoji',
  aliases: ['antiemojis', 'noemoji', 'emojifilter'],
  category: 'automod',
  description: 'Toggle and configure the emoji-spam AutoMod filter.',
  usage: 'LR!antiemoji <on|off|action <...>|<limit>>',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
      execute: handleAutomodDelete,
    },
  ],
};
