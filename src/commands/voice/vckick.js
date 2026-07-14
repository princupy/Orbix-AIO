const { PermissionsBitField } = require('discord.js');
const { cv2Payload } = require('../../utils/cv2');
const { vcContainer, extractUserId, hasPerm, handleDelete } = require('../../utils/voiceCommand');

const DEL = 'vckick:delete:';

async function execute({ message, args }) {
  const ownerId = message.author.id;

  if (!hasPerm(message.member, PermissionsBitField.Flags.MoveMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Missing Permission', description: 'You need **Move Members** or **Administrator** permission.' })));
    return;
  }

  if (!hasPerm(message.guild.members.me, PermissionsBitField.Flags.MoveMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Bot Missing Permission', description: 'I need **Move Members** permission.', deletePrefix: DEL, ownerId })));
    return;
  }

  const userId = extractUserId(args[0]);
  if (!userId) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Invalid Usage', description: '**Usage:** `LR!vckick @user`' })));
    return;
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'User Not Found', description: 'Could not find that user in this server.' })));
    return;
  }

  const vcChannel = member.voice?.channel;
  if (!vcChannel) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Not in Voice', description: `${member} is not in any voice channel.` })));
    return;
  }

  try {
    await member.voice.disconnect(`vckick by ${message.author.tag}`);
    await message.reply(cv2Payload(vcContainer({
      type: 'success',
      title: 'Kicked from Voice',
      description: `> **User:** ${member}\n> **Was in:** ${vcChannel}`,
      deletePrefix: DEL,
      ownerId,
    })));
  } catch (err) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Kick Failed', description: err.code === 50013 ? 'Missing role hierarchy or **Move Members** permission.' : err.message })));
  }
}

module.exports = {
  name: 'vckick',
  aliases: ['vcremove', 'vcdisconnect'],
  category: 'voice',
  description: 'Disconnects a user from their voice channel.',
  usage: 'LR!vckick @user',
  execute,
  componentHandlers: [{ customIdPrefix: DEL, execute: ({ interaction }) => handleDelete(interaction, DEL) }],
};
