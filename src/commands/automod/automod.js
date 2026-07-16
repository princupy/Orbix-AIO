const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');
const {
  getAutomodConfig,
  listBadWords,
  listExemptions,
  resetAutomodData,
  updateAutomodConfig,
} = require('../../supabase/automod');
const {
  AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
  buildAutomodError,
  buildAutomodSuccess,
  buildAutomodWarning,
  canManageAutomod,
  formatAction,
  formatDurationShort,
  handleAutomodDelete,
  statusLabel,
} = require('../../utils/automod');

const ENABLE_WORDS = new Set(['on', 'enable', 'enabled', 'true', 'yes']);
const DISABLE_WORDS = new Set(['off', 'disable', 'disabled', 'false', 'no']);

const DURATION_UNITS = {
  d: 86400,
  h: 3600,
  m: 60,
  s: 1,
};

const FILTER_ROWS = [
  { action: 'invite_action', enabled: 'invite_enabled', label: 'Anti-Invite' },
  { action: 'link_action', enabled: 'link_enabled', label: 'Anti-Link' },
  { action: 'spam_action', enabled: 'spam_enabled', label: 'Anti-Spam' },
  { action: 'mention_action', enabled: 'mention_enabled', label: 'Anti-Mention' },
  { action: 'caps_action', enabled: 'caps_enabled', label: 'Anti-Caps' },
  { action: 'emoji_action', enabled: 'emoji_enabled', label: 'Anti-Emoji' },
  { action: 'duplicate_action', enabled: 'duplicate_enabled', label: 'Anti-Duplicate' },
  { action: 'badword_action', enabled: 'badword_enabled', label: 'Bad Words' },
];

function parseDurationSeconds(value) {
  const text = String(value || '').trim().toLowerCase();

  if (/^\d+$/.test(text)) {
    return Number(text) * 60;
  }

  const match = text.match(/^(\d+)\s*(d|h|m|s)$/);

  if (!match) {
    return null;
  }

  return Number(match[1]) * DURATION_UNITS[match[2]];
}

function filterLine(config, row) {
  const enabled = config[row.enabled];
  const marker = enabled
    ? emojis.getEmoji('status.success') || '+'
    : emojis.getEmoji('status.error') || '-';
  const detail = enabled ? ` — ${formatAction(config[row.action])}` : '';

  return `> ${marker} **${row.label}**: ${enabled ? 'On' : 'Off'}${detail}`;
}

async function buildOverview(message, config) {
  const badWords = await listBadWords(message.guild.id);
  const exemptions = await listExemptions(message.guild.id);
  const badWordCount = badWords.ok ? badWords.words.length : 0;
  const exemptRoleCount = exemptions.ok ? exemptions.roles.length : 0;
  const exemptChannelCount = exemptions.ok ? exemptions.channels.length : 0;

  return [
    `**Master AutoMod:** ${statusLabel(config.enabled)}`,
    `**Log Channel:** ${config.log_channel_id ? `<#${config.log_channel_id}>` : '`Not set`'}`,
    `**Mute Duration:** \`${formatDurationShort(config.mute_duration_seconds)}\``,
    '',
    '**Filters:**',
    ...FILTER_ROWS.map((row) => filterLine(config, row)),
    '',
    `**Bad Words:** \`${badWordCount}\` • **Exempt Roles:** \`${exemptRoleCount}\` • **Exempt Channels:** \`${exemptChannelCount}\``,
  ].join('\n');
}

function buildManageHints(prefix) {
  return [
    '**Configure each filter:**',
    `> \`${prefix}antiinvite\` · \`${prefix}antilink\` · \`${prefix}antispam\` · \`${prefix}antimention\``,
    `> \`${prefix}anticaps\` · \`${prefix}antiemoji\` · \`${prefix}antiduplicate\` · \`${prefix}badwords\``,
    '',
    '**Global:**',
    `> \`${prefix}automod on\` / \`${prefix}automod off\` — master switch`,
    `> \`${prefix}automod mutetime <10m|1h|...>\` — mute duration`,
    `> \`${prefix}automodlog <#channel>\` — action log channel`,
    `> \`${prefix}automodexempt add <@role|#channel>\` — bypass roles/channels`,
    `> \`${prefix}automod reset confirm\` — wipe all AutoMod settings`,
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

  if (!configResult.ok && configResult.reason) {
    await message.reply(cv2Payload(buildAutomodError({
      description: `Could not load AutoMod settings.\n\`${configResult.reason}\`\n\nMake sure the \`006_automod.sql\` migration has been run in Supabase.`,
      ownerId,
      title: 'Database Error',
    })));
    return;
  }

  const config = configResult.config;
  const sub = args[0]?.toLowerCase();

  if (ENABLE_WORDS.has(sub)) {
    const result = await updateAutomodConfig(message.guild.id, { enabled: true });

    if (!result.ok) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Could not save settings.\n\`${result.reason}\``,
        ownerId,
        title: 'Save Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildAutomodSuccess({
      description: [
        'Master **AutoMod** is now **enabled**.',
        '',
        `Turn on the filters you want, e.g. \`${prefix}antiinvite on\`, \`${prefix}antispam on\`.`,
      ].join('\n'),
      ownerId,
      title: 'AutoMod Enabled',
    })));
    return;
  }

  if (DISABLE_WORDS.has(sub)) {
    const result = await updateAutomodConfig(message.guild.id, { enabled: false });

    if (!result.ok) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Could not save settings.\n\`${result.reason}\``,
        ownerId,
        title: 'Save Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildAutomodSuccess({
      description: 'Master **AutoMod** is now **disabled**. No messages will be filtered until re-enabled.',
      ownerId,
      title: 'AutoMod Disabled',
    })));
    return;
  }

  if (sub === 'mutetime' || sub === 'muteduration' || sub === 'mutedur') {
    const seconds = parseDurationSeconds(args[1]);

    if (!seconds || seconds < 10 || seconds > 2419200) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Provide a duration between **10s** and **28d**.\nExamples: \`${prefix}automod mutetime 10m\`, \`${prefix}automod mutetime 1h\`.`,
        ownerId,
        title: 'Invalid Duration',
      })));
      return;
    }

    const result = await updateAutomodConfig(message.guild.id, { mute_duration_seconds: seconds });

    if (!result.ok) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Could not save settings.\n\`${result.reason}\``,
        ownerId,
        title: 'Save Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildAutomodSuccess({
      description: `Mute action duration set to \`${formatDurationShort(seconds)}\`.`,
      ownerId,
      title: 'Mute Duration Updated',
    })));
    return;
  }

  if (sub === 'reset') {
    if (args[1]?.toLowerCase() !== 'confirm') {
      await message.channel.send(cv2Payload(buildAutomodWarning({
        description: [
          'This will **wipe all AutoMod settings** for this server: every filter, bad word, and exemption.',
          '',
          `To confirm, run \`${prefix}automod reset confirm\`.`,
        ].join('\n'),
        ownerId,
        title: 'Confirm AutoMod Reset',
      })));
      return;
    }

    const result = await resetAutomodData(message.guild.id);

    if (!result.ok) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Could not reset AutoMod data.\n\`${result.reason}\``,
        ownerId,
        title: 'Reset Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildAutomodSuccess({
      description: 'All AutoMod settings for this server have been reset to defaults.',
      ownerId,
      title: 'AutoMod Reset',
    })));
    return;
  }

  const overview = await buildOverview(message, config);

  await message.channel.send(cv2Payload(buildAutomodWarning({
    description: [
      overview,
      '',
      buildManageHints(prefix),
    ].join('\n'),
    ownerId,
    title: 'AutoMod Overview',
  }), {
    allowedMentions: { parse: [], roles: [], repliedUser: false },
  }));
}

module.exports = {
  name: 'automod',
  aliases: ['automoderation', 'am'],
  category: 'automod',
  description: 'Master AutoMod control panel — status, enable/disable, mute duration, and reset.',
  usage: 'LR!automod [on|off|mutetime <duration>|reset confirm]',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
      execute: handleAutomodDelete,
    },
  ],
};
