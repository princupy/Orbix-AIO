const {
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const { createShipCard } = require('../../canvas/shipCard');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const ID_PATTERN = /^(?:<@!?)?(\d{17,20})>?$/;

// Special ship rules (still deterministic — same pair always gets the same number):
// - This exact pair is always a 90-100 match.
// - Anyone else paired with SHIP_LOW_USER_ID is always below 50.
const SHIP_SOULMATE_PAIR = ['881558378667716639', '1397104861782216818'];
const SHIP_LOW_USER_ID = '1397104861782216818';

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
}

async function resolveUsers(message, args) {
  const users = [];
  const seen = new Set();

  const add = (user) => {
    if (user && !seen.has(user.id)) {
      seen.add(user.id);
      users.push(user);
    }
  };

  for (const user of message.mentions.users.values()) {
    add(user);
  }

  for (const arg of args) {
    if (users.length >= 2) {
      break;
    }

    const match = String(arg).match(ID_PATTERN);

    if (match) {
      // eslint-disable-next-line no-await-in-loop
      const fetched = await message.client.users.fetch(match[1]).catch(() => null);
      add(fetched);
    }
  }

  return users;
}

function hashPair(idA, idB) {
  const key = [String(idA), String(idB)].sort().join('-');
  let hash = 0;

  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }

  return hash;
}

// Deterministic love score so the same pair always gets the same result.
function loveScore(idA, idB) {
  if (idA === idB) {
    return 100;
  }

  const hash = hashPair(idA, idB);
  const ids = [String(idA), String(idB)];

  // Forced soulmate pair: always 90-100.
  if (SHIP_SOULMATE_PAIR.every((id) => ids.includes(id))) {
    return 90 + (hash % 11);
  }

  // Anyone else paired with the low user: always below 50.
  if (ids.includes(SHIP_LOW_USER_ID)) {
    return hash % 50;
  }

  return hash % 101;
}

function makeShipName(nameA, nameB) {
  const clean = (value) => String(value || '').replace(/[^a-zA-Z0-9]/g, '');
  const a = clean(nameA) || 'love';
  const b = clean(nameB) || 'bug';
  const first = a.slice(0, Math.max(1, Math.ceil(a.length / 2)));
  const second = b.slice(Math.floor(b.length / 2)) || b.slice(-1);
  const name = first + second;

  return name.charAt(0).toUpperCase() + name.slice(1);
}

function loveMessage(pct, selfShip) {
  if (selfShip) {
    return 'Self-love is the best love! 💖';
  }

  if (pct >= 90) return 'Soulmates! Get married already! 💍';
  if (pct >= 75) return 'A match made in heaven! 💖';
  if (pct >= 60) return 'Ooh, what a lovely match! 💕';
  if (pct >= 40) return "There's definitely something here! 💫";
  if (pct >= 25) return 'Could work with a little effort. 🤔';
  if (pct >= 10) return "There's a tiny spark... barely. 🌱";
  return 'Yikes... maybe just stay friends. 💔';
}

function textBar(pct) {
  const filled = Math.round(pct / 10);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, 10 - filled))}`;
}

function avatarUrl(user) {
  return user.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 });
}

function buildShipContainer({
  filename, message, pct, shipName, userA, userB,
}) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## 💘 ${shipName}`,
        `<@${userA.id}> 💗 <@${userB.id}> — **${pct}%**`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${filename}`)
          .setDescription(`Ship result: ${pct}%`),
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`_${message}_`))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildShipContainerTextOnly({
  message, pct, shipName, userA, userB,
}) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## 💘 ${shipName}`,
        `<@${userA.id}> 💗 <@${userB.id}>`,
        '',
        `**Love:** ${pct}%`,
        `\`${textBar(pct)}\``,
        '',
        `_${message}_`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

async function execute({ args, message }) {
  const users = await resolveUsers(message, args);

  if (users.length === 0) {
    await message.reply(cv2Payload(new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent([
          `## ${emojis.label('status.warning', 'Ship Usage')}`,
          'Mention someone to ship them with you, or two people to ship together.',
          '',
          '**Examples:**',
          '> `LR!ship @user`',
          '> `LR!ship @user1 @user2`',
        ].join('\n')),
      )
      .addSeparatorComponents(createSeparator())
      .addTextDisplayComponents(createFooterText())));
    return;
  }

  const userA = users.length === 1 ? message.author : users[0];
  const userB = users.length === 1 ? users[0] : users[1];
  const selfShip = userA.id === userB.id;

  const pct = loveScore(userA.id, userB.id);
  const shipName = makeShipName(userA.username, userB.username);
  const message2 = loveMessage(pct, selfShip);

  const buffer = await createShipCard({
    message: message2,
    percent: pct,
    shipName,
    user1: { avatarURL: avatarUrl(userA), name: userA.username },
    user2: { avatarURL: avatarUrl(userB), name: userB.username },
  });

  const allowedMentions = { parse: [], repliedUser: true, roles: [], users: [] };

  if (!buffer) {
    await message.reply(cv2Payload(buildShipContainerTextOnly({
      message: message2, pct, shipName, userA, userB,
    }), { allowedMentions }));
    return;
  }

  const filename = `ship-${message.author.id}-${Date.now()}.png`;
  const attachment = new AttachmentBuilder(buffer, { description: 'Ship result', name: filename });

  await message.reply(cv2Payload(buildShipContainer({
    filename, message: message2, pct, shipName, userA, userB,
  }), { allowedMentions, files: [attachment] }));
}

module.exports = {
  name: 'ship',
  aliases: ['love', 'compatibility'],
  category: 'fun',
  description: 'Ship two people and reveal their love compatibility on a premium card.',
  usage: 'LR!ship @user [@user2]',
  noTimeout: true,
  execute,
};
