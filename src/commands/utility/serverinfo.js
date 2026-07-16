const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const SERVERINFO_TAB_CUSTOM_ID_PREFIX = 'serverinfo:tab:';
const FALLBACK_ICON = 'https://cdn.discordapp.com/embed/avatars/0.png';
const IGNORED_INTERACTION_CODES = new Set([10062, 40060]);

const TABS = [
  { emoji: '<:icons8home64:1527205267832569906>', key: 'general', label: 'General Info' },
  { emoji: '<:star:1510658629278105800>', key: 'features', label: 'Guild Features' },
  { emoji: '<:icons8roles64:1527207050700914758>', key: 'roles', label: 'Roles Info' },
  { emoji: '<:star:1510658629278105800>', key: 'other', label: 'Other Info' },
];
const VALID_TABS = new Set(TABS.map((tab) => tab.key));

const VERIFICATION_LEVELS = ['None', 'Low', 'Medium', 'High', 'Highest'];
const CONTENT_FILTERS = ['Disabled', 'No-Role Members', 'All Members'];
const NOTIFICATIONS = ['All Messages', 'Only @mentions'];
const NSFW_LEVELS = ['Default', 'Explicit', 'Safe', 'Age Restricted'];
const UPLOAD_LIMITS = ['25 MB', '25 MB', '50 MB', '100 MB'];

const FEATURE_LABELS = {
  ANIMATED_BANNER: 'Animated Banner',
  ANIMATED_ICON: 'Animated Icon',
  AUTO_MODERATION: 'AutoMod',
  BANNER: 'Banner',
  COMMUNITY: 'Community',
  DISCOVERABLE: 'Discoverable',
  INVITE_SPLASH: 'Invite Splash',
  MEMBER_VERIFICATION_GATE_ENABLED: 'Membership Screening',
  MONETIZATION_ENABLED: 'Monetization',
  NEWS: 'Announcement Channels',
  PARTNERED: 'Partnered',
  PREVIEW_ENABLED: 'Preview Enabled',
  PRIVATE_THREADS: 'Private Threads',
  ROLE_ICONS: 'Role Icons',
  VANITY_URL: 'Vanity URL',
  VERIFIED: 'Verified',
  WELCOME_SCREEN_ENABLED: 'Welcome Screen',
};

/* ── Helpers ── */

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('lr.logo') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} **Powered by Prince**`);
}

function createEphemeralTextPayload(content) {
  return cv2Payload(
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    ),
    { ephemeral: true },
  );
}

function getIconUrl(guild, size) {
  return guild.iconURL?.({ extension: 'png', forceStatic: false, size }) || null;
}

function getBannerUrl(guild, size) {
  if (!guild.banner) {
    return null;
  }

  return guild.bannerURL?.({ extension: 'png', forceStatic: false, size }) || null;
}

function titleCaseFeature(feature) {
  return feature
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatAfkTimeout(seconds) {
  if (!seconds) {
    return '`None`';
  }

  const minutes = Math.floor(seconds / 60);
  return `\`${minutes} min${minutes === 1 ? '' : 's'}\``;
}

function buildBadgeLine(guild) {
  const features = guild.features || [];
  const badges = [];

  if (features.includes('VERIFIED')) {
    badges.push('<:icons8verified64:1527203615138119742> Verified');
  }

  if (features.includes('PARTNERED')) {
    badges.push('<:icons8partner64:1527203886824427530> Partnered');
  }

  if (features.includes('COMMUNITY')) {
    badges.push('<:icons8community64:1527202983786450944> Community');
  }

  if ((guild.premiumTier || 0) > 0) {
    badges.push(`<:icons8boost48:1527204087618080798> Boost Level ${guild.premiumTier}`);
  }

  return badges.length > 0 ? badges.join('  •  ') : null;
}

/* ── Tab body builders (each returns { text, showBanner }) ── */

function buildGeneralBody(guild, owner) {
  const createdUnix = Math.floor(guild.createdTimestamp / 1000);
  const lines = [
    '### <:icons8info100:1527204290899476490> General Information',
    `> <:icons8crown64:1527204520252149931> **Owner** — <@${guild.ownerId}>${owner ? ` (\`${owner.user.tag}\`)` : ''}`,
    `> <:star:1510658629278105800> **Server ID** — \`${guild.id}\``,
    `> <:star:1510658629278105800> **Created** — <t:${createdUnix}:D> • <t:${createdUnix}:R>`,
    `> <:star:1510658629278105800> **Members** — \`${guild.memberCount.toLocaleString('en-US')}\``,
    `> <:star:1510658629278105800> **Locale** — \`${guild.preferredLocale || 'en-US'}\``,
  ];

  if (guild.vanityURLCode) {
    lines.push(`> <:star:1510658629278105800> **Vanity** — \`discord.gg/${guild.vanityURLCode}\``);
  }

  return { showBanner: true, text: lines.join('\n') };
}

function buildFeaturesBody(guild) {
  const features = guild.features || [];
  const mapped = features.map((feature) => FEATURE_LABELS[feature] || titleCaseFeature(feature));
  const boostTier = guild.premiumTier || 0;
  const boostCount = guild.premiumSubscriptionCount || 0;

  const lines = [
    '### <:star:1510658629278105800> Boost Status',
    `> **Level** \`${boostTier}\`  •  **Boosts** \`${boostCount}\``,
    '',
    `### <:star:1510658629278105800> Features — \`${mapped.length}\``,
    mapped.length > 0
      ? `> ${mapped.map((feature) => `\`${feature}\``).join(' ')}`
      : '> `This server has no special features.`',
  ];

  return { showBanner: false, text: lines.join('\n') };
}

function buildRolesBody(guild) {
  const roles = [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id)
    .sort((a, b) => b.position - a.position);

  let list = '';
  let shown = 0;

  for (const role of roles) {
    const piece = `<@&${role.id}> `;

    if (list.length + piece.length > 900) {
      break;
    }

    list += piece;
    shown += 1;
  }

  const lines = [
    `### <:star:1510658629278105800> Roles — \`${roles.length}\``,
    roles.length > 0 ? `> ${list.trim()}` : '> `No roles created yet.`',
  ];

  if (shown < roles.length) {
    lines.push('', `*...and ${roles.length - shown} more roles.*`);
  }

  return { showBanner: false, text: lines.join('\n') };
}

function buildOtherBody(guild) {
  const afkChannel = guild.afkChannelId ? `<#${guild.afkChannelId}>` : '`None`';
  const systemChannel = guild.systemChannelId ? `<#${guild.systemChannelId}>` : '`None`';
  const uploadLimit = UPLOAD_LIMITS[guild.premiumTier] || UPLOAD_LIMITS[0];

  const lines = [
    '### <:icons8setting64:1527206604225777694> Server Settings',
    `> <:star:1510658629278105800> **Verification** — \`${VERIFICATION_LEVELS[guild.verificationLevel] || 'None'}\``,
    `> <:star:1510658629278105800> **Content Filter** — \`${CONTENT_FILTERS[guild.explicitContentFilter] || 'Disabled'}\``,
    `> <:star:1510658629278105800> **Notifications** — \`${NOTIFICATIONS[guild.defaultMessageNotifications] || 'All Messages'}\``,
    `> <:star:1510658629278105800> **NSFW Level** — \`${NSFW_LEVELS[guild.nsfwLevel] || 'Default'}\``,
    `> <:star:1510658629278105800> **2FA** — \`${guild.mfaLevel ? 'Enabled' : 'Disabled'}\``,
    `> <:star:1510658629278105800> **Upload Limit** — \`${uploadLimit}\``,
    '',
    '### <:star:1510658629278105800> Channels & AFK',
    `> <:star:1510658629278105800> **AFK Channel** — ${afkChannel} • ${formatAfkTimeout(guild.afkTimeout)}`,
    `> <:star:1510658629278105800> **System Channel** — ${systemChannel}`,
    `> <:star:1510658629278105800> **Emojis** \`${guild.emojis.cache.size}\`  •  🏷️ **Stickers** \`${guild.stickers.cache.size}\``,
  ];

  return { showBanner: false, text: lines.join('\n') };
}

function buildTabBody(guild, owner, tab) {
  switch (tab) {
    case 'features':
      return buildFeaturesBody(guild);
    case 'roles':
      return buildRolesBody(guild);
    case 'other':
      return buildOtherBody(guild);
    default:
      return buildGeneralBody(guild, owner);
  }
}

/* ── Buttons + container ── */

function buildTabButtons(activeTab, requesterId) {
  const row = new ActionRowBuilder();

  for (const tab of TABS) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${SERVERINFO_TAB_CUSTOM_ID_PREFIX}${tab.key}:${requesterId}`)
        .setLabel(tab.label)
        .setEmoji(tab.emoji)
        .setStyle(tab.key === activeTab ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
  }

  return row;
}

function buildServerInfoContainer({
  activeTab, guild, owner, requesterId,
}) {
  const tab = VALID_TABS.has(activeTab) ? activeTab : 'general';
  const tabMeta = TABS.find((entry) => entry.key === tab);
  const iconUrl = getIconUrl(guild, 256) || FALLBACK_ICON;
  const bannerUrl = getBannerUrl(guild, 1024);
  const body = buildTabBody(guild, owner, tab);

  const headerLines = [
    `## ${guild.name}`,
    `${tabMeta.emoji} **${tabMeta.label}**`,
  ];

  if (guild.description) {
    headerLines.push(guild.description.slice(0, 150));
  }

  const badgeLine = buildBadgeLine(guild);

  if (badgeLine) {
    headerLines.push('', badgeLine);
  }

  const headerSection = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerLines.join('\n')))
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(iconUrl)
        .setDescription(`${guild.name} icon`),
    );

  const container = new ContainerBuilder()
    .addSectionComponents(headerSection)
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body.text))
    .addSeparatorComponents(createSeparator());

  if (body.showBanner && bannerUrl) {
    container
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(bannerUrl)
            .setDescription(`${guild.name} banner`),
        ),
      )
      .addSeparatorComponents(createSeparator());
  }

  return container
    .addActionRowComponents(buildTabButtons(tab, requesterId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Requested by <@${requesterId}>`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

/* ── Command execute ── */

async function execute({ message }) {
  const { guild } = message;
  const owner = await guild.fetchOwner().catch(() => null);

  await message.channel.send(cv2Payload(
    buildServerInfoContainer({
      activeTab: 'general',
      guild,
      owner,
      requesterId: message.author.id,
    }),
    {
      allowedMentions: { parse: [], repliedUser: false, roles: [], users: [] },
    },
  ));
}

/* ── Tab button handler ── */

async function handleTabButton({ interaction }) {
  const payload = interaction.customId.slice(SERVERINFO_TAB_CUSTOM_ID_PREFIX.length);
  const separatorIndex = payload.indexOf(':');
  const tab = payload.slice(0, separatorIndex);
  const requesterId = payload.slice(separatorIndex + 1);

  if (interaction.user.id !== requesterId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can use these buttons.')).catch(() => null);
    return;
  }

  try {
    const owner = await interaction.guild.fetchOwner().catch(() => null);

    await interaction.update(cv2Payload(
      buildServerInfoContainer({
        activeTab: tab,
        guild: interaction.guild,
        owner,
        requesterId,
      }),
      {
        allowedMentions: { parse: [], repliedUser: false, roles: [], users: [] },
      },
    ));
  } catch (error) {
    const code = error?.code ?? error?.rawError?.code;

    if (IGNORED_INTERACTION_CODES.has(code)) {
      return;
    }

    console.error('[serverinfo] Failed to switch tab:', error);
  }
}

module.exports = {
  name: 'serverinfo',
  aliases: ['server', 'si', 'guildinfo'],
  category: 'utility',
  description: 'Shows detailed information and statistics about the server.',
  usage: 'LR!serverinfo',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: SERVERINFO_TAB_CUSTOM_ID_PREFIX,
      execute: handleTabButton,
    },
  ],
};
