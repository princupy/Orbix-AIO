const { cv2Payload } = require('../../utils/cv2');
const {
  addBadWords,
  clearBadWords,
  getAutomodConfig,
  listBadWords,
  removeBadWords,
  updateAutomodConfig,
} = require('../../supabase/automod');
const {
  AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
  buildAutomodError,
  buildAutomodSuccess,
  buildAutomodWarning,
  canManageAutomod,
  formatAction,
  handleAutomodDelete,
  parseAction,
  statusLabel,
} = require('../../utils/automod');

const ENABLE_WORDS = new Set(['on', 'enable', 'enabled', 'true', 'yes']);
const DISABLE_WORDS = new Set(['off', 'disable', 'disabled', 'false', 'no']);
const MAX_LISTED_WORDS = 60;

function splitWords(rawArgs) {
  return rawArgs
    .join(' ')
    .split(/[\s,]+/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
}

function formatWordList(words, config, prefix) {
  const shown = words.slice(0, MAX_LISTED_WORDS);
  const listText = words.length === 0
    ? '`No blocked words configured.`'
    : shown.map((word) => `\`${word}\``).join(', ');
  const overflow = words.length > MAX_LISTED_WORDS
    ? `\n\n*...and ${words.length - MAX_LISTED_WORDS} more.*`
    : '';

  return [
    `**Status:** ${statusLabel(config.badword_enabled)}`,
    `**Action:** ${formatAction(config.badword_action)}`,
    `**Blocked Words (${words.length}):**`,
    listText + overflow,
    '',
    '**Manage:**',
    `> \`${prefix}badwords add <word1, word2, ...>\``,
    `> \`${prefix}badwords remove <word1, ...>\``,
    `> \`${prefix}badwords on\` / \`${prefix}badwords off\``,
    `> \`${prefix}badwords action <delete|warn|mute|kick|ban>\``,
    `> \`${prefix}badwords clear confirm\``,
  ].join('\n');
}

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;

  if (!canManageAutomod(message.member, ownerId)) {
    await message.reply(cv2Payload(buildAutomodError({
      description: 'You need **Manage Server** or **Administrator** permission to configure AutoMod.',
      ownerId,
      title: 'Missing Permission',
    })));
    return;
  }

  const configResult = await getAutomodConfig(message.guild.id);
  const config = configResult.config;
  const sub = args[0]?.toLowerCase();

  if (ENABLE_WORDS.has(sub) || DISABLE_WORDS.has(sub)) {
    const enabled = ENABLE_WORDS.has(sub);
    const result = await updateAutomodConfig(message.guild.id, { badword_enabled: enabled });

    if (!result.ok) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Could not save settings.\n\`${result.reason}\``,
        ownerId,
        title: 'Save Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildAutomodSuccess({
      description: `**Bad Words** filter is now **${enabled ? 'enabled' : 'disabled'}**.${enabled && !config.enabled ? `\nRemember to enable master AutoMod: \`${prefix}automod on\`.` : ''}`,
      ownerId,
      title: `Bad Words ${enabled ? 'Enabled' : 'Disabled'}`,
    })));
    return;
  }

  if (sub === 'action' || sub === 'punishment') {
    const action = parseAction(args[1]);

    if (!action) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Choose one of: \`delete\`, \`warn\`, \`mute\`, \`kick\`, \`ban\`.`,
        ownerId,
        title: 'Invalid Action',
      })));
      return;
    }

    const result = await updateAutomodConfig(message.guild.id, { badword_action: action });

    if (!result.ok) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Could not save settings.\n\`${result.reason}\``,
        ownerId,
        title: 'Save Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildAutomodSuccess({
      description: `**Bad Words** action set to **${formatAction(action)}**.`,
      ownerId,
      title: 'Bad Words Action Updated',
    })));
    return;
  }

  if (sub === 'add') {
    const words = splitWords(args.slice(1));

    if (words.length === 0) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Provide one or more words.\nUsage: \`${prefix}badwords add <word1, word2, ...>\``,
        ownerId,
        title: 'No Words Provided',
      })));
      return;
    }

    const result = await addBadWords({ addedBy: ownerId, guildId: message.guild.id, words });

    if (!result.ok) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Could not add words.\n\`${result.reason}\``,
        ownerId,
        title: 'Add Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildAutomodSuccess({
      description: `Added **${result.added.length}** word${result.added.length === 1 ? '' : 's'} to the blocklist.${config.badword_enabled ? '' : `\n\nEnable the filter with \`${prefix}badwords on\`.`}`,
      ownerId,
      title: 'Bad Words Added',
    })));
    return;
  }

  if (sub === 'remove' || sub === 'delete' || sub === 'del') {
    const words = splitWords(args.slice(1));

    if (words.length === 0) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Provide one or more words to remove.\nUsage: \`${prefix}badwords remove <word1, ...>\``,
        ownerId,
        title: 'No Words Provided',
      })));
      return;
    }

    const result = await removeBadWords({ guildId: message.guild.id, words });

    if (!result.ok) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Could not remove words.\n\`${result.reason}\``,
        ownerId,
        title: 'Remove Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildAutomodSuccess({
      description: `Removed **${result.removed.length}** word${result.removed.length === 1 ? '' : 's'} from the blocklist.`,
      ownerId,
      title: 'Bad Words Removed',
    })));
    return;
  }

  if (sub === 'clear') {
    if (args[1]?.toLowerCase() !== 'confirm') {
      await message.channel.send(cv2Payload(buildAutomodWarning({
        description: `This removes **all** blocked words for this server.\nTo confirm, run \`${prefix}badwords clear confirm\`.`,
        ownerId,
        title: 'Confirm Clear',
      })));
      return;
    }

    const result = await clearBadWords(message.guild.id);

    if (!result.ok) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Could not clear words.\n\`${result.reason}\``,
        ownerId,
        title: 'Clear Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildAutomodSuccess({
      description: 'All blocked words have been cleared.',
      ownerId,
      title: 'Bad Words Cleared',
    })));
    return;
  }

  const words = await listBadWords(message.guild.id);

  if (!words.ok && words.reason) {
    await message.reply(cv2Payload(buildAutomodError({
      description: `Could not load blocked words.\n\`${words.reason}\``,
      ownerId,
      title: 'Load Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildAutomodWarning({
    description: formatWordList(words.words, config, prefix),
    ownerId,
    title: 'Bad Words Filter',
  }), {
    allowedMentions: { parse: [], roles: [], repliedUser: false },
  }));
}

module.exports = {
  name: 'badwords',
  aliases: ['badword', 'wordfilter', 'filterwords', 'blockedwords'],
  category: 'automod',
  description: 'Manage the AutoMod blocked-word list (add, remove, list, clear, toggle).',
  usage: 'LR!badwords <add|remove|list|clear|on|off|action> ...',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
      execute: handleAutomodDelete,
    },
  ],
};
