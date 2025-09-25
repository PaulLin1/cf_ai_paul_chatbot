/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";
import type { Chat } from "./server";
import { getCurrentAgent } from "agents";

interface SongEntry {
  title: string;
  artist?: string;
}

interface Playlist {
  mood: string;
  songs: SongEntry[];
}

const globalPlaylists: Playlist[] = [];


function ensurePlaylists(agent: any) {
  if (!("playlists" in agent)) {
    agent.playlists = globalPlaylists;
  }
  return agent.playlists as Playlist[];
}


function getOrCreatePlaylist(agent: any, mood: string): Playlist {
  const playlists = ensurePlaylists(agent);
  let playlist = playlists.find(
    (p) => p.mood.toLowerCase() === mood.toLowerCase()
  );
  if (!playlist) {
    playlist = { mood, songs: [] };
    playlists.push(playlist);
  }
  return playlist;
}

// Add a new song to a mood playlist
const addSong = tool({
  description: "Add a song with an associated mood playlist",
  inputSchema: z.object({
    title: z.string(),
    artist: z.string().optional(),
    mood: z.string(),
  }),
  execute: async ({ title, artist, mood }) => {
    const { agent } = getCurrentAgent<Chat>();
    const playlist = getOrCreatePlaylist(agent!, mood);
    playlist.songs.push({ title, artist });

    return `Added "${title}"${artist ? ` by ${artist}` : ""} to your "${mood}" playlist.`;
  },
});

// Retrieve songs from a mood playlist
const getSongsByMood = tool({
  description: "Retrieve all songs in a mood playlist",
  inputSchema: z.object({
    mood: z.string(),
  }),
  execute: async ({ mood }) => {
    const { agent } = getCurrentAgent<Chat>();
    const playlists = ensurePlaylists(agent!);
    const playlist = playlists.find(
      (p) => p.mood.toLowerCase() === mood.toLowerCase()
    );

    // if (!playlist || playlist.songs.length === 0) {
    //   return `No songs found in your "${mood}" playlist.`;
    // }

    return playlist.songs
      .map((s) => `"${s.title}"${s.artist ? ` by ${s.artist}` : ""}`)
      .join(", ");
  },
});

// Recommend songs based on a mood playlist
const recommendSongs = tool({
  description:
    "Recommend songs based on your playlist for a mood, then ask if you want to add them",
  inputSchema: z.object({
    mood: z.string(),
  }),
  execute: async ({ mood }) => {
    const { agent } = getCurrentAgent<Chat>();
    const playlists = ensurePlaylists(agent!);
    const playlist = playlists.find(
      (p) => p.mood.toLowerCase() === mood.toLowerCase()
    );

    if (!playlist || playlist.songs.length === 0) {
      return `You don't have any songs in your "${mood}" playlist yet.`;
    }

    const prompt = `
      You are recommending songs similar to the user's "${mood}" playlist:
      ${playlist.songs
        .map((s) => `- "${s.title}"${s.artist ? ` by ${s.artist}` : ""}`)
        .join("\n")}

      Generate 3 similar song recommendations and ask the user: 
      "Do you want to add them to your ${mood} playlist? Reply yes or no."
    `;

    return { type: "llm_prompt", prompt, mood, playlist };
  },
});

// Confirm and add the recommended songs
const confirmAddRecommendedSongs = tool({
  description: "Add recommended songs to a mood playlist after user confirmation",
  inputSchema: z.object({
    confirm: z.boolean(),
    recommendedSongs: z.array(
      z.object({
        title: z.string(),
        artist: z.string().optional(),
      })
    ),
    mood: z.string(),
  }),
  execute: async ({ confirm, recommendedSongs, mood }) => {
    if (!confirm) return "No songs were added.";

    const { agent } = getCurrentAgent<Chat>();
    const playlist = getOrCreatePlaylist(agent!, mood);

    playlist.songs.push(...recommendedSongs);

    return `Added ${recommendedSongs.length} songs to your "${mood}" playlist.`;
  },
});

// Create a Spotify playlist from a mood playlist
const createSpotifyPlaylist = tool({
  description: "Create a Spotify playlist using fetch",
  inputSchema: z.object({
    mood: z.string(),
    playlistName: z.string(),
  }),
  execute: async ({ mood, playlistName }) => {
    const { agent } = getCurrentAgent<Chat>();
    const playlists = ensurePlaylists(agent!);
    const playlist = playlists.find(
      (p) => p.mood.toLowerCase() === mood.toLowerCase()
    );

    if (!playlist || playlist.songs.length === 0) {
      return `No songs found in your "${mood}" playlist.`;
    }

    const accessToken = process.env.SPOTIFY_ACCESS_TOKEN!;
    console.log("Access Token:", accessToken);

    const userResp = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userData = await userResp.json();

    const playlistResp = await fetch(
      `https://api.spotify.com/v1/users/${userData.id}/playlists`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: playlistName,
          description: `Playlist generated from your "${mood}" songs`,
          public: false,
        }),
      }
    );
    const createdPlaylist = await playlistResp.json();

    const trackUris: string[] = [];
    for (const song of playlist.songs) {
      const query = song.artist ? `${song.title} ${song.artist}` : song.title;
      const searchResp = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(
          query
        )}&type=track&limit=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const searchData = await searchResp.json();
      const track = searchData.tracks.items[0];
      if (track) trackUris.push(track.uri);
    }

    if (trackUris.length > 0) {
      await fetch(
        `https://api.spotify.com/v1/playlists/${createdPlaylist.id}/tracks`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uris: trackUris }),
        }
      );
    }

    return `Spotify playlist "${playlistName}" created! Listen here: ${createdPlaylist.external_urls.spotify}`;
  },
});

/**
 * Export all available tools
 */
export const tools = {
  addSong,
  getSongsByMood,
  recommendSongs,
  confirmAddRecommendedSongs,
  createSpotifyPlaylist,
} satisfies ToolSet;

export const executions = {
  getWeatherInformation: async ({ city }: { city: string }) => {
    console.log(`Getting weather information for ${city}`);
    return `The weather in ${city} is sunny`;
  },
};
