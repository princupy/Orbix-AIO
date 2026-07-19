const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const MOVE_PREFIX = 'ttt:move:';
const SESSION_TTL = 10 * 60 * 1000;
const ID_PATTERN = /^(?:<@!?)?(\d{17,20})>?$/;

const MARKS = { O: '⭕', X: '❎' };
const EMPTY_EMOJI = '⬜';
const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

// In-memory games keyed by a short gameId embedded in the button customIds.
const games = new Map();

function createGameId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function cleanupGames() {
  const now = Date.now();

  for (const [id, game] of games) {
    if (now - game.createdAt > SESSION_TTL) {
      games.delete(id);
    }
  }
}

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

function checkWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return null;
}

function buildBoardRows(game, gameId, ended) {
  const rows = [];

  for (let r = 0; r < 3; r += 1) {
    const row = new ActionRowBuilder();

    for (let c = 0; c < 3; c += 1) {
      const idx = r * 3 + c;
      const cell = game.board[idx];
      const button = new ButtonBuilder().setCustomId(`${MOVE_PREFIX}${gameId}:${idx}`);

      if (cell === 'X') {
        button.setEmoji(MARKS.X).setStyle(ButtonStyle.Danger).setDisabled(true);
      } else if (cell === 'O') {
        button.setEmoji(MARKS.O).setStyle(ButtonStyle.Primary).setDisabled(true);
      } else {
        button.setEmoji(EMPTY_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(ended);
      }

      row.addComponents(button);
    }

    rows.push(row);
  }

  return rows;
}

function buildGameContainer(game, gameId, { ended = false, status }) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(['## ⭕ Tic Tac Toe', status].join('\n')),
    )
    .addSeparatorComponents(createSeparator());

  for (const row of buildBoardRows(game, gameId, ended)) {
    container.addActionRowComponents(row);
  }

  return container
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${MARKS.X} <@${game.players.X}>  •  ${MARKS.O} <@${game.players.O}>`),
    )
    .addTextDisplayComponents(createFooterText());
}

function turnStatus(game) {
  return `${MARKS[game.turn]} <@${game.players[game.turn]}>, it's your turn.`;
}

async function resolveOpponent(message, args) {
  const mentioned = message.mentions.users.first();

  if (mentioned) {
    return mentioned;
  }

  for (const arg of args) {
    const match = String(arg).match(ID_PATTERN);

    if (match) {
      // eslint-disable-next-line no-await-in-loop
      const fetched = await message.client.users.fetch(match[1]).catch(() => null);

      if (fetched) {
        return fetched;
      }
    }
  }

  return null;
}

function buildNotice(title, description) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

async function execute({ args, message }) {
  const opponent = await resolveOpponent(message, args);

  if (!opponent) {
    await message.reply(cv2Payload(buildNotice(
      emojis.label('status.warning', 'Tic Tac Toe'),
      'Mention someone to play against.\n**Usage:** `LR!ttt @user`',
    )));
    return;
  }

  if (opponent.bot) {
    await message.reply(cv2Payload(buildNotice(
      emojis.label('status.error', 'Invalid Opponent'),
      'You cannot play against a bot.',
    )));
    return;
  }

  if (opponent.id === message.author.id) {
    await message.reply(cv2Payload(buildNotice(
      emojis.label('status.error', 'Invalid Opponent'),
      'You cannot play against yourself.',
    )));
    return;
  }

  cleanupGames();

  const gameId = createGameId();
  const game = {
    board: Array(9).fill(''),
    createdAt: Date.now(),
    guildId: message.guild.id,
    players: { O: opponent.id, X: message.author.id },
    turn: 'X',
  };
  games.set(gameId, game);

  await message.reply(cv2Payload(buildGameContainer(game, gameId, { status: turnStatus(game) }), {
    allowedMentions: { parse: [], repliedUser: false, users: [opponent.id] },
  }));
}

async function handleMove({ interaction }) {
  const payload = interaction.customId.slice(MOVE_PREFIX.length);
  const separatorIndex = payload.lastIndexOf(':');
  const gameId = payload.slice(0, separatorIndex);
  const index = Number(payload.slice(separatorIndex + 1));
  const game = games.get(gameId);

  if (!game) {
    await interaction.reply(ephemeralNotice('This game has expired or already ended.')).catch(() => null);
    return;
  }

  const isPlayer = interaction.user.id === game.players.X || interaction.user.id === game.players.O;

  if (!isPlayer) {
    await interaction.reply(ephemeralNotice('You are not a player in this game.')).catch(() => null);
    return;
  }

  if (interaction.user.id !== game.players[game.turn]) {
    await interaction.reply(ephemeralNotice("It's not your turn yet.")).catch(() => null);
    return;
  }

  if (!Number.isInteger(index) || index < 0 || index > 8 || game.board[index] !== '') {
    await interaction.reply(ephemeralNotice('That cell is already taken.')).catch(() => null);
    return;
  }

  game.board[index] = game.turn;

  const winner = checkWinner(game.board);
  const isDraw = !winner && game.board.every((cell) => cell !== '');

  if (winner || isDraw) {
    games.delete(gameId);
    const status = winner
      ? `🎉 ${MARKS[winner]} <@${game.players[winner]}> wins!`
      : "🤝 It's a draw! Well played.";

    await interaction.update(cv2Payload(buildGameContainer(game, gameId, { ended: true, status }), {
      allowedMentions: { parse: [], roles: [], users: [] },
    })).catch(() => null);
    return;
  }

  game.turn = game.turn === 'X' ? 'O' : 'X';

  await interaction.update(cv2Payload(buildGameContainer(game, gameId, { status: turnStatus(game) }), {
    allowedMentions: { parse: [], roles: [], users: [] },
  })).catch(() => null);
}

module.exports = {
  name: 'ttt',
  aliases: ['tictactoe', 'tick'],
  category: 'fun',
  description: 'Play a game of Tic Tac Toe against another member.',
  usage: 'LR!ttt @user',
  noTimeout: true,
  execute,
  componentHandlers: [
    { customIdPrefix: MOVE_PREFIX, execute: handleMove },
  ],
};
