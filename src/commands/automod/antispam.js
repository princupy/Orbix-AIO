const {
  AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
  handleAutomodDelete,
  handleFilterCommand,
} = require('../../utils/automod');

const threshold = {
  summary(config) {
    return `${config.spam_message_count} messages / ${config.spam_interval_seconds}s`;
  },
  usageLines(prefix, commandName) {
    return [
      `> \`${prefix}${commandName} <count> <seconds>\` — set threshold (e.g. \`${prefix}${commandName} 5 5\`)`,
    ];
  },
  parse(args) {
    if (!/^\d+$/.test(args[0] || '')) {
      return null;
    }

    const count = Number(args[0]);
    const seconds = /^\d+$/.test(args[1] || '') ? Number(args[1]) : NaN;

    if (count < 2 || count > 30) {
      return { error: 'Message count must be between **2** and **30**. Usage: `<count> <seconds>`.' };
    }

    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60) {
      return { error: 'Provide the interval in seconds too (1-60). Usage: `<count> <seconds>` e.g. `5 5`.' };
    }

    return {
      patch: {
        spam_interval_seconds: seconds,
        spam_message_count: count,
      },
      summary: `Anti-Spam threshold set to **${count} messages / ${seconds}s**.`,
    };
  },
};

async function execute({ args, message, prefix }) {
  await handleFilterCommand({
    actionField: 'spam_action',
    args,
    commandName: 'antispam',
    enabledField: 'spam_enabled',
    filterLabel: 'Anti-Spam',
    message,
    prefix,
    threshold,
    whatItBlocks: 'Detects **fast message spam** — too many messages from one user in a short window.',
  });
}

module.exports = {
  name: 'antispam',
  aliases: ['nospam', 'spamfilter'],
  category: 'automod',
  description: 'Toggle and configure the message-spam AutoMod filter.',
  usage: 'LR!antispam <on|off|action <...>|<count> <seconds>>',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
      execute: handleAutomodDelete,
    },
  ],
};
