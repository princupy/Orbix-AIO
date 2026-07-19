const { randomBytes } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { PermissionsBitField } = require('discord.js');
const {
  Connectors,
  Constants,
  LoadType,
  Shoukaku,
} = require('shoukaku');
const { LAVALINK } = require('../config');

// shoukaku 4.3.0 exposes the connection-state enum under Constants.State
// (there is no top-level `State` export), so `State.CONNECTED` works again.
const { State } = Constants;

const DEFAULT_VOLUME = 100;
const MAX_QUEUE_SIZE = 500;
const HISTORY_LIMIT = 50;
const IDLE_DISCONNECT_MS = 3 * 60 * 1000;
const EMPTY_CHANNEL_DISCONNECT_MS = 60 * 1000;
const LOOP_MODES = ['off', 'track', 'queue'];

class MusicError extends Error {
  constructor(code, userMessage, cause = null) {
    super(userMessage, cause ? { cause } : undefined);
    this.name = 'MusicError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

function createMusicError(code, userMessage, cause = null) {
  return new MusicError(code, userMessage, cause);
}

function getMusicErrorMessage(error) {
  if (error instanceof MusicError) {
    return error.userMessage;
  }

  return 'The music request could not be completed. Please try again in a moment.';
}

function isDirectIdentifier(query) {
  return /^https?:\/\//i.test(query)
    || /^(?:spotify|applemusic|deezer|yandex|soundcloud):/i.test(query)
    || /^(?:yt|ytm|sc|sp|am|dz|ym)search:/i.test(query);
}

function buildSearchIdentifier(query) {
  const normalized = String(query || '').trim();
  return isDirectIdentifier(normalized) ? normalized : `ytsearch:${normalized}`;
}

function makeRequester(user) {
  return {
    id: String(user.id),
    username: user.globalName || user.displayName || user.username || 'Unknown User',
  };
}

function normalizeTrack(track, requester, id, playlistName = null) {
  const info = track?.info || {};

  return {
    addedAt: Date.now(),
    encoded: String(track?.encoded || ''),
    id,
    info: {
      artworkUrl: info.artworkUrl || null,
      author: String(info.author || 'Unknown Artist'),
      identifier: String(info.identifier || ''),
      isSeekable: info.isSeekable !== false,
      isStream: Boolean(info.isStream),
      length: Math.max(0, Number(info.length) || 0),
      sourceName: String(info.sourceName || 'unknown'),
      title: String(info.title || 'Unknown Track'),
      uri: info.uri || null,
    },
    playlistName,
    requestedBy: requester,
  };
}

/**
 * True if a player event's track is the session's current track. Matches on the
 * queueEntryId we stored in userData (Lavalink v4 echoes it back reliably) and
 * falls back to the encoded string — the encoded value alone can differ from
 * what we sent once userData is attached, which previously broke auto-advance.
 */
function trackMatchesCurrent(event, session) {
  const current = session.current;
  const track = event?.track;

  if (!current || !track) {
    return false;
  }

  const entryId = track.userData?.queueEntryId;

  if (entryId !== undefined && entryId !== null && String(entryId) === String(current.id)) {
    return true;
  }

  return Boolean(track.encoded) && track.encoded === current.encoded;
}

function createSession({ guildId, nonce, player, textChannelId, voiceChannelId }) {
  return {
    current: null,
    destroying: false,
    emptyChannelTimer: null,
    guildId: String(guildId),
    history: [],
    idleTimer: null,
    loopMode: 'off',
    nonce,
    operation: Promise.resolve(),
    paused: false,
    player,
    playerMessageChannelId: null,
    playerMessageId: null,
    queue: [],
    startedAt: null,
    textChannelId: textChannelId ? String(textChannelId) : null,
    voiceChannelId: String(voiceChannelId),
    volume: DEFAULT_VOLUME,
  };
}

class MusicManager extends EventEmitter {
  constructor(client, lavalinkConfig = LAVALINK) {
    super();
    this.client = client;
    this.lifecycleLocks = new Map();
    this.nodeRecoveryTimer = null;
    this.sessions = new Map();
    this.trackSequence = 0;
    this.nodeOptions = {
      auth: lavalinkConfig.password,
      name: lavalinkConfig.name || 'Orbix Public Lavalink',
      secure: Boolean(lavalinkConfig.secure),
      url: `${lavalinkConfig.host}:${lavalinkConfig.port}`,
    };

    this.shoukaku = new Shoukaku(
      new Connectors.DiscordJS(client),
      [{ ...this.nodeOptions }],
      {
        moveOnDisconnect: false,
        reconnectInterval: 5,
        reconnectTries: 10,
        restTimeout: 15,
        resume: true,
        resumeByLibrary: true,
        resumeTimeout: 60,
        userAgent: 'Orbix/1.0 (Shoukaku)',
        voiceConnectionTimeout: 15,
      },
    );

    this.shoukaku.on('ready', (name, lavalinkResume, libraryResume) => {
      if (this.nodeRecoveryTimer) {
        clearTimeout(this.nodeRecoveryTimer);
        this.nodeRecoveryTimer = null;
      }

      console.log(`[music] Lavalink node "${name}" is ready (server resume: ${lavalinkResume}, library resume: ${libraryResume})`);
      this.emit('nodeReady', name);
    });

    this.shoukaku.on('error', (name, error) => {
      console.error(`[music] Lavalink node "${name}" error:`, error?.message || error);
      this.emit('nodeError', name, error);
    });

    this.shoukaku.on('close', (name, code, reason) => {
      console.warn(`[music] Lavalink node "${name}" closed (${code}): ${reason || 'No reason provided'}`);
    });

    this.shoukaku.on('disconnect', (name, movedPlayers) => {
      console.warn(`[music] Lavalink node "${name}" disconnected (${movedPlayers} player(s) moved)`);
      this.handleTerminalNodeDisconnect(name).catch((error) => {
        console.error(`[music] Failed to recover Lavalink node "${name}":`, error?.message || error);
      });
    });

    this.shoukaku.on('reconnecting', (name, attemptsLeft, intervalSeconds) => {
      console.warn(`[music] Reconnecting Lavalink node "${name}" in ${intervalSeconds}s (${attemptsLeft} attempt(s) left)`);
    });

    client.on('voiceStateUpdate', (oldState, newState) => {
      this.handleVoiceStateUpdate(oldState, newState);
    });

    client.on('guildDelete', (guild) => {
      this.disconnect(guild.id, { reason: 'guild-delete' }).catch((error) => {
        console.warn(`[music] Guild-delete cleanup failed for ${guild.id}:`, error?.message || error);
      });
    });
  }

  withGuildLifecycle(guildId, operation) {
    const key = String(guildId);
    const previous = this.lifecycleLocks.get(key) || Promise.resolve();
    const run = previous.catch(() => null).then(operation);
    this.lifecycleLocks.set(key, run);

    return run.finally(() => {
      if (this.lifecycleLocks.get(key) === run) {
        this.lifecycleLocks.delete(key);
      }
    });
  }

  async cleanupShoukakuGuild(guildId) {
    const key = String(guildId);

    if (!this.shoukaku.connections.has(key) && !this.shoukaku.players.has(key)) {
      return;
    }

    try {
      await this.shoukaku.leaveVoiceChannel(key);
    } finally {
      this.shoukaku.connections.delete(key);
      this.shoukaku.players.delete(key);
    }
  }

  scheduleNodeRecovery(name) {
    if (this.nodeRecoveryTimer) {
      return;
    }

    this.nodeRecoveryTimer = setTimeout(() => {
      this.nodeRecoveryTimer = null;

      if (!this.client.isReady?.() || this.shoukaku.nodes.has(name)) {
        return;
      }

      try {
        this.shoukaku.addNode({ ...this.nodeOptions, name });
        console.log(`[music] Re-created Lavalink node "${name}" after terminal disconnect`);
      } catch (error) {
        console.warn(`[music] Could not re-create Lavalink node "${name}":`, error?.message || error);
        this.scheduleNodeRecovery(name);
      }
    }, 5_000);
    this.nodeRecoveryTimer.unref?.();
  }

  async handleTerminalNodeDisconnect(name) {
    const affectedSessions = [...this.sessions.values()]
      .filter((session) => session.player?.node?.name === name);

    await Promise.allSettled(
      affectedSessions.map((session) => this.disconnect(session.guildId, {
        reason: 'node-disconnected',
      })),
    );
    this.scheduleNodeRecovery(name);
  }

  nextTrackId() {
    this.trackSequence = (this.trackSequence + 1) % Number.MAX_SAFE_INTEGER;
    return `${Date.now().toString(36)}${this.trackSequence.toString(36)}`;
  }

  getNode() {
    const idealNode = this.shoukaku.getIdealNode();

    if (idealNode?.state === State.CONNECTED && idealNode.sessionId) {
      return idealNode;
    }

    return [...this.shoukaku.nodes.values()].find(
      (node) => node.state === State.CONNECTED && node.sessionId,
    ) || null;
  }

  requireNode() {
    const node = this.getNode();

    if (!node) {
      throw createMusicError(
        'LAVALINK_UNAVAILABLE',
        'The public Lavalink server is currently connecting or unavailable. Please try again shortly.',
      );
    }

    return node;
  }

  getSession(guildId) {
    return this.sessions.get(String(guildId)) || null;
  }

  requireSession(guildId) {
    const session = this.getSession(guildId);

    if (!session || session.destroying) {
      throw createMusicError('NO_SESSION', 'There is no active music player in this server.');
    }

    return session;
  }

  requireMemberVoiceChannel(member) {
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      throw createMusicError('NOT_IN_VOICE', 'You must join a voice channel first.');
    }

    return voiceChannel;
  }

  assertMemberInSession(member, session) {
    const memberChannelId = member?.voice?.channelId;

    if (!memberChannelId) {
      throw createMusicError('NOT_IN_VOICE', 'You must join the active music voice channel first.');
    }

    if (String(memberChannelId) !== String(session.voiceChannelId)) {
      throw createMusicError('WRONG_VOICE', `Join <#${session.voiceChannelId}> to control this music player.`);
    }
  }

  assertExpectedTrack(session, expectedEntryId) {
    if (
      expectedEntryId
      && expectedEntryId !== '-'
      && session.current?.id !== String(expectedEntryId)
    ) {
      throw createMusicError(
        'STALE_CONTROL',
        'That player control is stale because the current track has changed. Use the latest player panel.',
      );
    }
  }

  async assertBotVoicePermissions(voiceChannel) {
    if (!voiceChannel?.isVoiceBased?.() || !voiceChannel.guild) {
      throw createMusicError('INVALID_VOICE_CHANNEL', 'That is not a supported guild voice channel.');
    }

    const botMember = voiceChannel.guild.members.me
      || await voiceChannel.guild.members.fetchMe().catch(() => null);

    if (!botMember) {
      throw createMusicError('BOT_MEMBER_MISSING', 'I could not resolve my server member permissions.');
    }

    const permissions = voiceChannel.permissionsFor(botMember);
    const required = [
      ['View Channel', PermissionsBitField.Flags.ViewChannel],
      ['Connect', PermissionsBitField.Flags.Connect],
      ['Speak', PermissionsBitField.Flags.Speak],
    ];
    const missing = required
      .filter(([, permission]) => !permissions?.has(permission))
      .map(([label]) => label);

    if (missing.length > 0) {
      throw createMusicError(
        'MISSING_VOICE_PERMISSIONS',
        `I need these permissions in ${voiceChannel}: **${missing.join(', ')}**.`,
      );
    }
  }

  async connect(options) {
    return this.withGuildLifecycle(options.guild.id, () => this.connectUnlocked(options));
  }

  async connectUnlocked({ guild, textChannelId, voiceChannel }) {
    this.requireNode();

    const existing = this.getSession(guild.id);

    if (existing) {
      if (String(existing.voiceChannelId) !== String(voiceChannel.id)) {
        throw createMusicError(
          'ALREADY_IN_VOICE',
          `I am already playing music in <#${existing.voiceChannelId}>.`,
        );
      }

      if (textChannelId) {
        existing.textChannelId = String(textChannelId);
      }

      this.clearIdleTimer(existing);
      this.clearEmptyChannelTimer(existing);
      return { created: false, session: existing };
    }

    const botVoiceChannelId = guild.members.me?.voice?.channelId;

    if (botVoiceChannelId && String(botVoiceChannelId) !== String(voiceChannel.id)) {
      throw createMusicError(
        'BOT_IN_OTHER_VOICE',
        `I am already connected to <#${botVoiceChannelId}>. Disconnect me there first.`,
      );
    }

    await this.assertBotVoicePermissions(voiceChannel);

    let player;

    try {
      player = await this.shoukaku.joinVoiceChannel({
        channelId: String(voiceChannel.id),
        deaf: true,
        guildId: String(guild.id),
        mute: false,
        shardId: guild.shardId ?? 0,
      });
    } catch (error) {
      await this.cleanupShoukakuGuild(guild.id).catch(() => null);
      throw createMusicError(
        'VOICE_CONNECT_FAILED',
        'I could not connect to that voice channel. Check my permissions and try again.',
        error,
      );
    }

    const session = createSession({
      guildId: guild.id,
      nonce: randomBytes(4).toString('hex'),
      player,
      textChannelId,
      voiceChannelId: voiceChannel.id,
    });

    this.sessions.set(String(guild.id), session);
    this.bindPlayerEvents(session);
    this.scheduleIdleDisconnect(session);
    this.emit('sessionCreated', session);

    return { created: true, session };
  }

  bindPlayerEvents(session) {
    const { player } = session;

    player.on('start', (event) => {
      if (session.destroying || !trackMatchesCurrent(event, session)) {
        return;
      }

      session.paused = false;
      session.startedAt = Date.now();
      this.clearIdleTimer(session);
      this.emit('trackStart', session, session.current);
      this.emit('stateChange', session);
    });

    player.on('end', (event) => {
      if (
        session.destroying
        || !trackMatchesCurrent(event, session)
        || !['finished', 'loadFailed'].includes(event.reason)
      ) {
        return;
      }

      this.serialize(session, async () => {
        if (!trackMatchesCurrent(event, session)) {
          return;
        }

        if (event.reason === 'loadFailed') {
          this.emit(
            'playbackError',
            session,
            createMusicError('TRACK_LOAD_FAILED', `Lavalink could not load **${session.current.info.title}**.`),
          );
        }

        await this.advanceUnlocked(session, event.reason);
      }).catch((error) => {
        console.error(`[music] Failed to advance queue in guild ${session.guildId}:`, error);
      });
    });

    player.on('exception', (event) => {
      if (session.destroying) {
        return;
      }

      const message = event?.exception?.message || 'Unknown Lavalink track exception';
      console.warn(`[music] Track exception in guild ${session.guildId}: ${message}`);
      this.emit(
        'playbackError',
        session,
        createMusicError('TRACK_EXCEPTION', `The current track encountered a playback error: ${message}`),
      );
    });

    player.on('stuck', (event) => {
      if (session.destroying) {
        return;
      }

      console.warn(`[music] Track stuck in guild ${session.guildId} after ${event?.thresholdMs || 0}ms`);
      this.serialize(session, async () => {
        if (!trackMatchesCurrent(event, session)) {
          return;
        }

        this.emit(
          'playbackError',
          session,
          createMusicError('TRACK_STUCK', 'The current track became stuck, so it was skipped.'),
        );
        await this.advanceUnlocked(session, 'stuck');
      }).catch((error) => {
        console.error(`[music] Failed to skip a stuck track in guild ${session.guildId}:`, error);
      });
    });

    player.on('closed', (event) => {
      if (!session.destroying) {
        console.warn(`[music] Discord voice websocket closed in guild ${session.guildId} (${event?.code || 'unknown'}): ${event?.reason || 'No reason'}`);
      }
    });
  }

  serialize(session, operation) {
    if (session.destroying) {
      return Promise.reject(createMusicError('SESSION_CLOSING', 'The music player is disconnecting.'));
    }

    const run = session.operation.then(operation, operation);
    session.operation = run.catch(() => null);
    return run;
  }

  async search(query) {
    const normalizedQuery = String(query || '').trim();

    if (!normalizedQuery) {
      throw createMusicError('EMPTY_QUERY', 'Provide a song name or supported music URL.');
    }

    const node = this.requireNode();
    let result;

    try {
      result = await node.rest.resolve(buildSearchIdentifier(normalizedQuery));
    } catch (error) {
      throw createMusicError(
        'SEARCH_FAILED',
        'Lavalink could not search for that track. The public node may be rate-limited or temporarily unavailable.',
        error,
      );
    }

    if (!result || result.loadType === LoadType.EMPTY) {
      throw createMusicError('NO_RESULTS', 'No playable tracks were found for that search.');
    }

    if (result.loadType === LoadType.ERROR) {
      throw createMusicError(
        'LOAD_ERROR',
        `Lavalink could not load that query: ${result.data?.message || 'Unknown load error'}`,
      );
    }

    if (result.loadType === LoadType.TRACK) {
      return {
        loadType: result.loadType,
        playlistName: null,
        tracks: [result.data],
      };
    }

    if (result.loadType === LoadType.PLAYLIST) {
      return {
        loadType: result.loadType,
        playlistName: result.data?.info?.name || 'Playlist',
        tracks: result.data?.tracks || [],
      };
    }

    const firstTrack = result.data?.[0];

    if (!firstTrack) {
      throw createMusicError('NO_RESULTS', 'No playable tracks were found for that search.');
    }

    return {
      loadType: result.loadType,
      playlistName: null,
      tracks: [firstTrack],
    };
  }

  async enqueue({ guild, query, requester, textChannelId, voiceChannel }) {
    const searchResult = await this.search(query);
    const { session } = await this.connect({ guild, textChannelId, voiceChannel });
    const requesterData = makeRequester(requester);
    const entries = searchResult.tracks
      .filter((track) => track?.encoded)
      .map((track) => normalizeTrack(
        track,
        requesterData,
        this.nextTrackId(),
        searchResult.playlistName,
      ));

    if (entries.length === 0) {
      throw createMusicError('NO_PLAYABLE_TRACKS', 'Lavalink returned no playable tracks for that query.');
    }

    return this.serialize(session, async () => {
      const availableSlots = Math.max(
        0,
        MAX_QUEUE_SIZE - session.queue.length + (session.current ? 0 : 1),
      );
      const acceptedEntries = entries.slice(0, availableSlots);

      if (acceptedEntries.length === 0) {
        throw createMusicError('QUEUE_FULL', `The queue is full (${MAX_QUEUE_SIZE} waiting tracks).`);
      }

      const position = session.current ? session.queue.length + 1 : 0;
      session.queue.push(...acceptedEntries);
      session.textChannelId = String(textChannelId);
      this.clearIdleTimer(session);

      if (!session.current) {
        await this.startNextUnlocked(session);
      } else {
        this.emit('queueChange', session);
        this.emit('stateChange', session);
      }

      return {
        addedCount: acceptedEntries.length,
        droppedCount: entries.length - acceptedEntries.length,
        entry: acceptedEntries[0],
        loadType: searchResult.loadType,
        playlistName: searchResult.playlistName,
        position,
        session,
      };
    });
  }

  async playEntryUnlocked(session, entry) {
    if (session.destroying) {
      throw createMusicError('SESSION_CLOSING', 'The music player is disconnecting.');
    }

    session.current = entry;
    session.paused = false;
    session.startedAt = Date.now();
    this.clearIdleTimer(session);

    try {
      await session.player.playTrack({
        track: {
          encoded: entry.encoded,
          userData: {
            queueEntryId: entry.id,
            requesterId: entry.requestedBy.id,
          },
        },
        volume: session.volume,
      });
    } catch (error) {
      if (session.current?.id === entry.id) {
        session.current = null;
      }

      throw createMusicError(
        'PLAY_FAILED',
        `Lavalink could not start **${entry.info.title}**.`,
        error,
      );
    }

    this.emit('stateChange', session);
    return entry;
  }

  async startNextUnlocked(session) {
    while (!session.destroying && session.queue.length > 0) {
      const next = session.queue.shift();

      try {
        await this.playEntryUnlocked(session, next);
        this.emit('queueChange', session);
        return next;
      } catch (error) {
        console.warn(`[music] Could not play queued track ${next.id} in guild ${session.guildId}:`, error?.message || error);
        this.emit('playbackError', session, error);
      }
    }

    session.current = null;
    session.paused = false;
    session.startedAt = null;
    this.emit('queueChange', session);
    this.emit('queueEnd', session);
    this.scheduleIdleDisconnect(session);
    return null;
  }

  rememberTrack(session, entry) {
    if (!entry) {
      return;
    }

    session.history.push(entry);

    if (session.history.length > HISTORY_LIMIT) {
      session.history.splice(0, session.history.length - HISTORY_LIMIT);
    }
  }

  async advanceUnlocked(session, reason = 'skipped') {
    const previous = session.current;

    if (!previous) {
      throw createMusicError('NOT_PLAYING', 'There is no track playing right now.');
    }

    if (session.loopMode === 'track' && reason === 'finished') {
      try {
        await this.playEntryUnlocked(session, previous);
        return { next: previous, previous, replayed: true };
      } catch (error) {
        this.emit('playbackError', session, error);
        this.rememberTrack(session, previous);
        session.current = null;
        const next = await this.startNextUnlocked(session);
        return { next, previous, replayed: false };
      }
    }

    const failedTrack = ['loadFailed', 'stuck'].includes(reason);

    if (!failedTrack) {
      this.rememberTrack(session, previous);
    }

    if (session.loopMode === 'queue' && !failedTrack) {
      session.queue.push(previous);
    }

    session.current = null;
    const next = await this.startNextUnlocked(session);

    if (!next && !['finished', 'loadFailed'].includes(reason)) {
      await session.player.stopTrack().catch(() => null);
    }

    this.emit('queueChange', session);
    this.emit('stateChange', session);
    return { next, previous, replayed: false };
  }

  async skip(guildId, expectedEntryId = null) {
    const session = this.requireSession(guildId);

    return this.serialize(session, () => {
      this.assertExpectedTrack(session, expectedEntryId);
      return this.advanceUnlocked(session, 'skipped');
    });
  }

  async previous(guildId, expectedEntryId = null) {
    const session = this.requireSession(guildId);

    return this.serialize(session, async () => {
      this.assertExpectedTrack(session, expectedEntryId);
      const previous = session.history.at(-1);

      if (!previous) {
        if (!session.current || !session.current.info.isSeekable) {
          throw createMusicError('NO_HISTORY', 'There is no previous track available.');
        }

        await session.player.seekTo(0);
        this.emit('stateChange', session);
        return { entry: session.current, replayed: true };
      }

      const originalCurrent = session.current;

      try {
        await this.playEntryUnlocked(session, previous);
      } catch (error) {
        session.current = originalCurrent;
        throw error;
      }

      session.history.pop();

      if (originalCurrent) {
        session.queue.unshift(originalCurrent);
      }

      this.emit('queueChange', session);
      return { entry: previous, replayed: false };
    });
  }

  async pause(guildId) {
    const session = this.requireSession(guildId);

    return this.serialize(session, async () => {
      if (!session.current) {
        throw createMusicError('NOT_PLAYING', 'There is no track playing right now.');
      }

      if (!session.paused) {
        await session.player.setPaused(true);
        session.paused = true;
        this.emit('stateChange', session);
      }

      return session;
    });
  }

  async resume(guildId) {
    const session = this.requireSession(guildId);

    return this.serialize(session, async () => {
      if (!session.current) {
        throw createMusicError('NOT_PLAYING', 'There is no track playing right now.');
      }

      if (session.paused) {
        await session.player.setPaused(false);
        session.paused = false;
        this.emit('stateChange', session);
      }

      return session;
    });
  }

  async togglePause(guildId, expectedEntryId = null) {
    const session = this.requireSession(guildId);

    return this.serialize(session, async () => {
      this.assertExpectedTrack(session, expectedEntryId);

      if (!session.current) {
        throw createMusicError('NOT_PLAYING', 'There is no track playing right now.');
      }

      const paused = !session.paused;
      await session.player.setPaused(paused);
      session.paused = paused;
      this.emit('stateChange', session);
      return paused;
    });
  }

  async setVolume(guildId, volume) {
    const session = this.requireSession(guildId);

    return this.serialize(session, async () => {
      const safeVolume = Math.max(0, Math.min(200, Math.round(Number(volume) || 0)));
      await session.player.setGlobalVolume(safeVolume);
      session.volume = safeVolume;
      this.emit('stateChange', session);
      return safeVolume;
    });
  }

  async adjustVolume(guildId, delta, expectedEntryId = null) {
    const session = this.requireSession(guildId);

    return this.serialize(session, async () => {
      this.assertExpectedTrack(session, expectedEntryId);
      const safeVolume = Math.max(
        0,
        Math.min(200, session.volume + Math.round(Number(delta) || 0)),
      );
      await session.player.setGlobalVolume(safeVolume);
      session.volume = safeVolume;
      this.emit('stateChange', session);
      return safeVolume;
    });
  }

  async cycleLoop(guildId, expectedEntryId = null) {
    const session = this.requireSession(guildId);

    return this.serialize(session, async () => {
      this.assertExpectedTrack(session, expectedEntryId);
      const currentIndex = LOOP_MODES.indexOf(session.loopMode);
      session.loopMode = LOOP_MODES[(currentIndex + 1) % LOOP_MODES.length];
      this.emit('stateChange', session);
      return session.loopMode;
    });
  }

  findQueueIndex(session, entryId) {
    return session.queue.findIndex((entry) => entry.id === String(entryId));
  }

  async playQueueEntry(guildId, entryId) {
    const session = this.requireSession(guildId);

    return this.serialize(session, async () => {
      const index = this.findQueueIndex(session, entryId);

      if (index === -1) {
        throw createMusicError('QUEUE_ENTRY_MISSING', 'That track is no longer in the queue.');
      }

      const entry = session.queue[index];
      const originalCurrent = session.current;

      try {
        await this.playEntryUnlocked(session, entry);
      } catch (error) {
        session.current = originalCurrent;
        throw error;
      }

      const committedIndex = this.findQueueIndex(session, entryId);

      if (committedIndex !== -1) {
        session.queue.splice(committedIndex, 1);
      }

      if (originalCurrent) {
        this.rememberTrack(session, originalCurrent);
      }

      this.emit('queueChange', session);
      return entry;
    });
  }

  async moveQueueEntry(guildId, entryId, direction) {
    const session = this.requireSession(guildId);

    return this.serialize(session, async () => {
      const index = this.findQueueIndex(session, entryId);

      if (index === -1) {
        throw createMusicError('QUEUE_ENTRY_MISSING', 'That track is no longer in the queue.');
      }

      const offset = direction === 'up' ? -1 : 1;
      const targetIndex = index + offset;

      if (targetIndex < 0 || targetIndex >= session.queue.length) {
        return session.queue[index];
      }

      const [entry] = session.queue.splice(index, 1);
      session.queue.splice(targetIndex, 0, entry);
      this.emit('queueChange', session);
      this.emit('stateChange', session);
      return entry;
    });
  }

  async removeQueueEntry(guildId, entryId) {
    const session = this.requireSession(guildId);

    return this.serialize(session, async () => {
      const index = this.findQueueIndex(session, entryId);

      if (index === -1) {
        throw createMusicError('QUEUE_ENTRY_MISSING', 'That track is no longer in the queue.');
      }

      const [entry] = session.queue.splice(index, 1);
      this.emit('queueChange', session);
      this.emit('stateChange', session);
      return entry;
    });
  }

  clearIdleTimer(session) {
    if (session.idleTimer) {
      clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
  }

  clearEmptyChannelTimer(session) {
    if (session.emptyChannelTimer) {
      clearTimeout(session.emptyChannelTimer);
      session.emptyChannelTimer = null;
    }
  }

  scheduleIdleDisconnect(session) {
    this.clearIdleTimer(session);

    if (session.destroying || session.current || session.queue.length > 0) {
      return;
    }

    session.idleTimer = setTimeout(() => {
      this.disconnect(session.guildId, { reason: 'idle-timeout' }).catch((error) => {
        console.warn(`[music] Idle disconnect failed in guild ${session.guildId}:`, error?.message || error);
      });
    }, IDLE_DISCONNECT_MS);
    session.idleTimer.unref?.();
  }

  scheduleEmptyChannelDisconnect(session) {
    if (session.destroying || session.emptyChannelTimer) {
      return;
    }

    session.emptyChannelTimer = setTimeout(() => {
      this.disconnect(session.guildId, { reason: 'empty-voice-channel' }).catch((error) => {
        console.warn(`[music] Empty-channel disconnect failed in guild ${session.guildId}:`, error?.message || error);
      });
    }, EMPTY_CHANNEL_DISCONNECT_MS);
    session.emptyChannelTimer.unref?.();
  }

  async disconnect(guildId, options = {}) {
    return this.withGuildLifecycle(guildId, () => this.disconnectUnlocked(guildId, options));
  }

  async disconnectUnlocked(guildId, { leaveVoice = true, reason = 'manual' } = {}) {
    const key = String(guildId);
    const session = this.getSession(key);

    if (!session) {
      if (leaveVoice || this.shoukaku.connections.has(key) || this.shoukaku.players.has(key)) {
        await this.cleanupShoukakuGuild(key).catch((error) => {
          console.warn(`[music] Failed to clean stale voice state in guild ${key}:`, error?.message || error);
        });
      }

      return null;
    }

    if (session.destroying) {
      return session;
    }

    session.destroying = true;
    this.clearIdleTimer(session);
    this.clearEmptyChannelTimer(session);
    await session.operation.catch(() => null);
    session.queue.length = 0;

    if (leaveVoice || this.shoukaku.connections.has(key) || this.shoukaku.players.has(key)) {
      await this.cleanupShoukakuGuild(key).catch((error) => {
        console.warn(`[music] Failed to leave voice in guild ${key}:`, error?.message || error);
      });
    }

    if (this.sessions.get(key) === session) {
      this.sessions.delete(key);
    }

    session.current = null;
    session.paused = false;
    this.emit('sessionEnd', session, reason);
    return session;
  }

  handleVoiceStateUpdate(oldState, newState) {
    const guildId = newState.guild?.id || oldState.guild?.id;
    const session = guildId ? this.getSession(guildId) : null;

    if (!session) {
      return;
    }

    const memberId = newState.id || oldState.id;

    if (memberId === this.client.user?.id) {
      if (!newState.channelId && oldState.channelId) {
        this.disconnect(guildId, {
          reason: 'voice-disconnected',
        }).catch((error) => {
          console.warn(`[music] Voice-state cleanup failed in guild ${guildId}:`, error?.message || error);
        });
        return;
      }

      if (newState.channelId && newState.channelId !== session.voiceChannelId) {
        session.voiceChannelId = String(newState.channelId);
        this.emit('stateChange', session);
      }
    }

    if (
      oldState.channelId !== session.voiceChannelId
      && newState.channelId !== session.voiceChannelId
    ) {
      return;
    }

    const channel = newState.guild.channels.cache.get(session.voiceChannelId)
      || oldState.guild.channels.cache.get(session.voiceChannelId);
    const hasHumanListener = channel?.members?.some((member) => !member.user.bot);

    if (hasHumanListener) {
      this.clearEmptyChannelTimer(session);
    } else {
      this.scheduleEmptyChannelDisconnect(session);
    }
  }
}

function initializeMusic(client) {
  if (client.music instanceof MusicManager) {
    return client.music;
  }

  const manager = new MusicManager(client);
  client.music = manager;
  return manager;
}

function getMusicManager(client) {
  if (!(client?.music instanceof MusicManager)) {
    throw createMusicError('MUSIC_NOT_INITIALIZED', 'The music system is not initialized yet.');
  }

  return client.music;
}

module.exports = {
  DEFAULT_VOLUME,
  EMPTY_CHANNEL_DISCONNECT_MS,
  HISTORY_LIMIT,
  IDLE_DISCONNECT_MS,
  LOOP_MODES,
  MAX_QUEUE_SIZE,
  MusicError,
  MusicManager,
  buildSearchIdentifier,
  createMusicError,
  getMusicErrorMessage,
  getMusicManager,
  initializeMusic,
};
