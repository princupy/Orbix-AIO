const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const emojis = require('../emojis');
const { cv2Payload } = require('./cv2');
const {
  createMusicError,
  getMusicErrorMessage,
  getMusicManager,
} = require('./music');

const QUEUE_PAGE_SIZE = 5;
const PLAYER_CONTROL_PREFIX = 'orbix-music:player:';
const QUEUE_CONTROL_PREFIX = 'orbix-music:queue:';
const attachedManagers = new WeakSet();

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
}

function truncate(value, maxLength) {
  const text = String(value || '');
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function escapeMarkdown(value) {
  return String(value || '').replace(/([\\`*_{}\[\]()<>#+\-.!|~])/g, '\\$1');
}

function safeHttpUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function getArtworkUrl(entry) {
  const directArtwork = safeHttpUrl(entry?.info?.artworkUrl);

  if (directArtwork) {
    return directArtwork;
  }

  if (
    /youtube/i.test(entry?.info?.sourceName || '')
    && /^[a-zA-Z0-9_-]{6,20}$/.test(entry?.info?.identifier || '')
  ) {
    return `https://i.ytimg.com/vi/${entry.info.identifier}/hqdefault.jpg`;
  }

  return null;
}

function formatDuration(milliseconds, isStream = false) {
  if (isStream) {
    return 'LIVE';
  }

  const totalSeconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function formatTrackLink(entry) {
  const title = escapeMarkdown(truncate(entry?.info?.title || 'Unknown Track', 100));
  const uri = safeHttpUrl(entry?.info?.uri);

  if (!uri) {
    return `**${title}**`;
  }

  return `[${title}](${uri.replace(/\)/g, '%29')})`;
}

function addTrackSection(container, content, entry) {
  const artworkUrl = getArtworkUrl(entry);

  if (!artworkUrl) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    return container;
  }

  const section = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(artworkUrl)
        .setDescription(`${truncate(entry.info.title, 80)} artwork`),
    );

  container.addSectionComponents(section);
  return container;
}

function playerCustomId(action, session) {
  return `${PLAYER_CONTROL_PREFIX}${action}:${session.guildId}:${session.nonce}:${session.current?.id || '-'}`;
}

function queueCustomId(action, session, page = 0, entryId = '-') {
  return `${QUEUE_CONTROL_PREFIX}${action}:${session.guildId}:${session.nonce}:${page}:${entryId}`;
}

function buildQueuedContainer({
  addedCount,
  droppedCount,
  entry,
  playlistName,
  position,
}) {
  const title = addedCount > 1
    ? `Added ${addedCount} tracks to the queue`
    : `Queued at position ${position}`;
  const detailLines = [
    `## ${title}`,
    `${formatTrackLink(entry)} by **${escapeMarkdown(truncate(entry.info.author, 80))}** | **${formatDuration(entry.info.length, entry.info.isStream)}**`,
  ];

  if (playlistName) {
    detailLines.push(`Playlist: **${escapeMarkdown(truncate(playlistName, 100))}**`);
  }

  if (droppedCount > 0) {
    detailLines.push(`Queue limit reached; **${droppedCount}** track(s) were not added.`);
  }

  const container = new ContainerBuilder();
  addTrackSection(container, detailLines.join('\n'), entry);

  return container
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildQueuedPayload(result) {
  return cv2Payload(buildQueuedContainer(result));
}

function buildPlayerControlRows(session) {
  const primaryRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(playerCustomId('previous', session))
      .setEmoji('<:icons8previous64:1527898976228216912>')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(playerCustomId('toggle', session))
      .setEmoji(session.paused ? '<:icons8play32:1497482498098331648>' : '<:icons8pause48:1497482679023571143>')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(playerCustomId('skip', session))
      .setEmoji('<:icons8skip64:1497483211679465512>')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(playerCustomId('stop', session))
      .setEmoji('<:icons8stop64:1497483365954228264>')
      .setStyle(ButtonStyle.Danger),
  );
  const secondaryRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(playerCustomId('loop', session))
      .setEmoji(session.loopMode === 'track' ? '<:Loop_track:1497471936261783662>' : '<:Loop_track:1497471936261783662>')
      .setStyle(session.loopMode === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(playerCustomId('volumeDown', session))
      .setEmoji('<:icons8speaker64:1527898636955025499>')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(session.volume <= 0),
    new ButtonBuilder()
      .setCustomId(playerCustomId('volumeUp', session))
      .setEmoji('<:icons8speaker64:1527898636955025499>')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(session.volume >= 200),
    new ButtonBuilder()
      .setCustomId(playerCustomId('queue', session))
      .setEmoji('<:icons8list64:1497492350740598794>')
      .setStyle(ButtonStyle.Secondary),
  );

  return [primaryRow, secondaryRow];
}

function buildNowPlayingContainer(session) {
  if (!session.current) {
    return buildInactivePlayerContainer('Queue finished', 'No tracks are waiting. The bot will disconnect after 3 minutes of inactivity.');
  }

  const entry = session.current;
  const status = session.paused ? 'Paused' : 'Playing';
  const loopLabel = session.loopMode === 'off'
    ? 'Off'
    : session.loopMode[0].toUpperCase() + session.loopMode.slice(1);
  const content = [
    '## <a:Heart:1326111458781696033> | Now Playing:',
    `${formatTrackLink(entry)} - ${escapeMarkdown(truncate(entry.info.author, 80))}`,
    `**Duration:** ${formatDuration(entry.info.length, entry.info.isStream)}`,
    `Requested by <@${entry.requestedBy.id}>`,
  ].join('\n');
  const container = new ContainerBuilder();
  addTrackSection(container, content, entry);

  const [primaryRow, secondaryRow] = buildPlayerControlRows(session);

  return container
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${status}** • Volume: **${session.volume}%** • Loop: **${loopLabel}** • Up next: **${session.queue.length}**`,
      ),
    )
    .addActionRowComponents(primaryRow)
    .addActionRowComponents(secondaryRow)
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildNowPlayingPayload(session) {
  return cv2Payload(buildNowPlayingContainer(session));
}

function buildInactivePlayerContainer(title, description) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}\n${description}`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildInactivePlayerPayload(title, description) {
  return cv2Payload(buildInactivePlayerContainer(title, description));
}

function buildMusicNoticeContainer({ description, title, type = 'success' }) {
  const emojiPath = type === 'error'
    ? 'status.error'
    : type === 'warning'
      ? 'status.warning'
      : 'status.success';

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.label(emojiPath, title)}\n${description}`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildMusicNoticePayload(options, payloadOptions = {}) {
  return cv2Payload(buildMusicNoticeContainer(options), payloadOptions);
}

function buildQueueTrackRow(session, entry, globalIndex, page, expanded) {
  if (!expanded) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(queueCustomId('expand', session, page, entry.id))
        .setLabel('...')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  const buttons = [
    new ButtonBuilder()
      .setCustomId(queueCustomId('play', session, page, entry.id))
      .setEmoji('<:icons8play32:1497482498098331648>')
      .setStyle(ButtonStyle.Primary),
  ];

  if (globalIndex > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(queueCustomId('up', session, page, entry.id))
        .setEmoji('<:icons8up30:1527227437174227096>')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  if (globalIndex < session.queue.length - 1) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(queueCustomId('down', session, page, entry.id))
        .setEmoji('<:icons8down30:1527227465951481918>')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(queueCustomId('remove', session, page, entry.id))
      .setEmoji('<:Delete1:1524659319071703110>')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(queueCustomId('back', session, page, entry.id))
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary),
  );

  return new ActionRowBuilder().addComponents(buttons);
}

function getQueuePage(session, page) {
  const total = session.queue.length;
  const totalPages = Math.max(1, Math.ceil(total / QUEUE_PAGE_SIZE));
  const safePage = Math.max(0, Math.min(totalPages - 1, Math.floor(Number(page) || 0)));
  const start = safePage * QUEUE_PAGE_SIZE;

  return {
    entries: session.queue.slice(start, start + QUEUE_PAGE_SIZE),
    safePage,
    start,
    total,
    totalPages,
  };
}

function buildQueueContainer(session, { expandedId = null, page = 0 } = {}) {
  const {
    entries,
    safePage,
    start,
    total,
    totalPages,
  } = getQueuePage(session, page);
  const rangeStart = total > 0 ? start + 1 : 0;
  const rangeEnd = total > 0 ? start + entries.length : 0;
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '## Music Queue',
        `Showing ${rangeStart}-${rangeEnd} of ${total} track${total === 1 ? '' : 's'}`,
        session.current
          ? `Currently playing: ${formatTrackLink(session.current)}`
          : 'Nothing is currently playing.',
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator());

  if (entries.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('The upcoming queue is empty. Add music with the `play` command.'),
    );
  } else {
    entries.forEach((entry, localIndex) => {
      const globalIndex = start + localIndex;
      const content = [
        `### ${globalIndex + 1}. <a:Heart:1326111458781696033> ${escapeMarkdown(truncate(entry.info.title, 90))}`,
        `By ${escapeMarkdown(truncate(entry.info.author, 60))} • ${formatDuration(entry.info.length, entry.info.isStream)} • Added by: ${escapeMarkdown(truncate(entry.requestedBy.username, 40))}`,
      ].join('\n');

      // Show the track artwork as a right-side thumbnail (falls back to plain
      // text when the track has no artwork), then its control row below.
      addTrackSection(container, content, entry);
      container.addActionRowComponents(
        buildQueueTrackRow(session, entry, globalIndex, safePage, expandedId === entry.id),
      );
    });
  }

  if (totalPages > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(queueCustomId('page', session, safePage - 1))
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage <= 0),
        new ButtonBuilder()
          .setCustomId(queueCustomId('page', session, safePage + 1))
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= totalPages - 1),
        new ButtonBuilder()
          .setCustomId(queueCustomId('refresh', session, safePage))
          .setLabel('Refresh')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }

  container.addSeparatorComponents(createSeparator());

  // The legend is only shown when no track is expanded. An expanded track adds
  // a full control row, and hiding the legend then keeps the message under
  // Discord's 40-component limit for Components V2.
  if (!expandedId) {
    container
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent([
          '**Button Legend:**',
          ' - Play Now • <:icons8up30:1527227437174227096> - Move Up • <:icons8down30:1527227465951481918> - Move Down • <:Delete1:1524659319071703110> - Remove',
        ].join('\n')),
      )
      .addSeparatorComponents(createSeparator());
  }

  return container.addTextDisplayComponents(createFooterText());
}

function buildQueuePayload(session, options = {}, payloadOptions = {}) {
  return cv2Payload(buildQueueContainer(session, options), payloadOptions);
}

async function resolveInteractionMember(interaction) {
  if (interaction.member?.voice) {
    return interaction.member;
  }

  return interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
}

function buildInteractionErrorPayload(content, payloadOptions = { ephemeral: true }) {
  return buildMusicNoticePayload({
    description: content,
    title: 'Music',
    type: 'error',
  }, payloadOptions);
}

async function replyEphemeral(interaction, content) {
  const payload = buildInteractionErrorPayload(content);

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => null);
    return;
  }

  await interaction.reply(payload).catch(() => null);
}

async function getControlledSession(
  manager,
  interaction,
  guildId,
  nonce,
  { expectedEntryId = null, requirePlayerPanel = false } = {},
) {
  if (!interaction.guildId || String(interaction.guildId) !== String(guildId)) {
    throw createMusicError('WRONG_GUILD', 'This music control belongs to a different server.');
  }

  const session = manager.requireSession(guildId);

  if (session.nonce !== nonce) {
    throw createMusicError('STALE_SESSION', 'This control belongs to an old music session. Use the latest panel.');
  }

  if (
    requirePlayerPanel
    && (!session.playerMessageId || interaction.message?.id !== session.playerMessageId)
  ) {
    throw createMusicError('STALE_PANEL', 'This is no longer the active player panel. Use the latest panel.');
  }

  manager.assertExpectedTrack(session, expectedEntryId);
  const member = await resolveInteractionMember(interaction);
  manager.assertMemberInSession(member, session);
  return session;
}

async function handlePlayerControl({ client, interaction }) {
  const payload = interaction.customId.slice(PLAYER_CONTROL_PREFIX.length);
  const [action, guildId, nonce, expectedEntryId] = payload.split(':');
  const manager = getMusicManager(client);
  const opensQueue = action === 'queue';

  if (opensQueue) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } else {
    await interaction.deferUpdate();
  }

  try {
    let session = await getControlledSession(manager, interaction, guildId, nonce, {
      expectedEntryId,
      requirePlayerPanel: true,
    });

    if (opensQueue) {
      await interaction.editReply(buildQueuePayload(session, {}, { ephemeral: true }));
      return;
    }

    if (action === 'previous') {
      await manager.previous(guildId, expectedEntryId);
    } else if (action === 'toggle') {
      await manager.togglePause(guildId, expectedEntryId);
    } else if (action === 'skip') {
      await manager.skip(guildId, expectedEntryId);
    } else if (action === 'stop') {
      await manager.disconnect(guildId, { reason: 'manual' });
      await interaction.editReply(buildInactivePlayerPayload(
        'Playback stopped',
        `Disconnected by <@${interaction.user.id}>.`,
      ));
      return;
    } else if (action === 'loop') {
      await manager.cycleLoop(guildId, expectedEntryId);
    } else if (action === 'volumeDown') {
      await manager.adjustVolume(guildId, -10, expectedEntryId);
    } else if (action === 'volumeUp') {
      await manager.adjustVolume(guildId, 10, expectedEntryId);
    } else {
      throw createMusicError('UNKNOWN_CONTROL', 'That music control is not supported.');
    }

    session = manager.getSession(guildId);

    if (session) {
      await interaction.editReply(buildNowPlayingPayload(session));
    }
  } catch (error) {
    const message = getMusicErrorMessage(error);

    if (opensQueue && interaction.deferred) {
      await interaction.editReply(buildInteractionErrorPayload(message, { ephemeral: true })).catch(() => null);
    } else {
      await replyEphemeral(interaction, message);
    }
  }
}

async function handleQueueControl({ client, interaction }) {
  const payload = interaction.customId.slice(QUEUE_CONTROL_PREFIX.length);
  const [action, guildId, nonce, rawPage, entryId] = payload.split(':');
  const manager = getMusicManager(client);

  await interaction.deferUpdate();

  try {
    let session = await getControlledSession(manager, interaction, guildId, nonce);
    let page = Math.max(0, Math.floor(Number(rawPage) || 0));

    if (['expand', 'back', 'page', 'refresh'].includes(action)) {
      const expandedId = action === 'expand' ? entryId : null;
      await interaction.editReply(buildQueuePayload(session, { expandedId, page }));
      return;
    }

    let expandedId = entryId;

    if (action === 'play') {
      await manager.playQueueEntry(guildId, entryId);
      expandedId = null;
    } else if (action === 'up' || action === 'down') {
      await manager.moveQueueEntry(guildId, entryId, action);
    } else if (action === 'remove') {
      await manager.removeQueueEntry(guildId, entryId);
      expandedId = null;
    } else {
      throw createMusicError('UNKNOWN_CONTROL', 'That queue control is not supported.');
    }

    session = manager.requireSession(guildId);
    const totalPages = Math.max(1, Math.ceil(session.queue.length / QUEUE_PAGE_SIZE));
    page = Math.min(page, totalPages - 1);
    await interaction.editReply(buildQueuePayload(session, { expandedId, page }));
  } catch (error) {
    await replyEphemeral(interaction, getMusicErrorMessage(error));
  }
}

async function getTextChannel(manager, channelId) {
  if (!channelId) {
    return null;
  }

  const channel = manager.client.channels.cache.get(channelId)
    || await manager.client.channels.fetch(channelId).catch(() => null);

  return channel?.isTextBased?.() && typeof channel.send === 'function' ? channel : null;
}

async function deletePreviousPanel(manager, messageId, channelId) {
  if (!messageId || !channelId) {
    return;
  }

  const channel = await getTextChannel(manager, channelId);
  const message = channel?.messages?.cache?.get(messageId)
    || await channel?.messages?.fetch?.(messageId).catch(() => null);

  if (message) {
    await message.delete().catch(() => null);
  }
}

async function upsertPlayerPanel(manager, session) {
  if (session.destroying || !session.current) {
    return null;
  }

  // Capture and clear the previous panel refs synchronously so a concurrent
  // state-change refresh cannot touch the message we are about to delete.
  const previousMessageId = session.playerMessageId;
  const previousChannelId = session.playerMessageChannelId;
  session.playerMessageId = null;
  session.playerMessageChannelId = null;

  const channel = await getTextChannel(manager, session.textChannelId);

  if (!channel) {
    return null;
  }

  // Each new track gets a fresh panel: delete the previous song's player first.
  await deletePreviousPanel(manager, previousMessageId, previousChannelId);

  const sent = await channel.send(buildNowPlayingPayload(session)).catch((error) => {
    console.warn(`[music] Failed to send player panel in guild ${session.guildId}:`, error?.message || error);
    return null;
  });

  if (sent) {
    session.playerMessageId = sent.id;
    session.playerMessageChannelId = sent.channelId;
  }

  return sent;
}

async function refreshPlayerPanel(manager, session) {
  if (!session.playerMessageId || !session.playerMessageChannelId || session.destroying) {
    return;
  }

  const channel = await getTextChannel(manager, session.playerMessageChannelId);
  const message = channel?.messages?.cache?.get(session.playerMessageId)
    || await channel?.messages?.fetch?.(session.playerMessageId).catch(() => null);

  if (!message) {
    return;
  }

  const payload = session.current
    ? buildNowPlayingPayload(session)
    : buildInactivePlayerPayload(
      'Queue finished',
      'No tracks are waiting. The bot will disconnect after 3 minutes of inactivity.',
    );
  await message.edit(payload).catch(() => null);
}

async function finishPlayerPanel(manager, session, reason) {
  if (!session.playerMessageId || !session.playerMessageChannelId) {
    return;
  }

  const channel = await getTextChannel(manager, session.playerMessageChannelId);
  const message = channel?.messages?.cache?.get(session.playerMessageId)
    || await channel?.messages?.fetch?.(session.playerMessageId).catch(() => null);

  if (!message) {
    return;
  }

  const descriptions = {
    'empty-voice-channel': 'Disconnected because everyone left the voice channel.',
    'idle-timeout': 'Disconnected after 3 minutes without queued music.',
    manual: 'Playback was stopped and the bot disconnected.',
    'voice-disconnected': 'The bot was disconnected from the voice channel.',
  };

  await message.edit(buildInactivePlayerPayload(
    'Player disconnected',
    descriptions[reason] || 'The music session has ended.',
  )).catch(() => null);
}

async function sendPlaybackError(manager, session, error) {
  const channel = await getTextChannel(manager, session.textChannelId);

  if (!channel) {
    return;
  }

  await channel.send(buildMusicNoticePayload({
    description: getMusicErrorMessage(error),
    title: 'Playback Error',
    type: 'error',
  })).catch(() => null);
}

function attachMusicUi(manager) {
  if (attachedManagers.has(manager)) {
    return manager;
  }

  attachedManagers.add(manager);
  manager.on('trackStart', (session) => {
    upsertPlayerPanel(manager, session).catch((error) => {
      console.warn('[music] Failed to update the Now Playing panel:', error?.message || error);
    });
  });
  manager.on('stateChange', (session) => {
    refreshPlayerPanel(manager, session).catch(() => null);
  });
  manager.on('queueEnd', (session) => {
    refreshPlayerPanel(manager, session).catch(() => null);
  });
  manager.on('sessionEnd', (session, reason) => {
    finishPlayerPanel(manager, session, reason).catch(() => null);
  });
  manager.on('playbackError', (session, error) => {
    sendPlaybackError(manager, session, error).catch(() => null);
  });

  return manager;
}

async function sendMusicCommandError(message, error) {
  await message.reply(buildMusicNoticePayload({
    description: getMusicErrorMessage(error),
    title: 'Music Error',
    type: 'error',
  })).catch(() => null);
}

const musicComponentHandlers = [
  { customIdPrefix: PLAYER_CONTROL_PREFIX, execute: handlePlayerControl },
  { customIdPrefix: QUEUE_CONTROL_PREFIX, execute: handleQueueControl },
];

module.exports = {
  PLAYER_CONTROL_PREFIX,
  QUEUE_CONTROL_PREFIX,
  QUEUE_PAGE_SIZE,
  attachMusicUi,
  buildInactivePlayerPayload,
  buildMusicNoticeContainer,
  buildMusicNoticePayload,
  buildNowPlayingContainer,
  buildNowPlayingPayload,
  buildQueueContainer,
  buildQueuePayload,
  buildQueuedContainer,
  buildQueuedPayload,
  formatDuration,
  getArtworkUrl,
  musicComponentHandlers,
  sendMusicCommandError,
};
