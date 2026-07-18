const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const emojis = require('../../emojis');
const { BOT_OWNER_IDS } = require('../../config');
const { cv2Payload } = require('../../utils/cv2');

const DJS_VERSION = require('discord.js').version;

const STATS_TAB_PREFIX = 'stats:tab:';
const STATS_CLOSE_PREFIX = 'stats:close:';
const IGNORED_INTERACTION_CODES = new Set([10062, 40060]);
const FALLBACK_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';

const SUPPORT_SERVER_URL = 'https://discord.gg/thelastridee';
const DEVELOPER_INSTAGRAM_URL = 'https://www.instagram.com/tanmoy_here8388/';
const DEVELOPER_NAME = 'Tanmay';
const TAGLINE = 'Your all-in-one server companion';

const STAR = '<:star:1510658629278105800>';

const TABS = [
  { emoji: '<:icons8usergroups64:1504502823365382318>', key: 'about', label: 'About' },
  { emoji: '<:icons8bulb64:1504508658560532691>', key: 'statistics', label: 'Statistics' },
  { emoji: '<:icons8discordearlyverifiedbotdev:1504541018177929457>', key: 'developers', label: 'Developers' },
];
const VALID_TABS = new Set(TABS.map((tab) => tab.key));

let codeStatsCache = null;

/* ── Generic helpers ── */

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [${DEVELOPER_NAME}](${DEVELOPER_INSTAGRAM_URL})`);
}

function createEphemeralTextPayload(content) {
  return cv2Payload(
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    ),
    { ephemeral: true },
  );
}

function getBotAvatarUrl(client, size = 256) {
  return client.user?.displayAvatarURL?.({ extension: 'png', forceStatic: true, size }) || FALLBACK_AVATAR;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function formatUptime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [];

  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(' ');
}

function getSafePing(client) {
  const ping = Math.round(client.ws.ping);
  return Number.isFinite(ping) && ping >= 0 ? ping : 0;
}

/**
 * Sample process CPU usage over a short window and return a percentage.
 * Clamped to 0–100 (a single Node process can briefly exceed 100% across threads).
 */
async function getCpuPercent() {
  const startUsage = process.cpuUsage();
  const startTime = process.hrtime.bigint();

  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 100);
    timer.unref?.();
  });

  const elapsedUs = Number(process.hrtime.bigint() - startTime) / 1000;
  const diff = process.cpuUsage(startUsage);
  const totalUs = diff.user + diff.system;
  const percent = elapsedUs > 0 ? (totalUs / elapsedUs) * 100 : 0;

  return Math.max(0, Math.min(100, percent));
}

/**
 * Walk the src tree once and count folders, .js files, lines, and words.
 * Cached after the first run since source does not change at runtime.
 */
function getCodeStats() {
  if (codeStatsCache) {
    return codeStatsCache;
  }

  const root = path.join(__dirname, '..', '..');
  const stats = {
    files: 0, folders: 0, lines: 0, words: 0,
  };

  const walk = (dir) => {
    let entries;

    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        stats.folders += 1;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        stats.files += 1;

        try {
          const content = fs.readFileSync(full, 'utf8');
          stats.lines += content.split('\n').length;
          stats.words += content.split(/\s+/).filter(Boolean).length;
        } catch {
          // Ignore unreadable files.
        }
      }
    }
  };

  walk(root);
  codeStatsCache = stats;
  return stats;
}

function collectBotStats(client) {
  const users = client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount || 0), 0)
    || client.users.cache.size;

  return {
    channels: client.channels.cache.size,
    commands: client.commands?.size || 0,
    servers: client.guilds.cache.size,
    users,
  };
}

/* ── Buttons ── */

function buildButtonsRow(activeTab, requesterId) {
  const row = new ActionRowBuilder();

  for (const tab of TABS) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${STATS_TAB_PREFIX}${tab.key}:${requesterId}`)
        .setLabel(tab.label)
        .setEmoji(tab.emoji)
        .setStyle(tab.key === activeTab ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${STATS_CLOSE_PREFIX}${requesterId}`)
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger),
  );

  return row;
}

function appendTail(container, activeTab, requesterId) {
  return container
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(buildButtonsRow(activeTab, requesterId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

/* ── Tab containers ── */

function buildAboutContainer({ client, requesterId }) {
  const botName = client.user?.username || 'Orbix';
  const headerSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${emojis.label('orbix.orbix', botName)}`,
        `**About ${botName}**`,
        `${botName} is an all-in-one Discord bot for moderation, leveling, automod, tickets, and utility — with clean Components V2 responses and zero clutter.`,
      ].join('\n')),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(getBotAvatarUrl(client, 256))
        .setDescription(`${botName} avatar`),
    );

  const container = new ContainerBuilder()
    .addSectionComponents(headerSection)
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${TAGLINE} • [Support Server](${SUPPORT_SERVER_URL})`),
    );

  return appendTail(container, 'about', requesterId);
}

function buildStatisticsContainer({
  client, codeStats, cpuPercent, requesterId,
}) {
  const memory = process.memoryUsage();
  const bot = collectBotStats(client);

  const systemLines = [
    '### <a:_blue:1319699089755209768> System',
    `> ${STAR} **Ping:** \`${getSafePing(client)}ms\`  •  **CPU:** \`${cpuPercent.toFixed(2)}%\``,
    `> ${STAR} **Memory:** \`${formatMB(memory.heapUsed)}\` / \`${formatMB(memory.heapTotal)}\`  •  **RSS:** \`${formatMB(memory.rss)}\``,
    `> ${STAR} **Uptime:** \`${formatUptime(client.uptime ?? 0)}\``,
    `> ${STAR} **Node.js:** \`${process.version}\`  •  **djs:** \`v${DJS_VERSION}\``,
  ];

  const botLines = [
    '### <a:emoji_1738789456833:1336804615739408395> Bot',
    `> ${STAR} **Servers:** \`${formatNumber(bot.servers)}\`  •  **Users:** \`${formatNumber(bot.users)}\``,
    `> ${STAR} **Channels:** \`${formatNumber(bot.channels)}\``,
    `> ${STAR} **Commands:** \`${formatNumber(bot.commands)}\``,
  ];

  const codeLines = [
    '### <a:_blue:1319699089755209768> Code',
    `> ${STAR} **Folders:** \`${formatNumber(codeStats.folders)}\`  •  **Files:** \`${formatNumber(codeStats.files)}\``,
    `> ${STAR} **Lines:** \`${formatNumber(codeStats.lines)}\`  •  **Words:** \`${formatNumber(codeStats.words)}\``,
  ];

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.label('orbix.orbix', 'Bot Statistics')}`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(systemLines.join('\n')))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(botLines.join('\n')))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(codeLines.join('\n')));

  return appendTail(container, 'statistics', requesterId);
}

function buildDevelopersContainer({ client, owner, requesterId }) {
  const botName = client.user?.username || 'Orbix';
  const bot = collectBotStats(client);
  const ownerId = BOT_OWNER_IDS[0] || null;
  const ownerMention = ownerId ? `<@${ownerId}>` : DEVELOPER_NAME;
  const ownerTag = owner?.tag || owner?.username || DEVELOPER_NAME;

  const teamLines = [
    `### ${emojis.label('orbix.orbix', `${botName} Core Team`)}`,
    'Built for clean moderation, active communities, and a polished Discord experience.',
  ];

  const ownerLines = [
    '### <:owners_specials:1527693642813411389> Owner & Developer',
    `> ${STAR} **Developer:** ${ownerMention} (\`${ownerTag}\`)`,
    ownerId ? `> ${STAR} **Discord ID:** \`${ownerId}\`` : null,
    `> ${STAR} **Instagram:** [${DEVELOPER_NAME.toLowerCase()}](${DEVELOPER_INSTAGRAM_URL})`,
  ].filter(Boolean);

  const snapshotLines = [
    '### <:Huka:1319699029231407186> Project Snapshot',
    `> ${STAR} **Servers:** \`${formatNumber(bot.servers)}\`  •  **Commands:** \`${formatNumber(bot.commands)}\``,
    `> ${STAR} **Users:** \`${formatNumber(bot.users)}\`  •  **Channels:** \`${formatNumber(bot.channels)}\``,
    `> ${STAR} **Node:** \`${process.version}\`  •  **djs:** \`v${DJS_VERSION}\``,
  ];

  const headerSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(['## Developer Information', '', ...teamLines].join('\n')),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(owner?.displayAvatarURL?.({ extension: 'png', size: 256 }) || getBotAvatarUrl(client, 256))
        .setDescription('Developer avatar'),
    );

  const container = new ContainerBuilder()
    .addSectionComponents(headerSection)
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(ownerLines.join('\n')))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(snapshotLines.join('\n')));

  return appendTail(container, 'developers', requesterId);
}

/* ── Rendering ── */

async function renderStatsPayload({ client, requesterId, tab }) {
  const active = VALID_TABS.has(tab) ? tab : 'about';
  let container;

  if (active === 'statistics') {
    const [cpuPercent, codeStats] = [await getCpuPercent(), getCodeStats()];
    container = buildStatisticsContainer({
      client, codeStats, cpuPercent, requesterId,
    });
  } else if (active === 'developers') {
    const ownerId = BOT_OWNER_IDS[0];
    const owner = ownerId ? await client.users.fetch(ownerId).catch(() => null) : null;
    container = buildDevelopersContainer({ client, owner, requesterId });
  } else {
    container = buildAboutContainer({ client, requesterId });
  }

  return cv2Payload(container, {
    allowedMentions: {
      parse: [], repliedUser: false, roles: [], users: [],
    },
  });
}

/* ── Command ── */

async function execute({ client, message }) {
  const payload = await renderStatsPayload({
    client,
    requesterId: message.author.id,
    tab: 'about',
  });

  await message.channel.send(payload);
}

async function handleTabButton({ interaction }) {
  const payload = interaction.customId.slice(STATS_TAB_PREFIX.length);
  const separatorIndex = payload.indexOf(':');
  const tab = payload.slice(0, separatorIndex);
  const requesterId = payload.slice(separatorIndex + 1);

  if (interaction.user.id !== requesterId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can use these buttons.')).catch(() => null);
    return;
  }

  try {
    const rendered = await renderStatsPayload({
      client: interaction.client,
      requesterId,
      tab,
    });
    await interaction.update(rendered);
  } catch (error) {
    const code = error?.code ?? error?.rawError?.code;

    if (IGNORED_INTERACTION_CODES.has(code)) {
      return;
    }

    console.error('[stats] Failed to switch tab:', error);
  }
}

async function handleCloseButton({ interaction }) {
  const requesterId = interaction.customId.slice(STATS_CLOSE_PREFIX.length);

  if (interaction.user.id !== requesterId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can close this panel.')).catch(() => null);
    return;
  }

  await interaction.deferUpdate().catch(() => null);
  await interaction.message.delete().catch(() => null);
}

module.exports = {
  name: 'stats',
  aliases: ['botinfo', 'botstats', 'about'],
  category: 'utility',
  description: 'Shows bot statistics, system info, and developer details in an interactive panel.',
  usage: 'LR!stats',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: STATS_TAB_PREFIX,
      execute: handleTabButton,
    },
    {
      customIdPrefix: STATS_CLOSE_PREFIX,
      execute: handleCloseButton,
    },
  ],
};
