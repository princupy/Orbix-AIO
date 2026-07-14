const { cv2Payload } = require('../../utils/cv2');
const { vcContainer, handleDelete } = require('../../utils/voiceCommand');

const DEL = 'vclist:delete:';

const VOICE_ICONS = { human: '👤', bot: '🤖', muted: '🔇', deafened: '🔕', streaming: '📡' };

function formatMember(m) {
  const tags = [];
  if (m.voice.serverMute || m.voice.selfMute) tags.push(VOICE_ICONS.muted);
  if (m.voice.serverDeaf || m.voice.selfDeaf) tags.push(VOICE_ICONS.deafened);
  if (m.voice.streaming)                      tags.push(VOICE_ICONS.streaming);
  const icon = m.user.bot ? VOICE_ICONS.bot : VOICE_ICONS.human;
  return `${icon} ${m.user.tag}${tags.length ? '  ' + tags.join(' ') : ''}`;
}

async function execute({ message }) {
  const ownerId = message.author.id;

  const authorVc = message.member.voice?.channel;
  if (!authorVc) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Not in Voice', description: 'You must be in a voice channel to use `LR!vclist`.' })));
    return;
  }

  const members = [...authorVc.members.values()].sort((a, b) => {
    // Bots last, then alphabetical
    if (a.user.bot !== b.user.bot) return a.user.bot ? 1 : -1;
    return a.user.username.localeCompare(b.user.username);
  });

  const humans = members.filter((m) => !m.user.bot);
  const bots   = members.filter((m) => m.user.bot);

  const lines = [
    `**Channel:** ${authorVc} — **${members.length}** member${members.length === 1 ? '' : 's'}`,
    '',
    humans.length ? `**Humans (${humans.length}):**` : null,
    ...humans.map((m) => `> ${formatMember(m)}`),
    bots.length ? `\n**Bots (${bots.length}):**` : null,
    ...bots.map((m) => `> ${formatMember(m)}`),
  ].filter((l) => l !== null).join('\n');

  await message.reply(cv2Payload(vcContainer({
    type: 'success',
    title: `Voice List — ${authorVc.name}`,
    description: lines,
    deletePrefix: DEL,
    ownerId,
  })));
}

module.exports = {
  name: 'vclist',
  aliases: ['voicelist', 'vcmembers'],
  category: 'voice',
  description: 'Lists all members in your current voice channel with their state.',
  usage: 'LR!vclist',
  execute,
  componentHandlers: [{ customIdPrefix: DEL, execute: ({ interaction }) => handleDelete(interaction, DEL) }],
};
