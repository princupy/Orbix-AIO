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
const { cv2Payload } = require('../../utils/cv2');

const ROLEINFO_TAB_CUSTOM_ID_PREFIX = 'roleinfo:tab:';
const IGNORED_INTERACTION_CODES = new Set([10062, 40060]);
const MEMBER_LIST_LIMIT = 20;

const TABS = [
  { emoji: '<:star:1510658629278105800>', key: 'general', label: 'General Info' },
  { emoji: '<:star:1510658629278105800>', key: 'permissions', label: 'Permissions' },
  { emoji: '<:star:1510658629278105800>', key: 'members', label: 'Members Info' },
];
const VALID_TABS = new Set(TABS.map((tab) => tab.key));

const PERMISSION_LABELS = {
  AddReactions: 'Add Reactions',
  Administrator: 'Administrator',
  AttachFiles: 'Attach Files',
  BanMembers: 'Ban Members',
  ChangeNickname: 'Change Nickname',
  Connect: 'Connect',
  CreateInstantInvite: 'Create Invite',
  CreatePrivateThreads: 'Create Private Threads',
  CreatePublicThreads: 'Create Public Threads',
  DeafenMembers: 'Deafen Members',
  EmbedLinks: 'Embed Links',
  KickMembers: 'Kick Members',
  ManageChannels: 'Manage Channels',
  ManageEvents: 'Manage Events',
  ManageGuild: 'Manage Server',
  ManageGuildExpressions: 'Manage Expressions',
  ManageMessages: 'Manage Messages',
  ManageNicknames: 'Manage Nicknames',
  ManageRoles: 'Manage Roles',
  ManageThreads: 'Manage Threads',
  ManageWebhooks: 'Manage Webhooks',
  MentionEveryone: 'Mention Everyone',
  ModerateMembers: 'Timeout Members',
  MoveMembers: 'Move Members',
  MuteMembers: 'Mute Members',
  PrioritySpeaker: 'Priority Speaker',
  ReadMessageHistory: 'Read Message History',
  SendMessages: 'Send Messages',
  SendMessagesInThreads: 'Send Messages in Threads',
  SendTTSMessages: 'Send TTS Messages',
  Speak: 'Speak',
  Stream: 'Video',
  UseApplicationCommands: 'Use Slash Commands',
  UseExternalEmojis: 'Use External Emojis',
  UseExternalStickers: 'Use External Stickers',
  UseVAD: 'Use Voice Activity',
  ViewAuditLog: 'View Audit Log',
  ViewChannel: 'View Channels',
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

function yesNo(value) {
  return value
    ? `${emojis.getEmoji('status.success') || '✅'}`
    : `${emojis.getEmoji('status.error') || '❌'}`;
}

function titleCase(flag) {
  return flag.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function formatTags(role) {
  const tags = role.tags;

  if (!tags) {
    return 'None';
  }

  const parts = [];

  if (tags.botId) {
    parts.push('Bot Role');
  }

  if (tags.integrationId) {
    parts.push('Integration Role');
  }

  if (tags.premiumSubscriberRole) {
    parts.push('Booster Role');
  }

  if (tags.availableForPurchase) {
    parts.push('Purchasable');
  }

  if (tags.guildConnections) {
    parts.push('Linked Role');
  }

  return parts.length > 0 ? parts.join(', ') : 'None';
}

function resolveRole(message, args) {
  const mentioned = message.mentions.roles.first();

  if (mentioned) {
    return mentioned;
  }

  if (args[0] && /^\d{17,20}$/.test(args[0])) {
    return message.guild.roles.cache.get(args[0]) || null;
  }

  const name = args.join(' ').trim().toLowerCase();

  if (name) {
    return message.guild.roles.cache.find((role) => role.name.toLowerCase() === name) || null;
  }

  return null;
}

/* ── Tab bodies ── */

function buildGeneralBody(role, guild) {
  const createdUnix = Math.floor(role.createdTimestamp / 1000);
  const totalRoles = guild.roles.cache.size;
  const higherThan = role.position;
  const lowerThan = Math.max(0, totalRoles - 1 - role.position);
  const memberCount = role.id === guild.id ? guild.memberCount : role.members.size;

  return [
    '### 📋 About Role',
    `> <:star:1510658629278105800> **Name:** ${role.name}`,
    `> <:star:1510658629278105800> **ID:** \`${role.id}\``,
    `> <:star:1510658629278105800> **Mention:** <@&${role.id}>`,
    `> <:star:1510658629278105800> **Created:** <t:${createdUnix}:D> (<t:${createdUnix}:R>)`,
    `> <:star:1510658629278105800> **Members:** \`${memberCount}\``,
    `> <:star:1510658629278105800> **Color:** \`${role.color === 0 ? 'Default' : role.hexColor}\``,
    '',
    '### <:icons8setting64:1527206604225777694> Role Settings',
    `> <:star:1510658629278105800> **Position:** \`${role.position}/${Math.max(1, totalRoles - 1)}\``,
    `> <:star:1510658629278105800> **Hoisted:** ${yesNo(role.hoist)}`,
    `> <:star:1510658629278105800> **Mentionable:** ${yesNo(role.mentionable)}`,
    `> <:star:1510658629278105800> **Managed:** ${yesNo(role.managed)}`,
    `> <:star:1510658629278105800> **Tags:** ${formatTags(role)}`,
    `> <:star:1510658629278105800> **Unicode Emoji:** ${role.unicodeEmoji || 'None'}`,
    '',
    '### <:star:1510658629278105800> Hierarchy Info',
    `> <:icons8up30:1527227437174227096> **Higher than:** \`${higherThan} role${higherThan === 1 ? '' : 's'}\``,
    `> <:icons8down30:1527227465951481918> **Lower than:** \`${lowerThan} role${lowerThan === 1 ? '' : 's'}\``,
    `> <:star:1510658629278105800> **Permissions Bitfield:** \`${role.permissions.bitfield.toString()}\``,
  ].join('\n');
}

function buildPermissionsBody(role) {
  if (role.permissions.has('Administrator')) {
    return [
      '### <:icons8key64:1527226959543668787> Permissions',
      `> ${emojis.getEmoji('status.success') || '✅'} **Administrator** — grants **all** permissions.`,
    ].join('\n');
  }

  const granted = role.permissions.toArray();

  if (granted.length === 0) {
    return [
      '### <:icons8key64:1527226959543668787> Permissions',
      '> `This role has no permissions.`',
    ].join('\n');
  }

  const chips = granted
    .map((flag) => `\`${PERMISSION_LABELS[flag] || titleCase(flag)}\``)
    .join(' ');

  return [
    `### <:icons8key64:1527226959543668787> Permissions — \`${granted.length}\``,
    `> ${chips}`,
  ].join('\n');
}

function buildMembersBody(role, guild) {
  if (role.id === guild.id) {
    return [
      '### <a:9_anime_Catcafe_1:1527222009401053226> Members Info',
      `> This is the **@everyone** role — every member has it.`,
      `> <a:9_anime_Catcafe_1:1527222009401053226> **Total Members:** \`${guild.memberCount.toLocaleString('en-US')}\``,
    ].join('\n');
  }

  const members = [...role.members.values()];
  const total = members.length;

  if (total === 0) {
    return [
      '### <a:9_anime_Catcafe_1:1527222009401053226> Members Info',
      '> `No members currently have this role.`',
    ].join('\n');
  }

  const shown = members.slice(0, MEMBER_LIST_LIMIT).map((member) => `<@${member.id}>`).join(' ');
  const overflow = total > MEMBER_LIST_LIMIT ? ` \`+${total - MEMBER_LIST_LIMIT} more\`` : '';

  return [
    `### <a:9_anime_Catcafe_1:1527222009401053226> Members — \`${total}\``,
    `> ${shown}${overflow}`,
  ].join('\n');
}

function buildTabBody(role, guild, tab) {
  switch (tab) {
    case 'permissions':
      return buildPermissionsBody(role);
    case 'members':
      return buildMembersBody(role, guild);
    default:
      return buildGeneralBody(role, guild);
  }
}

/* ── Buttons + container ── */

function buildTabButtons(role, activeTab, requesterId) {
  const row = new ActionRowBuilder();

  for (const tab of TABS) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${ROLEINFO_TAB_CUSTOM_ID_PREFIX}${tab.key}:${role.id}:${requesterId}`)
        .setLabel(tab.label)
        .setEmoji(tab.emoji)
        .setStyle(tab.key === activeTab ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );
  }

  return row;
}

function buildRoleInfoContainer({
  activeTab, guild, requesterId, role,
}) {
  const tab = VALID_TABS.has(activeTab) ? activeTab : 'general';
  const iconUrl = role.iconURL?.({ extension: 'png', size: 128 }) || null;
  const body = buildTabBody(role, guild, tab);

  const headerLines = [
    `## <:icons8roles64:1527207050700914758> ${role.name}`,
    'Role Information',
  ];

  const container = new ContainerBuilder();

  if (iconUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerLines.join('\n')))
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(iconUrl)
            .setDescription(`${role.name} icon`),
        ),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(headerLines.join('\n')),
    );
  }

  return container
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(buildTabButtons(role, tab, requesterId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Requested by <@${requesterId}>`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildUsageContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', 'Role Not Found')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'Mention a role, or provide its **ID** or exact **name**.\nExample: `LR!roleinfo @Staff`',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

/* ── Command execute ── */

async function execute({ args, message }) {
  const requesterId = message.author.id;
  const role = resolveRole(message, args);

  if (!role) {
    await message.reply(cv2Payload(buildUsageContainer()));
    return;
  }

  await message.channel.send(cv2Payload(
    buildRoleInfoContainer({
      activeTab: 'general',
      guild: message.guild,
      requesterId,
      role,
    }),
    { allowedMentions: { parse: [], repliedUser: false, roles: [], users: [] } },
  ));
}

/* ── Tab handler ── */

async function handleTabButton({ interaction }) {
  const payload = interaction.customId.slice(ROLEINFO_TAB_CUSTOM_ID_PREFIX.length);
  const [tab, roleId, requesterId] = payload.split(':');

  if (interaction.user.id !== requesterId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can use these buttons.')).catch(() => null);
    return;
  }

  const role = interaction.guild.roles.cache.get(roleId);

  if (!role) {
    await interaction.reply(createEphemeralTextPayload('That role no longer exists.')).catch(() => null);
    return;
  }

  const buildPayload = () => cv2Payload(
    buildRoleInfoContainer({
      activeTab: tab,
      guild: interaction.guild,
      requesterId,
      role,
    }),
    { allowedMentions: { parse: [], repliedUser: false, roles: [], users: [] } },
  );

  try {
    if (tab === 'members') {
      // Accurate role member lists need the full member cache (GuildMembers
      // intent). Fetching all members can take a moment, so defer then edit.
      await interaction.deferUpdate().catch(() => null);

      if (interaction.guild.members.cache.size < interaction.guild.memberCount) {
        await interaction.guild.members.fetch().catch(() => null);
      }

      await interaction.editReply(buildPayload());
      return;
    }

    await interaction.update(buildPayload());
  } catch (error) {
    const code = error?.code ?? error?.rawError?.code;

    if (IGNORED_INTERACTION_CODES.has(code)) {
      return;
    }

    console.error('[roleinfo] Failed to switch tab:', error);
  }
}

module.exports = {
  name: 'roleinfo',
  aliases: ['ri', 'rinfo'],
  category: 'utility',
  description: 'Shows detailed information about a server role.',
  usage: 'LR!roleinfo <@role | role_id | role name>',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: ROLEINFO_TAB_CUSTOM_ID_PREFIX,
      execute: handleTabButton,
    },
  ],
};
