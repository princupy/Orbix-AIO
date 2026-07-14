const { ContainerBuilder, PermissionsBitField, TextDisplayBuilder } = require('discord.js');
const { cv2Payload } = require('../../utils/cv2');
const {
  vcContainer,
  hasPerm,
  handleDelete,
  getVoiceChannels,
  vcSelectRow,
  ephemeralText,
  createSeparator,
  createFooter,
} = require('../../utils/voiceCommand');

const DEL    = 'vcmoveall:delete:';
const SELECT = 'vcmoveall:select:';

// ─── Dropdown prompt ───────────────────────────────────────────────

async function execute({ message }) {
  const ownerId = message.author.id;

  if (!hasPerm(message.member, PermissionsBitField.Flags.MoveMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Missing Permission', description: 'You need **Move Members** or **Administrator** permission.' })));
    return;
  }

  if (!hasPerm(message.guild.members.me, PermissionsBitField.Flags.MoveMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Bot Missing Permission', description: 'I need **Move Members** permission.', deletePrefix: DEL, ownerId })));
    return;
  }

  const authorVc = message.member.voice?.channel;
  if (!authorVc) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Not in Voice', description: 'You must be in a voice channel. All members there will be moved to your chosen destination.' })));
    return;
  }

  if (authorVc.members.size <= 1) {
    await message.reply(cv2Payload(vcContainer({ type: 'warning', title: 'No Members', description: `There are no other members in ${authorVc} to move.` })));
    return;
  }

  const allVc = getVoiceChannels(message.guild).filter((ch) => ch.id !== authorVc.id);
  if (!allVc.length) {
    await message.reply(cv2Payload(vcContainer({ type: 'warning', title: 'No Destinations', description: 'There are no other voice channels to move members to.' })));
    return;
  }

  const selectRow = vcSelectRow(`${SELECT}${ownerId}`, 'Select destination voice channel…', allVc);
  if (!selectRow) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'No Options', description: 'Could not build the channel list.' })));
    return;
  }

  const panel = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🔀 Move All — Select Destination'))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `All members in **${authorVc.name}** (except you) will be moved to the channel you select.`,
    ))
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(selectRow)
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooter());

  await message.reply(cv2Payload(panel));
}

// ─── Interaction: dropdown select ──────────────────────────────────

async function handleSelect({ interaction }) {
  const ownerId = interaction.customId.slice(SELECT.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(ephemeralText('Only the command user can use this menu.')).catch(() => null);
    return;
  }

  const authorVc = interaction.member?.voice?.channel;
  if (!authorVc) {
    await interaction.reply(ephemeralText('You are no longer in a voice channel.')).catch(() => null);
    return;
  }

  const destId = interaction.values[0];
  const dest = interaction.guild.channels.cache.get(destId);
  if (!dest) {
    await interaction.reply(ephemeralText('Could not find that voice channel.')).catch(() => null);
    return;
  }

  await interaction.deferUpdate().catch(() => null);

  const targets = [...authorVc.members.values()].filter((m) => m.id !== interaction.user.id);
  let done = 0;
  let failedCount = 0;

  for (const m of targets) {
    try {
      await m.voice.setChannel(dest, `vcmoveall by ${interaction.user.tag}`);
      done++;
    } catch {
      failedCount++;
    }
  }

  await interaction.followUp(ephemeralText(
    `Moved **${done}** member${done === 1 ? '' : 's'} from **${authorVc.name}** to **${dest.name}**.` +
    (failedCount > 0 ? ` (**${failedCount}** failed.)` : ''),
  )).catch(() => null);
}

module.exports = {
  name: 'vcmoveall',
  aliases: ['voicemoveall'],
  category: 'voice',
  description: 'Shows a dropdown to select a destination VC, then moves all members there.',
  usage: 'LR!vcmoveall',
  execute,
  componentHandlers: [
    { customIdPrefix: DEL,    execute: ({ interaction }) => handleDelete(interaction, DEL) },
    { customIdPrefix: SELECT, execute: handleSelect },
  ],
};
