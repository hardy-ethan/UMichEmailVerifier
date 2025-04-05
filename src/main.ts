import dotenv from "dotenv";
import { Client, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, CommandInteraction, MessageFlags } from "discord.js";
import express from "express";
import { OAuth2Client } from "google-auth-library";

dotenv.config();

const {
  DISCORD_TOKEN,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  SERVER_ID,
  VERIFIED_ROLE_ID,
  PORT = 3000,
} = process.env;

const discordClient = new Client({
  intents: [],
});

const oAuth2Client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

const app = express();

interface VerificationAttempt {
  discordUserID: string;
  state: string;
  timestamp: number;
}

const verificationAttempts = new Map<string, VerificationAttempt>();

discordClient.on("ready", () => {
  console.log("Ready!");
});

discordClient.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === "verify") {
    await handleVerifyCommand(interaction);
  }
});

async function handleVerifyCommand(interaction: CommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const state = Math.random().toString(36).substring(2, 15);

  verificationAttempts.set(state, {
    discordUserID: interaction.user.id,
    state,
    timestamp: Date.now(),
  });

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid"],
    state,
  });

  const embed = new EmbedBuilder()
    .setTitle("UMich Email Verification")
    .setDescription("Click the button below to verify your UMich email via Google login.\n\n" +
      "Your email address may be stored in Google systems and (temporary) application memory in order for the application to run properly, " +
      "but it will not be shared.")
    .setColor(0x4285F4);

  const verifyButton = new ButtonBuilder()
    .setLabel("Verify via Google")
    .setStyle(ButtonStyle.Link)
    .setURL(authUrl);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(verifyButton);

  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });
}

app.get("/auth/google/callback", async (req, res) => {
  const { code, state } = req.query;

  const verificationAttempt = verificationAttempts.get(state as string);
  if (!verificationAttempt) {
    res.status(400).send("Invalid verification attempt");
    return;
  }

  // No further authentication is needed since Google restricts this application
  // to only allow login via umich.edu users.

  try {
    const { tokens } = await oAuth2Client.getToken(code as string);
    oAuth2Client.setCredentials(tokens);

    const { discordUserID } = verificationAttempt;

    const guild = discordClient.guilds.cache.get(SERVER_ID as string);
    if (!guild) {
      res.status(500).send("Error finding Discord server");
      return;
    }

    try {
      const member = await guild.members.fetch(discordUserID);
      await member.roles.add(VERIFIED_ROLE_ID as string);

      verificationAttempts.delete(state as string);

      res.send(`
        <html>
          <body>
            <h1>Verification Successful!</h1>
            <p>You can close this window and return to Discord.</p>
          </body>
        </html>
      `);
      return;
    } catch (error) {
      console.error("Discord role error:", error);
      res.status(500).send("Error assigning role. Please contact a staff member.");
      return;
    }
  } catch (error) {
    console.error("Google OAuth error:", error);
    res.status(500).send("Error during Google authentication");
    return;
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

setInterval(() => {
  const now = Date.now();
  const FIFTEEN_MINUTES_IN_MS = 15 * 60 * 1000;

  for (const [state, attempt] of verificationAttempts.entries()) {
    if (now - attempt.timestamp > FIFTEEN_MINUTES_IN_MS) {
      verificationAttempts.delete(state);
    }
  }
}, 60 * 1000);

discordClient.once("ready", async () => {
  try {
    const guild = discordClient.guilds.cache.get(SERVER_ID as string);
    if (guild) {
      await guild.commands.create({
        name: "verify",
        description: "Verify your UMich email to get access to the server",
      });
      console.log("Command registered successfully");
    }
  } catch (error) {
    console.error("Error registering command:", error);
  }
});

discordClient.login(DISCORD_TOKEN);