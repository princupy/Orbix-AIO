const {
  AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
  handleAutomodDelete,
  handleFilterCommand,
} = require('../../utils/automod');

const threshold = {
  summary(config) {
    return `${config.caps_percentage}% caps (min ${config.caps_min_length} chars)`;
  },
  usageLines(prefix, commandName) {
    return [
      `> \`${prefix}${commandName} <percent> [minLength]\` — e.g. \`${prefix}${commandName} 70 10\``,
    ];
  },
  parse(args) {
    if (!/^\d+$/.test(args[0] || '')) {
      return null;
    }

    const percent = Number(args[0]);

    if (percent < 40 || percent > 100) {
      return { error: 'Caps percentage must be between **40** and **100**.' };
    }

    const patch = { caps_percentage: percent };
    let minLengthNote = '';

    if (args[1] !== undefined) {
      if (!/^\d+$/.test(args[1])) {
        return { error: 'Minimum length must be a whole number between **5** and **500**.' };
      }

      const minLength = Number(args[1]);

      if (minLength < 5 || minLength > 500) {
        return { error: 'Minimum length must be between **5** and **500** characters.' };
      }

      patch.caps_min_length = minLength;
      minLengthNote = ` with a **${minLength} char** minimum`;
    }

    return {
      patch,
      summary: `Anti-Caps set to **${percent}% uppercase**${minLengthNote}.`,
    };
  },
};

async function execute({ args, message, prefix }) {
  await handleFilterCommand({
    actionField: 'caps_action',
    args,
    commandName: 'anticaps',
    enabledField: 'caps_enabled',
    filterLabel: 'Anti-Caps',
    message,
    prefix,
    threshold,
    whatItBlocks: 'Blocks messages that are mostly **UPPERCASE** above the configured percentage.',
  });
}

module.exports = {
  name: 'anticaps',
  aliases: ['nocaps', 'capsfilter'],
  category: 'automod',
  description: 'Toggle and configure the excessive-caps AutoMod filter.',
  usage: 'LR!anticaps <on|off|action <...>|<percent> [minLength]>',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
      execute: handleAutomodDelete,
    },
  ],
};
