import dotenv from "dotenv";
import {Client} from "discord.js";

dotenv.config();

const client = new Client({intents: []});

client.on("ready", () => {
    console.log("Ready!");
});

client.login(process.env.DISCORD_TOKEN);