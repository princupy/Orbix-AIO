const { PermissionsBitField } = require('discord.js');
const { cv2Payload } = require('../../utils/cv2');
const { vcContainer, hasPerm, handleDelete } = require('../../utils/voiceCommand');

const DEL = 'vcundeafenall:delete:';

async function execute({ message }) {
  const ownerId = message.author.id;

  if (!hasPerm(message.member, PermissionsBitField.Flags.DeafenMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Missing Permission', description: 'You need **Deafen Members** or **Administrator** permission.' })));
    return;
  }

  if (!hasPerm(message.guild.members.me, PermissionsBitField.Flags.DeafenMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Bot Missing Permission', description: 'I need **Deafen Members** permission.', deletePrefix: DEL, ownerId })));
    return;
  }

  const authorVc = message.member.voice?.channel;
  if (!authorVc) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Not in Voice', description: 'You must be in a voice channel to use this command.' })));
    return;
  }

  const members = [...authorVc.members.values()].filter((m) => m.voice.serverDeaf);
  if (!members.length) {
    await message.reply(cv2Payload(vcContainer({ type: 'warning', title: 'None Deafened', description: `No server-deafened members found in ${authorVc}.` })));
    return;
  }

  let done = 0;
  let failed = 0;
  for (const m of members) {
    try {
      await m.voice.setDeaf(false, `vcundeafenall by ${message.author.tag}`);
      done++;
    } catch {
      failed++;
    }
  }

  await message.channel.send(cv2Payload(vcContainer({
    type: done > 0 ? 'success' : 'error',
    title: done > 0 ? 'Members Undeafened' : 'Undeafen Failed',
    description: [
      `> **Channel:** ${authorVc}`,
      `> **Undeafened:** ${done} member${done === 1 ? '' : 's'}`,
      failed > 0 ? `> **Failed:** ${failed} member${failed === 1 ? '' : 's'}` : null,
    ].filter(Boolean).join('\n'),
    deletePrefix: DEL,
    ownerId,
  })));
}

module.exports = {
  name: 'vcundeafenall',
  aliases: ['voiceundeafenall'],
  category: 'voice',
  description: 'Removes server deafen from all members in your current voice channel.',
  usage: 'LR!vcundeafenall',
  execute,
  componentHandlers: [{ customIdPrefix: DEL, execute: ({ interaction }) => handleDelete(interaction, DEL) }],
};
