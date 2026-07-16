const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  PermissionsBitField,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const USERINFO_DELETE_CUSTOM_ID_PREFIX = 'userinfo:delete:';

const USER_FLAG_LABELS = {
  ActiveDeveloper: '<:icons8discordactivedeveloperbadg:1504540907385520188> Active Developer',
  BugHunterLevel1: '<:icons8discordbughunterbadge48:1504541593510740048> Bug Hunter',
  BugHunterLevel2: '<:icons8discordgoldenbughunterbadg:1504541110704275526> Bug Hunter Gold',
  CertifiedModerator: '🛡️ Moderator Programs Alumni',
  HypeSquadOnlineHouse1: '<:icons8discordhypesquadbraveryhou:1504541515194830909> HypeSquad Bravery',
  HypeSquadOnlineHouse2: '<:icons8dsicordhypesquadbrilliance:1504541339746959450> HypeSquad Brilliance',
  HypeSquadOnlineHouse3: '<:icons8discordhypesquadbalancehou:1504541433099714662> HypeSquad Balance',
  Hypesquad: '<:icons8discordhypesquadeventsbadg:1504541789057585222> HypeSquad Events',
  Partner: '<:icons8discordpartnerserverownerb:1504541959145000970> Partner',
  PremiumEarlySupporter: '<:icons8discordearlysupporterbadge:1504541198302318802> Early Supporter',
  Staff: '<:icons8discordemployee48:1504542156142936134> Discord Staff',
  VerifiedDeveloper: '<:icons8discordearlyverifiedbotdev:1504541018177929457> Early Verified Bot Dev',
};

const STATUS_META = {
  dnd: { emoji: '<:dot_red:1501449585715839077>', label: 'Do Not Disturb' },
  idle: { emoji: '<:dot_yellow:1501449615675752531>', label: 'Idle' },
  offline: { emoji: '⚫', label: 'Offline' },
  online: { emoji: '<:dot_green:1501449633828962304>', label: 'Online' },
};

const KEY_PERMISSIONS = [
  ['Manage Server', PermissionsBitField.Flags.ManageGuild],
  ['Manage Roles', PermissionsBitField.Flags.ManageRoles],
  ['Manage Channels', PermissionsBitField.Flags.ManageChannels],
  ['Manage Messages', PermissionsBitField.Flags.ManageMessages],
  ['Kick Members', PermissionsBitField.Flags.KickMembers],
  ['Ban Members', PermissionsBitField.Flags.BanMembers],
  ['Timeout Members', PermissionsBitField.Flags.ModerateMembers],
  ['Mention Everyone', PermissionsBitField.Flags.MentionEveryone],
  ['Manage Nicknames', PermissionsBitField.Flags.ManageNicknames],
  ['Manage Webhooks', PermissionsBitField.Flags.ManageWebhooks],
];

/* ── Helpers ── */

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
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
    ? `${emojis.getEmoji('status.success') || '✅'} \`Yes\``
    : `${emojis.getEmoji('status.error') || '❌'} \`No\``;
}

function listKeyPermissions(permissions) {
  if (!permissions) {
    return [];
  }

  if (permissions.has(PermissionsBitField.Flags.Administrator)) {
    return ['Administrator'];
  }

  return KEY_PERMISSIONS
    .filter(([, flag]) => permissions.has(flag))
    .map(([name]) => name);
}

function formatBadges(user) {
  const flags = user.flags?.toArray?.() || [];
  const mapped = flags.map((flag) => USER_FLAG_LABELS[flag]).filter(Boolean);

  return mapped.length > 0 ? mapped.join('  •  ') : '`None`';
}

async function resolveTarget(message, args) {
  const mentioned = message.mentions.users.first();
  let userId = mentioned?.id || null;

  if (!userId && args[0] && /^\d{17,20}$/.test(args[0])) {
    userId = args[0];
  }

  if (!userId) {
    userId = message.author.id;
  }

  const user = await message.client.users.fetch(userId, { force: true }).catch(() => null);

  if (!user) {
    return { member: null, user: null };
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);

  return { member, user };
}

/* ── Containers ── */

function buildUserNotFoundContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'User Not Found')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'Could not find that user. Mention a user or provide a valid user ID.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildUserInfoContainer({ member, ownerId, user }) {
  const displayName = member?.displayName || user.globalName || user.username;
  const avatarUrl = (member || user).displayAvatarURL({ extension: 'png', forceStatic: false, size: 256 });
  const createdUnix = Math.floor(user.createdTimestamp / 1000);

  const headerSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '## <a:9_anime_Catcafe_1:1527222009401053226> User Information',
        `**${displayName}**`,
      ].join('\n')),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(avatarUrl)
        .setDescription(`${displayName} avatar`),
    );

  const accountLines = [
    '### <:icons8badge641:1504513711459795128> Account',
    `> <:star:1510658629278105800> **Username:** \`${user.username}\``,
    `> <:star:1510658629278105800> **Display Name:** \`${user.globalName || user.username}\``,
    `> <:star:1510658629278105800> **ID:** \`${user.id}\``,
    `> <:star:1510658629278105800> **Created:** <t:${createdUnix}:F> (<t:${createdUnix}:R>)`,
    `> <:star:1510658629278105800> **Badges:** ${formatBadges(user)}`,
    `> <:star:1510658629278105800> **Bot:** ${yesNo(user.bot)}`,
  ];

  const container = new ContainerBuilder()
    .addSectionComponents(headerSection)
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(accountLines.join('\n')))
    .addSeparatorComponents(createSeparator());

  if (member) {
    const joinedUnix = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
    const roleList = [...member.roles.cache.values()]
      .filter((role) => role.id !== member.guild.id)
      .sort((a, b) => b.position - a.position);
    const roleCount = roleList.length;
    const status = member.presence?.status ? STATUS_META[member.presence.status] : null;

    const memberLines = ['### <:icons_members:1527228155549716600> Server Member'];

    if (status) {
      memberLines.push(`> ${status.emoji} **Status:** \`${status.label}\``);
    }

    memberLines.push(
      `> <:star:1510658629278105800> **Nickname:** ${member.nickname ? `\`${member.nickname}\`` : '`None`'}`,
      `> <:star:1510658629278105800> **Joined:** ${joinedUnix ? `<t:${joinedUnix}:F> (<t:${joinedUnix}:R>)` : '`Unknown`'}`,
      `> <:star:1510658629278105800> **Boosting:** ${member.premiumSinceTimestamp ? `Since <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>` : '`Not Boosting`'}`,
      `> <:star:1510658629278105800> **Highest Role:** ${roleCount > 0 ? `<@&${member.roles.highest.id}>` : '`None`'}`,
    );

    const shownRoles = roleList.slice(0, 12).map((role) => `<@&${role.id}>`).join(' ');
    const rolesLines = [
      `### <:star:1510658629278105800> Roles — \`${roleCount}\``,
      roleCount > 0
        ? `> ${shownRoles}${roleCount > 12 ? ` \`+${roleCount - 12} more\`` : ''}`
        : '> `No roles`',
    ];

    const keyPerms = listKeyPermissions(member.permissions);
    const permLine = keyPerms.includes('Administrator')
      ? '> `Administrator` (All Permissions)'
      : (keyPerms.length > 0 ? `> ${keyPerms.map((perm) => `\`${perm}\``).join(' ')}` : '> `None`');

    container
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(memberLines.join('\n')))
      .addSeparatorComponents(createSeparator())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(rolesLines.join('\n')))
      .addSeparatorComponents(createSeparator())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent([
        '### <:star:1510658629278105800> Key Permissions',
        permLine,
      ].join('\n')))
      .addSeparatorComponents(createSeparator());
  } else {
    container
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${emojis.getEmoji('status.warning') || '⚠️'} This user is not a member of this server.`,
        ),
      )
      .addSeparatorComponents(createSeparator());
  }

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Avatar')
      .setURL(avatarUrl),
  );

  const bannerUrl = user.banner
    ? user.bannerURL({ extension: 'png', forceStatic: false, size: 1024 })
    : null;

  if (bannerUrl) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel('Banner')
        .setURL(bannerUrl),
    );
  }

  actionRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`${USERINFO_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Secondary),
  );

  return container
    .addActionRowComponents(actionRow)
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Requested by <@${ownerId}>`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

/* ── Command execute ── */

async function execute({ args, message }) {
  const ownerId = message.author.id;
  const { member, user } = await resolveTarget(message, args);

  if (!user) {
    await message.reply(cv2Payload(buildUserNotFoundContainer()));
    return;
  }

  await message.channel.send(cv2Payload(
    buildUserInfoContainer({ member, ownerId, user }),
    { allowedMentions: { parse: [], repliedUser: false, roles: [], users: [] } },
  ));
}

/* ── Delete handler ── */

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(USERINFO_DELETE_CUSTOM_ID_PREFIX.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can delete this panel.')).catch(() => null);
    return;
  }

  await interaction.deferUpdate().catch(() => null);

  const deleted = await interaction.message.delete()
    .then(() => true)
    .catch(() => false);

  if (!deleted) {
    await interaction.followUp(createEphemeralTextPayload('I could not delete this panel.')).catch(() => null);
  }
}

module.exports = {
  name: 'userinfo',
  aliases: ['ui', 'whois', 'user'],
  category: 'utility',
  description: 'Shows detailed information about a user or member.',
  usage: 'LR!userinfo [@user | user_id]',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: USERINFO_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
