const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  FileBuilder,
  MessageFlags,
  PermissionsBitField,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const { isBotOwner } = require('../config');
const emojis = require('../emojis');
const { cv2Payload } = require('./cv2');
const {
  countOpenTicketsByUser,
  createTicketRecord,
  deleteTicketRecord,
  getTicket,
  getTicketConfig,
  nextTicketNumber,
  setTicketClaimedBy,
} = require('../supabase/tickets');

const TICKET_CREATE_ID = 'ticket:create';
const TICKET_CLOSE_ID = 'ticket:close';
const TICKET_CONFIRM_CLOSE_ID = 'ticket:confirmclose';
const TICKET_CANCEL_CLOSE_ID = 'ticket:cancelclose';
const TICKET_CLAIM_ID = 'ticket:claim';

const CHANNEL_DELETE_DELAY_MS = 5000;

/* ── Small helpers ── */

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
}

function ephemeralNotice(content) {
  return { content, flags: MessageFlags.Ephemeral };
}

function isAdmin(member) {
  return Boolean(member?.permissions?.has(PermissionsBitField.Flags.Administrator));
}

function canManageTickets(member, userId = member?.id) {
  return Boolean(
    isBotOwner(userId)
    || isAdmin(member)
    || member?.permissions?.has(PermissionsBitField.Flags.ManageGuild),
  );
}

function isSupportMember(member, config) {
  if (!member) {
    return false;
  }

  if (isAdmin(member) || member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    return true;
  }

  return Boolean(config.support_role_id && member.roles.cache.has(config.support_role_id));
}

function ticketChannelName(user, number) {
  const base = String(user.username || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return base ? `ticket-${number}-${base}`.slice(0, 95) : `ticket-${number}`;
}

/* ── UI builders ── */

function buildPanelContainer(config) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${config.panel_title}`))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(config.panel_description))
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(TICKET_CREATE_ID)
          .setLabel('Create Ticket')
          .setEmoji('🎫')
          .setStyle(ButtonStyle.Success),
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildTicketWelcome({ openerId, supportRoleId, ticketNumber }) {
  const supportLine = supportRoleId
    ? `A member of <@&${supportRoleId}> will assist you shortly.`
    : 'A staff member will assist you shortly.';

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## 🎫 Ticket #${ticketNumber}`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `Welcome <@${openerId}>!`,
        supportLine,
        '',
        'Please describe your issue in detail and wait for a response.',
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(TICKET_CLOSE_ID)
          .setLabel('Close')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(TICKET_CLAIM_ID)
          .setLabel('Claim')
          .setEmoji('🙋')
          .setStyle(ButtonStyle.Primary),
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildCloseConfirm() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.label('status.warning', 'Close Ticket')}`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Are you sure you want to close this ticket? The channel will be deleted.'),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(TICKET_CONFIRM_CLOSE_ID)
          .setLabel('Confirm Close')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(TICKET_CANCEL_CLOSE_ID)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary),
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildSimpleNotice(title, description) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildTicketLog({
  channelName, closedById, fileName, openerId, ticketNumber,
}) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.label('status.warning', 'Ticket Closed')}`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Ticket:** #${ticketNumber ?? '?'} (\`${channelName}\`)`,
        `**Opened by:** <@${openerId}> (\`${openerId}\`)`,
        `**Closed by:** <@${closedById}> (\`${closedById}\`)`,
        '',
        'Transcript attached below.',
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator());

  if (fileName) {
    container.addFileComponents(
      new FileBuilder().setURL(`attachment://${fileName}`),
    );
    container.addSeparatorComponents(createSeparator());
  }

  container.addTextDisplayComponents(createFooterText());

  return container;
}

/* ── Transcript ── */

async function buildTranscriptAttachment(channel, ticketNumber, fileName) {
  const name = fileName || `transcript-${channel.name}.txt`;
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const header = [
    `Transcript — #${channel.name} (Ticket #${ticketNumber ?? '?'})`,
    `Server: ${channel.guild.name} (${channel.guild.id})`,
    `Generated: ${new Date().toISOString()}`,
    '='.repeat(60),
    '',
  ];

  if (!messages || messages.size === 0) {
    header.push('No messages found.');
    return new AttachmentBuilder(Buffer.from(header.join('\n'), 'utf8'), { name });
  }

  const lines = [...messages.values()]
    .reverse()
    .map((message) => {
      const time = new Date(message.createdTimestamp).toISOString();
      const author = message.author?.tag || message.author?.username || 'Unknown';
      let content = message.content || '';

      if (!content && message.attachments.size > 0) {
        content = `[${message.attachments.size} attachment(s)]`;
      }

      if (!content && message.embeds.length > 0) {
        content = '[embed]';
      }

      return `[${time}] ${author}: ${content || '[no text]'}`;
    });

  return new AttachmentBuilder(Buffer.from([...header, ...lines].join('\n'), 'utf8'), { name });
}

async function sendTranscript(channel, config, ticket, closedById) {
  if (!config.log_channel_id) {
    return;
  }

  const logChannel = channel.guild.channels.cache.get(config.log_channel_id)
    || await channel.guild.channels.fetch(config.log_channel_id).catch(() => null);

  if (!logChannel?.send) {
    return;
  }

  const fileName = `transcript-${channel.name}.txt`;
  const attachment = await buildTranscriptAttachment(channel, ticket?.ticket_number, fileName);

  await logChannel.send(cv2Payload(buildTicketLog({
    channelName: channel.name,
    closedById,
    fileName,
    openerId: ticket?.opener_id || 'unknown',
    ticketNumber: ticket?.ticket_number,
  }), {
    allowedMentions: { parse: [], roles: [], users: [] },
    files: [attachment],
  })).catch((error) => {
    console.warn('[ticket] transcript send failed:', error?.message || error);
    return null;
  });
}

/* ── Component handlers ── */

async function handleCreateTicket({ interaction }) {
  const { guild } = interaction;
  const { config } = await getTicketConfig(guild.id);

  if (!config.category_id || !config.support_role_id) {
    await interaction.reply(ephemeralNotice('⚠️ The ticket system is not fully set up yet. An admin must configure the category and support role first.')).catch(() => null);
    return;
  }

  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);

  if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    await interaction.reply(ephemeralNotice('⚠️ I need the **Manage Channels** permission to create tickets.')).catch(() => null);
    return;
  }

  const openCount = await countOpenTicketsByUser(guild.id, interaction.user.id);

  if (openCount.ok && openCount.count >= config.max_open) {
    await interaction.reply(ephemeralNotice(`⚠️ You already have **${config.max_open}** open ticket${config.max_open === 1 ? '' : 's'}. Please use or close it first.`)).catch(() => null);
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);

  const category = guild.channels.cache.get(config.category_id);

  if (!category || category.type !== ChannelType.GuildCategory) {
    await interaction.editReply({ content: '⚠️ The configured ticket category no longer exists. Ask an admin to reconfigure it.' }).catch(() => null);
    return;
  }

  const numberResult = await nextTicketNumber(guild.id);
  const ticketNumber = numberResult.number;

  const channel = await guild.channels.create({
    name: ticketChannelName(interaction.user, ticketNumber),
    parent: config.category_id,
    permissionOverwrites: [
      { deny: [PermissionsBitField.Flags.ViewChannel], id: guild.id },
      {
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
        ],
        id: interaction.user.id,
      },
      {
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
        id: config.support_role_id,
      },
      {
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels,
        ],
        id: botMember.id,
      },
    ],
    reason: `Ticket #${ticketNumber} opened by ${interaction.user.tag} (${interaction.user.id})`,
    topic: `Ticket #${ticketNumber} • Opened by ${interaction.user.tag} (${interaction.user.id})`,
    type: ChannelType.GuildText,
  }).catch((error) => {
    console.warn('[ticket] channel create failed:', error?.message || error);
    return null;
  });

  if (!channel) {
    await interaction.editReply({ content: '⚠️ I could not create the ticket channel. Check my permissions and the category.' }).catch(() => null);
    return;
  }

  await createTicketRecord({
    channelId: channel.id,
    guildId: guild.id,
    openerId: interaction.user.id,
    ticketNumber,
  });

  await channel.send(cv2Payload(buildTicketWelcome({
    openerId: interaction.user.id,
    supportRoleId: config.support_role_id,
    ticketNumber,
  }), {
    allowedMentions: {
      parse: [],
      roles: config.support_role_id ? [config.support_role_id] : [],
      users: [interaction.user.id],
    },
  })).catch(() => null);

  await interaction.editReply({ content: `${emojis.getEmoji('status.success') || '✅'} Your ticket has been created: <#${channel.id}>` }).catch(() => null);
}

async function handleCloseTicket({ interaction }) {
  const { ticket } = await getTicket(interaction.channel.id);

  if (!ticket) {
    await interaction.reply(ephemeralNotice('This is not a ticket channel.')).catch(() => null);
    return;
  }

  const { config } = await getTicketConfig(interaction.guild.id);
  const isOpener = interaction.user.id === ticket.opener_id;

  if (!isOpener && !isSupportMember(interaction.member, config)) {
    await interaction.reply(ephemeralNotice('Only the ticket opener or support staff can close this ticket.')).catch(() => null);
    return;
  }

  await interaction.reply(cv2Payload(buildCloseConfirm())).catch(() => null);
}

async function handleCancelClose({ interaction }) {
  await interaction.update(cv2Payload(buildSimpleNotice(
    emojis.label('status.success', 'Close Cancelled'),
    'This ticket will stay open.',
  ))).catch(() => null);
}

async function handleConfirmClose({ interaction }) {
  const { ticket } = await getTicket(interaction.channel.id);

  if (!ticket) {
    await interaction.reply(ephemeralNotice('This is not a ticket channel.')).catch(() => null);
    return;
  }

  const { config } = await getTicketConfig(interaction.guild.id);
  const isOpener = interaction.user.id === ticket.opener_id;

  if (!isOpener && !isSupportMember(interaction.member, config)) {
    await interaction.reply(ephemeralNotice('Only the ticket opener or support staff can close this ticket.')).catch(() => null);
    return;
  }

  await interaction.update(cv2Payload(buildSimpleNotice(
    emojis.label('status.loading', 'Closing Ticket'),
    `Closed by <@${interaction.user.id}>. Generating transcript and deleting the channel...`,
  ))).catch(() => null);

  await sendTranscript(interaction.channel, config, ticket, interaction.user.id);
  await deleteTicketRecord(interaction.channel.id);

  const channel = interaction.channel;
  const timer = setTimeout(() => {
    channel.delete(`Ticket closed by ${interaction.user.tag}`).catch(() => null);
  }, CHANNEL_DELETE_DELAY_MS);
  timer.unref?.();
}

async function handleClaimTicket({ interaction }) {
  const { ticket } = await getTicket(interaction.channel.id);

  if (!ticket) {
    await interaction.reply(ephemeralNotice('This is not a ticket channel.')).catch(() => null);
    return;
  }

  const { config } = await getTicketConfig(interaction.guild.id);

  if (!isSupportMember(interaction.member, config)) {
    await interaction.reply(ephemeralNotice('Only support staff can claim tickets.')).catch(() => null);
    return;
  }

  if (ticket.claimed_by) {
    await interaction.reply(ephemeralNotice(`This ticket is already claimed by <@${ticket.claimed_by}>.`)).catch(() => null);
    return;
  }

  await setTicketClaimedBy(interaction.channel.id, interaction.user.id);

  await interaction.reply(cv2Payload(buildSimpleNotice(
    '🙋 Ticket Claimed',
    `This ticket has been claimed by <@${interaction.user.id}> and they will assist you.`,
  ), {
    allowedMentions: { parse: [], roles: [], users: [] },
  })).catch(() => null);
}

const ticketComponentHandlers = [
  { customIdPrefix: TICKET_CREATE_ID, execute: handleCreateTicket },
  { customIdPrefix: TICKET_CONFIRM_CLOSE_ID, execute: handleConfirmClose },
  { customIdPrefix: TICKET_CANCEL_CLOSE_ID, execute: handleCancelClose },
  { customIdPrefix: TICKET_CLOSE_ID, execute: handleCloseTicket },
  { customIdPrefix: TICKET_CLAIM_ID, execute: handleClaimTicket },
];

module.exports = {
  TICKET_CANCEL_CLOSE_ID,
  TICKET_CLAIM_ID,
  TICKET_CLOSE_ID,
  TICKET_CONFIRM_CLOSE_ID,
  TICKET_CREATE_ID,
  buildCloseConfirm,
  buildPanelContainer,
  buildSimpleNotice,
  canManageTickets,
  createFooterText,
  createSeparator,
  handleCancelClose,
  handleClaimTicket,
  handleCloseTicket,
  handleConfirmClose,
  handleCreateTicket,
  isSupportMember,
  sendTranscript,
  ticketComponentHandlers,
};
